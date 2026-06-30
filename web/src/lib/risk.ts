// Risk attribution engine. Parametric (variance–covariance) risk decomposition
// from the holdings' daily return history (symbol_rates):
//   component VaR (sums to portfolio VaR), marginal VaR, % risk contribution,
//   beta-to-portfolio, diversification ratio, CVaR/ES, effective # of risk
//   contributors, plus a rolling risk-contribution history.

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";
import { parseOpenDate } from "./analytics";

const Z95 = 1.645;
const Z99 = 2.326;
const ES95_FACTOR = 2.0626; // φ(z95)/(1-0.95)
const TRADING_DAYS = 252;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function cov(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export interface RiskRow {
  symbol: string;
  sector: string;
  assetClass: string;
  weight: number;          // %
  volAnnual: number;       // %
  marginalVar: number;     // $ per +1% weight
  componentVar: number;    // $
  riskContribPct: number;  // %
  betaToPortfolio: number;
  marketValue: number;
}

export interface SectorRisk {
  sector: string;
  weight: number;
  volAnnual: number;       // MV-weighted avg position vol, %
  componentVar: number;    // $
  riskContribPct: number;  // %
  holdings: number;
}

export interface RiskHistory {
  dates: string[];
  volPct: number[];
  var95: number[];
  divRatio: number[];
  effN: number[];
  keys: string[];
  rows: { date: string; [k: string]: number | string }[]; // stacked risk-contribution %
}

export interface RiskData {
  portfolioVolPct: number;
  var95: number;
  var99: number;
  es95: number;
  diversificationRatio: number;
  effectiveRiskContributors: number;
  largestRiskContribPct: number;
  riskConcentrationIndex: number;
  avgPairwiseCorr: number;
  gross: number;
  rows: RiskRow[];
  sectors: SectorRisk[];
  history: RiskHistory;
}

interface Decomp {
  sigmaP: number; // daily
  var95: number;
  perSym: Record<string, { componentVar: number; riskPct: number; beta: number; marginalPer1: number; volA: number }>;
  divRatio: number;
  effN: number;
  avgCorr: number;
}

function computeDecomp(returns: Record<string, number[]>, syms: string[], wSigned: Record<string, number>, gross: number): Decomp {
  const sig: Record<string, number> = {};
  for (const s of syms) sig[s] = stdev(returns[s]);
  const covm: Record<string, Record<string, number>> = {};
  for (const a of syms) {
    covm[a] = {};
    for (const b of syms) covm[a][b] = cov(returns[a], returns[b]);
  }
  const sigmaW: Record<string, number> = {};
  for (const a of syms) {
    let acc = 0;
    for (const b of syms) acc += covm[a][b] * wSigned[b];
    sigmaW[a] = acc;
  }
  let portVar = 0;
  for (const a of syms) portVar += wSigned[a] * sigmaW[a];
  const sigmaP = Math.sqrt(Math.max(portVar, 0));
  const var95 = Z95 * sigmaP * gross;

  const perSym: Decomp["perSym"] = {};
  let wAvgVol = 0;
  for (const s of syms) {
    const componentVar = sigmaP > 0 ? (Z95 * wSigned[s] * sigmaW[s] * gross) / sigmaP : 0;
    const riskPct = portVar > 0 ? (wSigned[s] * sigmaW[s]) / portVar * 100 : 0;
    const beta = portVar > 0 ? sigmaW[s] / portVar : 0;
    const marginalPer1 = sigmaP > 0 ? 0.01 * Z95 * gross * (sigmaW[s] / sigmaP) : 0;
    perSym[s] = { componentVar, riskPct, beta, marginalPer1, volA: sig[s] * Math.sqrt(TRADING_DAYS) * 100 };
    wAvgVol += Math.abs(wSigned[s]) * sig[s];
  }
  const divRatio = sigmaP > 0 ? wAvgVol / sigmaP : 0;
  let shareSq = 0;
  for (const s of syms) shareSq += (perSym[s].riskPct / 100) ** 2;
  const effN = shareSq > 0 ? 1 / shareSq : 0;

  // average pairwise correlation
  let cs = 0, cn = 0;
  for (let i = 0; i < syms.length; i++)
    for (let j = i + 1; j < syms.length; j++) {
      const d = sig[syms[i]] * sig[syms[j]];
      if (d > 0) { cs += covm[syms[i]][syms[j]] / d; cn++; }
    }
  return { sigmaP, var95, perSym, divRatio, effN, avgCorr: cn ? cs / cn : 0 };
}

export function buildRisk(positions: Position[], rates: SymbolRates, days = 30): RiskData {
  // axis + ffilled closes
  const dateSet = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  let axis = [...dateSet].sort();
  const empty: RiskData = {
    portfolioVolPct: 0, var95: 0, var99: 0, es95: 0, diversificationRatio: 0,
    effectiveRiskContributors: 0, largestRiskContribPct: 0, riskConcentrationIndex: 0,
    avgPairwiseCorr: 0, gross: 0, rows: [], sectors: [],
    history: { dates: [], volPct: [], var95: [], divRatio: [], effN: [], keys: [], rows: [] },
  };
  if (axis.length < 4) return empty;
  axis = axis.slice(Math.max(0, axis.length - days));
  const T = axis.length;

  const closeAligned: Record<string, number[]> = {};
  const opened: Record<string, string> = {};
  for (const p of positions) {
    if (closeAligned[p.symbol]) continue;
    const m = new Map<string, number>();
    (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i]));
    const arr: number[] = [];
    let carry = NaN;
    for (const d of axis) { const v = m.get(d); if (v !== undefined) carry = v; arr.push(carry); }
    if (arr.length) arr[T - 1] = p.currentPrice || arr[T - 1];
    closeAligned[p.symbol] = arr;
    opened[p.symbol] = parseOpenDate(p.openTime);
  }
  const retOf = (sym: string, lo: number, hi: number): number[] => {
    const c = closeAligned[sym];
    const r: number[] = [];
    for (let i = Math.max(1, lo); i <= hi; i++) if (c[i - 1] > 0 && Number.isFinite(c[i]) && Number.isFinite(c[i - 1])) r.push(c[i] / c[i - 1] - 1);
    return r;
  };

  // unique symbols + current signed weights
  const symList = [...new Set(positions.map((p) => p.symbol))];
  const grossCur = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const wCur: Record<string, number> = {};
  for (const p of positions) {
    const w = (Math.abs(p.marketValue) / grossCur) * (p.direction === "Short" ? -1 : 1);
    wCur[p.symbol] = (wCur[p.symbol] ?? 0) + w;
  }
  const fullReturns: Record<string, number[]> = {};
  for (const s of symList) fullReturns[s] = retOf(s, 1, T - 1);
  const histSyms = symList.filter((s) => fullReturns[s].length >= 2);
  const minLen = histSyms.length ? Math.min(...histSyms.map((s) => fullReturns[s].length)) : 0;
  const trimmed: Record<string, number[]> = {};
  for (const s of histSyms) trimmed[s] = fullReturns[s].slice(fullReturns[s].length - minLen);

  const dec = computeDecomp(trimmed, histSyms, wCur, grossCur);

  // per-position rows (use the symbol-level decomp; map back to positions, splitting if duplicate symbols)
  const symMv: Record<string, number> = {};
  for (const p of positions) symMv[p.symbol] = (symMv[p.symbol] ?? 0) + Math.abs(p.marketValue);
  const rows: RiskRow[] = positions.map((p) => {
    const d = dec.perSym[p.symbol];
    const share = symMv[p.symbol] > 0 ? Math.abs(p.marketValue) / symMv[p.symbol] : 1; // split symbol-level risk across same-symbol lots
    const c = classify(p);
    return {
      symbol: p.symbol,
      sector: c.sector,
      assetClass: c.assetClass,
      weight: (Math.abs(p.marketValue) / grossCur) * 100,
      volAnnual: d?.volA ?? 0,
      marginalVar: (d?.marginalPer1 ?? 0) * share,
      componentVar: (d?.componentVar ?? 0) * share,
      riskContribPct: (d?.riskPct ?? 0) * share,
      betaToPortfolio: d?.beta ?? 0,
      marketValue: p.marketValue,
    };
  });

  // sector aggregation
  const secMap = new Map<string, { mv: number; wvol: number; cv: number; rc: number; n: number }>();
  for (const r of rows) {
    const e = secMap.get(r.sector) ?? { mv: 0, wvol: 0, cv: 0, rc: 0, n: 0 };
    e.mv += Math.abs(r.marketValue);
    e.wvol += Math.abs(r.marketValue) * r.volAnnual;
    e.cv += r.componentVar;
    e.rc += r.riskContribPct;
    e.n += 1;
    secMap.set(r.sector, e);
  }
  const sectors: SectorRisk[] = [...secMap.entries()]
    .map(([sector, e]) => ({
      sector,
      weight: (e.mv / grossCur) * 100,
      volAnnual: e.mv ? e.wvol / e.mv : 0,
      componentVar: e.cv,
      riskContribPct: e.rc,
      holdings: e.n,
    }))
    .sort((a, b) => b.riskContribPct - a.riskContribPct);

  // rolling history
  const W = Math.min(15, Math.max(4, Math.floor(T / 2)));
  const histDates: string[] = [];
  const volPct: number[] = [], var95s: number[] = [], divs: number[] = [], effs: number[] = [];
  const contribByDay: Record<string, number>[] = [];
  for (let t = W; t < T; t++) {
    const lo = t - W + 1;
    const syms = histSyms.filter((s) => (!opened[s] || opened[s] <= axis[t]));
    const rr: Record<string, number[]> = {};
    for (const s of syms) rr[s] = retOf(s, lo, t);
    const ml = syms.length ? Math.min(...syms.map((s) => rr[s].length)) : 0;
    if (ml < 2) continue;
    for (const s of syms) rr[s] = rr[s].slice(rr[s].length - ml);
    // weights at day t
    let g = 0;
    const mvAt: Record<string, number> = {};
    for (const p of positions) {
      if (opened[p.symbol] && opened[p.symbol] > axis[t]) continue;
      const px = closeAligned[p.symbol][t];
      const mv = Number.isFinite(px) ? Math.abs(p.volume * px) : Math.abs(p.marketValue);
      mvAt[p.symbol] = (mvAt[p.symbol] ?? 0) + mv * (p.direction === "Short" ? -1 : 1);
      g += mv;
    }
    g = g || 1;
    const w: Record<string, number> = {};
    for (const s of syms) w[s] = (mvAt[s] ?? 0) / g;
    const d = computeDecomp(rr, syms, w, g);
    histDates.push(axis[t].slice(5));
    volPct.push(+(d.sigmaP * Math.sqrt(TRADING_DAYS) * 100).toFixed(2));
    var95s.push(+d.var95.toFixed(0));
    divs.push(+d.divRatio.toFixed(2));
    effs.push(+d.effN.toFixed(1));
    const day: Record<string, number> = {};
    for (const s of syms) day[s] = +(d.perSym[s]?.riskPct ?? 0).toFixed(2);
    contribByDay.push(day);
  }
  // top-8 contributors by avg share for stacked area
  const avgShare = new Map<string, number>();
  for (const day of contribByDay) for (const [s, v] of Object.entries(day)) avgShare.set(s, (avgShare.get(s) ?? 0) + v);
  const topKeys = [...avgShare.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
  const histRows = contribByDay.map((day, i) => {
    const row: { date: string; [k: string]: number | string } = { date: histDates[i] };
    let other = 0;
    for (const [s, v] of Object.entries(day)) { if (topKeys.includes(s)) row[s] = v; else other += v; }
    if (avgShare.size > topKeys.length) row["Other"] = +other.toFixed(2);
    return row;
  });
  const keys = avgShare.size > topKeys.length ? [...topKeys, "Other"] : topKeys;

  const riskShares = rows.map((r) => r.riskContribPct / 100);
  const rci = riskShares.reduce((s, x) => s + x * x, 0);

  return {
    portfolioVolPct: dec.sigmaP * Math.sqrt(TRADING_DAYS) * 100,
    var95: dec.var95,
    var99: Z99 * dec.sigmaP * grossCur,
    es95: ES95_FACTOR * dec.sigmaP * grossCur,
    diversificationRatio: dec.divRatio,
    effectiveRiskContributors: dec.effN,
    largestRiskContribPct: Math.max(0, ...rows.map((r) => r.riskContribPct)),
    riskConcentrationIndex: rci,
    avgPairwiseCorr: dec.avgCorr,
    gross: grossCur,
    rows,
    sectors,
    history: { dates: histDates, volPct, var95: var95s, divRatio: divs, effN: effs, keys, rows: histRows },
  };
}
