// Portfolio analytics: returns, volatility, correlation, parametric VaR
// contributions, beta, Sharpe, drawdown, concentration. Pure functions over
// the snapshot's symbol price history (MT5 daily closes) + optional SPY series.

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";

const Z95 = 1.645;
const TRADING_DAYS = 252;

export interface Benchmark {
  dates: string[];
  close: number[];
}

export interface Enriched {
  symbol: string;
  direction: "Long" | "Short";
  volume: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  swap: number;
  openTime: string;
  unrealizedPnl: number;
  assetClass: string;
  sector: string;
  industry: string;
  weight: number;          // |mv| / gross, as %
  pnlPct: number;          // unrealized / basis, as %
  dailyReturnPct: number;
  dailyPnl: number;
  volAnnual: number;       // %
  beta: number;            // vs SPY (NaN if unavailable)
  sharpe: number;
  maxDrawdown: number;     // %
  totalReturnPct: number;  // price first→last, %
  monthlyReturnPct: number;
  contribToReturn: number; // signed weight × position return, %
  marginalVar: number;     // VaR sensitivity (per unit weight, $-scaled)
  componentVar: number;    // $ — sums to portfolio VaR
  contribToVolPct: number; // % of portfolio risk
  hasHistory: boolean;
}

export interface CorrelationResult {
  symbols: string[];
  matrix: number[][];
  avg: number;
  highest: { a: string; b: string; r: number } | null;
  lowest: { a: string; b: string; r: number } | null;
}

export interface PortfolioAnalytics {
  positions: Enriched[];
  nPositions: number;
  longExposure: number;
  shortExposure: number;
  netExposure: number;
  grossExposure: number;
  largestWeightPct: number;
  avgPositionPct: number;
  hhi: number;
  effectiveN: number;
  top5Pct: number;
  top10Pct: number;
  portfolioVolAnnual: number; // %
  portfolioVar95: number;     // $
  correlation: CorrelationResult;
  totalUnrealized: number;
}

// ── KPI history reconstruction ─────────────────────────────────────────────────
// Values the CURRENT holdings at each day's prices (from symbol_rates), honouring
// each position's open date, to produce a daily portfolio-KPI time series for
// sparklines / deltas. Does not capture positions closed/trimmed before "now".

export interface KpiPoint {
  date: string;
  nPos: number;
  long: number;
  short: number;
  gross: number;
  net: number;
  largestPct: number;
  largestSym: string;
  avgPct: number;
  hhi: number;
  effN: number;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "15 May 2026  22:43" → "2026-05-15"
export function parseOpenDate(openTime: string): string {
  const t = openTime.trim().split(/\s+/);
  if (t.length < 3) return "";
  const dd = parseInt(t[0], 10);
  const mo = MONTHS[t[1].slice(0, 3).toLowerCase()];
  const yyyy = parseInt(t[2], 10);
  if (!Number.isFinite(dd) || mo === undefined || !Number.isFinite(yyyy)) return "";
  return `${yyyy}-${String(mo + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function buildKpiHistory(positions: Position[], rates: SymbolRates, days = 30): KpiPoint[] {
  // date axis = last `days` union dates across all held symbols' price history
  const dateSet = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  let axis = [...dateSet].sort();
  if (axis.length < 2) return [];
  axis = axis.slice(Math.max(0, axis.length - days));

  // per-symbol date→close map for ffill
  const priceMap = new Map<string, Map<string, number>>();
  for (const p of positions) {
    if (priceMap.has(p.symbol)) continue;
    const m = new Map<string, number>();
    (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i]));
    priceMap.set(p.symbol, m);
  }
  const openOf = new Map<Position, string>();
  for (const p of positions) openOf.set(p, parseOpenDate(p.openTime));
  const carry = new Map<string, number>(); // last known close per symbol

  const out: KpiPoint[] = [];
  axis.forEach((date, idx) => {
    const isLast = idx === axis.length - 1;
    // update carry with any close available on this date
    for (const p of positions) {
      const c = priceMap.get(p.symbol)?.get(date);
      if (c !== undefined) carry.set(p.symbol, c);
    }
    let long = 0, short = 0;
    const mvs: { mv: number; sym: string }[] = [];
    for (const p of positions) {
      const opened = openOf.get(p)!;
      if (opened && opened > date) continue; // not yet open on this day
      let mv: number;
      if (isLast) mv = p.marketValue; // anchor today to live values
      else {
        const px = carry.get(p.symbol);
        mv = px !== undefined ? p.volume * px : p.marketValue;
      }
      const abs = Math.abs(mv);
      if (p.direction === "Short") short += abs;
      else long += abs;
      mvs.push({ mv: abs, sym: p.symbol });
    }
    const gross = long + short || 1;
    const weights = mvs.map((m) => m.mv / gross);
    const hhi = weights.reduce((s, w) => s + w * w, 0);
    let largestPct = 0, largestSym = "";
    for (const m of mvs) {
      const w = (m.mv / gross) * 100;
      if (w > largestPct) { largestPct = w; largestSym = m.sym; }
    }
    out.push({
      date,
      nPos: mvs.length,
      long,
      short,
      gross: long + short,
      net: long - short,
      largestPct,
      largestSym,
      avgPct: mvs.length ? 100 / mvs.length : 0,
      hhi,
      effN: hhi > 0 ? 1 / hhi : 0,
    });
  });
  return out;
}

// ── math helpers ──────────────────────────────────────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function pctReturns(close: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < close.length; i++) {
    if (close[i - 1] > 0) r.push(close[i] / close[i - 1] - 1);
  }
  return r;
}

function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

function correlation(a: number[], b: number[]): number {
  const sa = stdev(a);
  const sb = stdev(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
}

function maxDrawdownPct(close: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const c of close) {
    if (c > peak) peak = c;
    if (peak > 0) mdd = Math.min(mdd, c / peak - 1);
  }
  return mdd * 100;
}

// Align daily returns across symbols over their overlapping date window.
function alignReturns(
  rates: SymbolRates,
  symbols: string[],
): { dates: string[]; returns: Record<string, number[]> } {
  const usable = symbols.filter((s) => rates[s] && rates[s].dates.length > 2);
  if (!usable.length) return { dates: [], returns: {} };

  const maps = new Map<string, Map<string, number>>();
  for (const s of usable) {
    const m = new Map<string, number>();
    rates[s].dates.forEach((d, i) => m.set(d, rates[s].close[i]));
    maps.set(s, m);
  }
  const start = usable.map((s) => rates[s].dates[0]).sort().reverse()[0];
  const end = usable.map((s) => rates[s].dates[rates[s].dates.length - 1]).sort()[0];

  const dateSet = new Set<string>();
  for (const s of usable) for (const d of rates[s].dates) if (d >= start && d <= end) dateSet.add(d);
  const dates = [...dateSet].sort();
  if (dates.length < 3) return { dates: [], returns: {} };

  const returns: Record<string, number[]> = {};
  for (const s of usable) {
    const m = maps.get(s)!;
    const aligned: number[] = [];
    let carry = NaN;
    for (const d of dates) {
      const v = m.get(d);
      if (v !== undefined) carry = v;
      aligned.push(carry);
    }
    returns[s] = pctReturns(aligned.filter((x) => Number.isFinite(x)));
  }
  return { dates, returns };
}

function benchmarkReturnsByDate(b?: Benchmark): Map<string, number> {
  const out = new Map<string, number>();
  if (!b || b.close.length < 2) return out;
  for (let i = 1; i < b.close.length; i++) {
    if (b.close[i - 1] > 0) out.set(b.dates[i], b.close[i] / b.close[i - 1] - 1);
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────

export function buildAnalytics(positions: Position[], rates: SymbolRates, benchmark?: Benchmark): PortfolioAnalytics {
  const grossExposure = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const longExposure = positions.filter((p) => p.direction === "Long").reduce((s, p) => s + Math.abs(p.marketValue), 0);
  const shortExposure = positions.filter((p) => p.direction === "Short").reduce((s, p) => s + Math.abs(p.marketValue), 0);

  const symbols = positions.map((p) => p.symbol);
  const { returns } = alignReturns(rates, symbols);
  const benchMap = benchmarkReturnsByDate(benchmark);

  // signed weights (long +, short −), Σ|w| = 1
  const signedW: Record<string, number> = {};
  for (const p of positions) {
    const w = (Math.abs(p.marketValue) / grossExposure) * (p.direction === "Short" ? -1 : 1);
    signedW[p.symbol] = (signedW[p.symbol] ?? 0) + w;
  }

  // covariance matrix over symbols that have return history (daily)
  const histSyms = [...new Set(positions.map((p) => p.symbol))].filter((s) => returns[s]?.length >= 2);
  const minLen = histSyms.length ? Math.min(...histSyms.map((s) => returns[s].length)) : 0;
  const trimmed: Record<string, number[]> = {};
  for (const s of histSyms) trimmed[s] = returns[s].slice(returns[s].length - minLen);

  const cov: Record<string, Record<string, number>> = {};
  for (const a of histSyms) {
    cov[a] = {};
    for (const b of histSyms) cov[a][b] = covariance(trimmed[a], trimmed[b]);
  }

  // portfolio daily variance via signed weights
  let portVar = 0;
  for (const a of histSyms) for (const b of histSyms) portVar += signedW[a] * signedW[b] * cov[a][b];
  const portVolDaily = Math.sqrt(Math.max(portVar, 0));
  const portfolioVolAnnual = portVolDaily * Math.sqrt(TRADING_DAYS) * 100;
  const portfolioVar95 = Z95 * portVolDaily * grossExposure;

  // marginal / component VaR per symbol
  const sigmaW: Record<string, number> = {};
  for (const a of histSyms) {
    let acc = 0;
    for (const b of histSyms) acc += cov[a][b] * signedW[b];
    sigmaW[a] = acc; // (Σw)_a
  }

  const enriched: Enriched[] = positions.map((p) => {
    const c = classify(p.symbol);
    const basis = Math.abs(p.entryPrice * p.volume);
    const series = rates[p.symbol];
    const close = series?.close ?? [];
    const ret = returns[p.symbol] ?? [];
    const hasHistory = ret.length >= 2;

    const dailyReturnPct = close.length >= 2 ? (close[close.length - 1] / close[close.length - 2] - 1) * 100 : 0;
    const volAnnual = hasHistory ? stdev(ret) * Math.sqrt(TRADING_DAYS) * 100 : 0;
    const totalReturnPct = close.length >= 2 ? (close[close.length - 1] / close[0] - 1) * 100 : 0;
    const monthlyReturnPct =
      close.length >= 22 ? (close[close.length - 1] / close[close.length - 22] - 1) * 100 : totalReturnPct;
    const sharpe = hasHistory && stdev(ret) > 0 ? (mean(ret) / stdev(ret)) * Math.sqrt(TRADING_DAYS) : 0;
    const mdd = maxDrawdownPct(close);

    // beta vs SPY over overlapping dates
    let beta = NaN;
    if (benchMap.size && series && series.dates.length > 2) {
      const ar: number[] = [];
      const br: number[] = [];
      for (let i = 1; i < series.dates.length; i++) {
        const bd = benchMap.get(series.dates[i]);
        if (bd !== undefined && series.close[i - 1] > 0) {
          ar.push(series.close[i] / series.close[i - 1] - 1);
          br.push(bd);
        }
      }
      const vb = stdev(br) ** 2;
      if (ar.length >= 3 && vb > 0) beta = covariance(ar, br) / vb;
    }

    const w = signedW[p.symbol];
    const marginalVar = portVolDaily > 0 ? (Z95 * sigmaW[p.symbol]) / portVolDaily : 0;
    const componentVar = portVolDaily > 0 ? (Z95 * w * sigmaW[p.symbol] * grossExposure) / portVolDaily : 0;
    const contribToVolPct = portfolioVar95 > 0 ? (componentVar / portfolioVar95) * 100 : 0;
    const pnlPct = basis > 0 ? (p.unrealizedPnl / basis) * 100 : 0;

    return {
      symbol: p.symbol,
      direction: p.direction,
      volume: p.volume,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      marketValue: p.marketValue,
      swap: p.swap,
      openTime: p.openTime,
      unrealizedPnl: p.unrealizedPnl,
      assetClass: c.assetClass,
      sector: c.sector,
      industry: c.industry,
      weight: (Math.abs(p.marketValue) / grossExposure) * 100,
      pnlPct,
      dailyReturnPct,
      dailyPnl: (dailyReturnPct / 100) * p.marketValue,
      volAnnual,
      beta,
      sharpe,
      maxDrawdown: mdd,
      totalReturnPct,
      monthlyReturnPct,
      contribToReturn: w * pnlPct,
      marginalVar,
      componentVar,
      contribToVolPct,
      hasHistory,
    };
  });

  // concentration
  const weightsPct = enriched.map((e) => e.weight).sort((a, b) => b - a);
  const hhi = weightsPct.reduce((s, w) => s + (w / 100) ** 2, 0);
  const effectiveN = hhi > 0 ? 1 / hhi : 0;
  const top5Pct = weightsPct.slice(0, 5).reduce((a, b) => a + b, 0);
  const top10Pct = weightsPct.slice(0, 10).reduce((a, b) => a + b, 0);

  // correlation result
  const corrSyms = histSyms;
  const matrix = corrSyms.map((a) => corrSyms.map((b) => correlation(trimmed[a], trimmed[b])));
  let sum = 0;
  let cnt = 0;
  let highest: CorrelationResult["highest"] = null;
  let lowest: CorrelationResult["lowest"] = null;
  for (let i = 0; i < corrSyms.length; i++) {
    for (let j = i + 1; j < corrSyms.length; j++) {
      const r = matrix[i][j];
      sum += r;
      cnt++;
      if (!highest || r > highest.r) highest = { a: corrSyms[i], b: corrSyms[j], r };
      if (!lowest || r < lowest.r) lowest = { a: corrSyms[i], b: corrSyms[j], r };
    }
  }

  return {
    positions: enriched,
    nPositions: positions.length,
    longExposure,
    shortExposure,
    netExposure: longExposure - shortExposure,
    grossExposure,
    largestWeightPct: weightsPct[0] ?? 0,
    avgPositionPct: enriched.length ? 100 / enriched.length : 0,
    hhi,
    effectiveN,
    top5Pct,
    top10Pct,
    portfolioVolAnnual,
    portfolioVar95,
    correlation: { symbols: corrSyms, matrix, avg: cnt ? sum / cnt : 0, highest, lowest },
    totalUnrealized: enriched.reduce((s, e) => s + e.unrealizedPnl, 0),
  };
}
