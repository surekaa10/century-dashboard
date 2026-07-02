// Performance attribution engine. Reconstructs a daily per-position $-contribution
// series from current holdings valued at historical symbol_rates (open dates
// honoured), then derives period returns, sector/asset-class decomposition,
// time attribution, concentration and leadership stats.

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";
import { parseOpenDate } from "./analytics";

export interface PosContrib {
  symbol: string;
  sector: string;
  assetClass: string;
  weight: number;        // % of gross MV (current)
  returnPct: number;     // price first→last over window, %
  contribPct: number;    // weight_frac × returnPct, in % points
  contribUsd: number;    // total $ P&L over window
  marketValue: number;
  daily: number[];       // daily $ contribution, aligned to dates
  cum: number[];         // cumulative $ contribution
}

export interface ContributionData {
  dates: string[];
  baseValue: number;        // gross MV at window start
  mvSeries: number[];       // gross MV per day
  perPosition: PosContrib[];
  portfolioDaily: number[];
  portfolioCum: number[];
}

export function buildContribution(positions: Position[], rates: SymbolRates): ContributionData {
  const dateSet = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  const dates = [...dateSet].sort();
  if (dates.length < 2) {
    return { dates: [], baseValue: 0, mvSeries: [], perPosition: [], portfolioDaily: [], portfolioCum: [] };
  }
  const T = dates.length;

  const priceMap = new Map<string, Map<string, number>>();
  for (const p of positions) {
    if (priceMap.has(p.symbol)) continue;
    const m = new Map<string, number>();
    (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i]));
    priceMap.set(p.symbol, m);
  }

  // aligned (ffilled) close per position, plus held-mask by open date
  const grossMvCurrent = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  const perPosition: PosContrib[] = positions.map((p) => {
    const c = classify(p);
    const m = priceMap.get(p.symbol)!;
    const opened = parseOpenDate(p.openTime);
    const sign = p.direction === "Short" ? -1 : 1;

    const closeAligned: number[] = [];
    let carry = NaN;
    for (const d of dates) {
      const v = m.get(d);
      if (v !== undefined) carry = v;
      closeAligned.push(carry);
    }
    // anchor last close to current price for consistency with live MV
    if (closeAligned.length) closeAligned[T - 1] = p.currentPrice || closeAligned[T - 1];

    const daily = new Array(T).fill(0);
    for (let i = 1; i < T; i++) {
      const held = !opened || opened <= dates[i];
      if (held && Number.isFinite(closeAligned[i]) && Number.isFinite(closeAligned[i - 1])) {
        daily[i] = sign * p.volume * (closeAligned[i] - closeAligned[i - 1]);
      }
    }
    const cum: number[] = [];
    let acc = 0;
    for (const d of daily) { acc += d; cum.push(acc); }

    const firstClose = closeAligned.find((x) => Number.isFinite(x)) ?? 0;
    const lastClose = closeAligned[T - 1] ?? 0;
    const returnPct = firstClose > 0 ? sign * (lastClose / firstClose - 1) * 100 : 0;
    const weightFrac = Math.abs(p.marketValue) / grossMvCurrent;

    return {
      symbol: p.symbol,
      sector: c.sector,
      assetClass: c.assetClass,
      weight: weightFrac * 100,
      returnPct,
      contribPct: weightFrac * returnPct,
      contribUsd: cum[T - 1] ?? 0,
      marketValue: p.marketValue,
      daily,
      cum,
    };
  });

  const portfolioDaily = new Array(T).fill(0);
  for (const pp of perPosition) for (let i = 0; i < T; i++) portfolioDaily[i] += pp.daily[i];
  const portfolioCum: number[] = [];
  let acc = 0;
  for (const d of portfolioDaily) { acc += d; portfolioCum.push(acc); }

  // gross MV per day (sum |held value|)
  const mvSeries = dates.map((_, i) => {
    let mv = 0;
    for (const p of positions) {
      const m = priceMap.get(p.symbol)!;
      let px = NaN;
      for (let j = i; j >= 0; j--) { const v = m.get(dates[j]); if (v !== undefined) { px = v; break; } }
      if (i === T - 1) px = p.currentPrice || px;
      const opened = parseOpenDate(p.openTime);
      if ((!opened || opened <= dates[i]) && Number.isFinite(px)) mv += Math.abs(p.volume * px);
    }
    return mv;
  });

  return { dates, baseValue: mvSeries[0] || grossMvCurrent, mvSeries, perPosition, portfolioDaily, portfolioCum };
}

// ── period helpers ──────────────────────────────────────────────────────────────

export interface PeriodReturn {
  ret: number;     // %
  contrib: number; // $
  prevRet: number; // % previous equal-length period
}

const TD: Record<string, number> = { daily: 1, weekly: 5, monthly: 21, quarterly: 63 };

export function periodReturn(d: ContributionData, key: "daily" | "weekly" | "monthly" | "quarterly" | "ytd" | "inception"): PeriodReturn {
  const n = d.dates.length;
  if (n < 2) return { ret: 0, contrib: 0, prevRet: 0 };
  const last = n - 1;

  let startIdx: number;
  if (key === "inception") startIdx = 0;
  else if (key === "ytd") {
    const yr = new Date().getUTCFullYear();
    const jan1 = `${yr}-01-01`;
    const found = d.dates.findIndex((x) => x >= jan1);
    startIdx = found < 0 ? 0 : found;
  } else {
    startIdx = Math.max(0, last - TD[key]);
  }

  const baseMv = d.mvSeries[startIdx] || d.baseValue || 1;
  const contrib = d.portfolioCum[last] - d.portfolioCum[startIdx];
  const ret = (contrib / baseMv) * 100;

  // previous equal-length period
  const len = last - startIdx;
  const prevStart = Math.max(0, startIdx - len);
  const prevBase = d.mvSeries[prevStart] || baseMv;
  const prevContrib = d.portfolioCum[startIdx] - d.portfolioCum[prevStart];
  const prevRet = prevBase ? (prevContrib / prevBase) * 100 : 0;

  return { ret, contrib, prevRet };
}

// portfolio cumulative-return series (%) for sparklines
export function cumReturnSeries(d: ContributionData): number[] {
  const base = d.baseValue || 1;
  return d.portfolioCum.map((c) => (c / base) * 100);
}

// ── sector attribution ──────────────────────────────────────────────────────────

export interface SectorAttr {
  sector: string;
  weight: number;      // %
  returnPct: number;   // MV-weighted avg position return, %
  contribPct: number;  // sum of position contribPct
  contribUsd: number;
  holdings: number;
}

export function sectorAttribution(perPosition: PosContrib[]): SectorAttr[] {
  const m = new Map<string, { mv: number; wret: number; contribPct: number; usd: number; n: number }>();
  const gross = perPosition.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  for (const p of perPosition) {
    const e = m.get(p.sector) ?? { mv: 0, wret: 0, contribPct: 0, usd: 0, n: 0 };
    e.mv += Math.abs(p.marketValue);
    e.wret += Math.abs(p.marketValue) * p.returnPct;
    e.contribPct += p.contribPct;
    e.usd += p.contribUsd;
    e.n += 1;
    m.set(p.sector, e);
  }
  return [...m.entries()]
    .map(([sector, e]) => ({
      sector,
      weight: (e.mv / gross) * 100,
      returnPct: e.mv ? e.wret / e.mv : 0,
      contribPct: e.contribPct,
      contribUsd: e.usd,
      holdings: e.n,
    }))
    .sort((a, b) => b.contribUsd - a.contribUsd);
}

// ── period-aware sector attribution ────────────────────────────────────────────
// Like sectorAttribution() but restricts returns to a lookback window so they
// match the same period used for the benchmark comparison.

export function sectorAttributionForPeriod(
  perPosition: PosContrib[],
  dates: string[],
  _mvSeries: number[],
  lookback: number,
): SectorAttr[] {
  const n = dates.length;
  if (!n) return [];
  const last = n - 1;

  let startIdx: number;
  if (lookback === 0) {
    startIdx = 0;
  } else if (lookback < 0) {
    const jan1 = `${new Date().getUTCFullYear()}-01-01`;
    const found = dates.findIndex((d) => d >= jan1);
    startIdx = found < 0 ? 0 : Math.min(found, last - 1);
  } else {
    startIdx = Math.max(0, last - lookback);
  }

  const gross = perPosition.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const m = new Map<string, { mv: number; wret: number; contribPct: number; usd: number; n: number }>();

  for (const p of perPosition) {
    const periodUsd = (p.cum[last] ?? 0) - (p.cum[startIdx] ?? 0);
    const periodRet = Math.abs(p.marketValue) > 0 ? (periodUsd / Math.abs(p.marketValue)) * 100 : 0;
    const weight = (Math.abs(p.marketValue) / gross) * 100;

    const e = m.get(p.sector) ?? { mv: 0, wret: 0, contribPct: 0, usd: 0, n: 0 };
    e.mv        += Math.abs(p.marketValue);
    e.wret      += Math.abs(p.marketValue) * periodRet;
    e.contribPct += (weight / 100) * periodRet;
    e.usd       += periodUsd;
    e.n         += 1;
    m.set(p.sector, e);
  }

  return [...m.entries()]
    .map(([sector, e]) => ({
      sector,
      weight:     (e.mv / gross) * 100,
      returnPct:  e.mv ? e.wret / e.mv : 0,
      contribPct: e.contribPct,
      contribUsd: e.usd,
      holdings:   e.n,
    }))
    .sort((a, b) => b.contribUsd - a.contribUsd);
}

// ── monthly returns calendar ───────────────────────────────────────────────────

export interface MonthlyReturn {
  year: number;
  month: number; // 1–12
  ret: number;   // % return
}

export function computeMonthlyReturns(data: ContributionData): MonthlyReturn[] {
  const monthMap = new Map<string, { sumContrib: number; startMv: number }>();

  for (let i = 0; i < data.dates.length; i++) {
    const ym = data.dates[i].slice(0, 7); // "2025-06"
    if (!monthMap.has(ym)) {
      const startMv = i > 0 ? (data.mvSeries[i - 1] || data.baseValue) : data.mvSeries[0] || data.baseValue;
      monthMap.set(ym, { sumContrib: data.portfolioDaily[i], startMv });
    } else {
      monthMap.get(ym)!.sumContrib += data.portfolioDaily[i];
    }
  }

  const results: MonthlyReturn[] = [];
  for (const [ym, { sumContrib, startMv }] of monthMap) {
    const [year, month] = ym.split("-").map(Number);
    results.push({ year, month, ret: startMv > 0 ? (sumContrib / startMv) * 100 : 0 });
  }
  return results.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// ── trade attribution from deals ───────────────────────────────────────────────

import type { Deal } from "./types";

export interface TradeAttrib {
  symbol: string;
  direction: "Long" | "Short";
  openTime: string;
  closeTime: string;
  holdingDays: number;
  volume: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
}

export function computeTradeAttribution(deals: Deal[]): TradeAttrib[] {
  const bySymbol = new Map<string, Deal[]>();
  for (const d of deals) {
    const arr = bySymbol.get(d.symbol) ?? [];
    arr.push(d);
    bySymbol.set(d.symbol, arr);
  }

  const result: TradeAttrib[] = [];
  for (const [symbol, sDeals] of bySymbol) {
    const opens  = sDeals.filter((d) => d.entry === 0);
    const closes = sDeals.filter((d) => d.entry === 1 && d.profit !== 0);
    if (!closes.length) continue;

    const grossPnl    = closes.reduce((s, d) => s + d.profit, 0);
    const commission  = sDeals.reduce((s, d) => s + d.commission, 0);
    const swap        = sDeals.reduce((s, d) => s + d.swap, 0);
    const volume      = closes.reduce((s, d) => s + d.volume, 0);

    const totalOpenVol = opens.reduce((s, d) => s + d.volume, 0);
    const entryPrice   = totalOpenVol > 0
      ? opens.reduce((s, d) => s + d.price * d.volume, 0) / totalOpenVol
      : (opens[0]?.price ?? 0);
    const exitPrice    = volume > 0
      ? closes.reduce((s, d) => s + d.price * d.volume, 0) / volume
      : closes[closes.length - 1].price;

    const openDeal  = opens[0];
    const direction: "Long" | "Short" = openDeal ? (openDeal.type === 0 ? "Long" : "Short") : "Long";

    const openTimes  = opens.map((d) => new Date(d.time).getTime()).filter((t) => !isNaN(t));
    const closeTimes = closes.map((d) => new Date(d.time).getTime()).filter((t) => !isNaN(t));
    const openTime   = openTimes.length  ? new Date(Math.min(...openTimes)).toISOString()  : "";
    const closeTime  = closeTimes.length ? new Date(Math.max(...closeTimes)).toISOString() : "";
    const holdingDays = openTime && closeTime
      ? Math.round((new Date(closeTime).getTime() - new Date(openTime).getTime()) / 86_400_000)
      : 0;

    result.push({ symbol, direction, openTime, closeTime, holdingDays, volume,
                  entryPrice, exitPrice, grossPnl, commission, swap, netPnl: grossPnl + commission + swap });
  }

  return result.sort((a, b) => b.netPnl - a.netPnl);
}

// group cumulative $ contribution by a key (sector / assetClass)
export function groupCumulative(d: ContributionData, by: "symbol" | "sector" | "assetClass", topN = 8): { keys: string[]; rows: { date: string; [k: string]: number | string }[] } {
  const groups = new Map<string, number[]>();
  for (const p of d.perPosition) {
    const key = by === "symbol" ? p.symbol : by === "sector" ? p.sector : p.assetClass;
    const arr = groups.get(key) ?? new Array(d.dates.length).fill(0);
    for (let i = 0; i < d.dates.length; i++) arr[i] += p.daily[i];
    groups.set(key, arr);
  }
  // rank by absolute total, keep topN, fold rest into "Other"
  const totals = [...groups.entries()].map(([k, a]) => ({ k, t: Math.abs(a.reduce((s, x) => s + x, 0)) }));
  totals.sort((x, y) => y.t - x.t);
  const keep = totals.slice(0, topN).map((x) => x.k);
  const keys = by === "symbol" ? keep : [...groups.keys()];
  const useKeys = by === "symbol" ? keep : keys;

  const rows = d.dates.map((date, i) => {
    const row: { date: string; [k: string]: number | string } = { date: date.slice(5) };
    let other = 0;
    for (const [k, arr] of groups) {
      const cum = arr.slice(0, i + 1).reduce((s, x) => s + x, 0);
      if (useKeys.includes(k)) row[k] = +cum.toFixed(2);
      else other += cum;
    }
    if (by === "symbol" && groups.size > topN) row["Other"] = +other.toFixed(2);
    return row;
  });
  const finalKeys = by === "symbol" && groups.size > topN ? [...useKeys, "Other"] : useKeys;
  return { keys: finalKeys, rows };
}

// ── concentration & leadership ─────────────────────────────────────────────────

export function contributionConcentration(perPosition: PosContrib[]) {
  const gains = perPosition.filter((p) => p.contribUsd > 0).map((p) => p.contribUsd).sort((a, b) => b - a);
  const totalGains = gains.reduce((s, x) => s + x, 0) || 1;
  const share = (k: number) => (gains.slice(0, k).reduce((s, x) => s + x, 0) / totalGains) * 100;
  return { top1: share(1), top3: share(3), top5: share(5), top10: share(10), totalGains };
}

export function leadership(perPosition: PosContrib[]) {
  const winners = perPosition.filter((p) => p.contribUsd > 0);
  const losers = perPosition.filter((p) => p.contribUsd < 0);
  const grossWin = winners.reduce((s, p) => s + p.contribUsd, 0);
  const grossLoss = Math.abs(losers.reduce((s, p) => s + p.contribUsd, 0));
  const sorted = [...perPosition].sort((a, b) => b.returnPct - a.returnPct);
  return {
    winners: winners.length,
    losers: losers.length,
    winRate: perPosition.length ? (winners.length / perPosition.length) * 100 : 0,
    avgWinnerRet: winners.length ? winners.reduce((s, p) => s + p.returnPct, 0) / winners.length : 0,
    avgLoserRet: losers.length ? losers.reduce((s, p) => s + p.returnPct, 0) / losers.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  };
}
