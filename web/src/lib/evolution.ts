// Position evolution engine. Replays the MT5 deal ledger to reconstruct true
// daily holdings (entries, adds, trims, exits) — the authoritative record of
// portfolio change — and values them with symbol_rates for weight/concentration
// history. This is real position history, not price-only reconstruction.

import type { Deal, Position, SymbolRates } from "./types";
import { classify } from "./sectors";

const DEAL_BUY = 0;
const DEAL_SELL = 1;
const ENTRY_OUT = 1;

export interface DayState {
  date: string;
  mv: number;
  weights: Record<string, number>;       // %
  bySymbolMv: Record<string, number>;
  sectorWeights: Record<string, number>; // %
  hhi: number;
  effN: number;
  top5: number;
  top10: number;
}

export interface DealLite {
  date: string;
  symbol: string;
  sector: string;
  side: "buy" | "sell";
  qty: number;
  notional: number;
  profit: number;
}

export interface SymbolInfo {
  symbol: string;
  sector: string;
  firstBuy: string;
  lastActivity: string;
  netQty: number;
  exited: boolean;
  exitDate: string;
}

export interface EvolutionData {
  dates: string[];
  states: DayState[];
  deals: DealLite[];
  symbols: SymbolInfo[];
  currentPnlPctBySym: Record<string, number>;
  currentPnlBySym: Record<string, number>;
}

const dayKey = (iso: string) => iso.slice(0, 10);
function addDay(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function concentration(weightsPct: number[]) {
  const sorted = [...weightsPct].sort((a, b) => b - a);
  const hhi = sorted.reduce((s, w) => s + (w / 100) ** 2, 0);
  return {
    hhi,
    effN: hhi > 0 ? 1 / hhi : 0,
    top5: sorted.slice(0, 5).reduce((a, b) => a + b, 0),
    top10: sorted.slice(0, 10).reduce((a, b) => a + b, 0),
  };
}

export function buildEvolution(deals: Deal[], positions: Position[], rates: SymbolRates): EvolutionData {
  const trades = deals
    .filter((d) => d.type === DEAL_BUY || d.type === DEAL_SELL)
    .map((d) => ({ ...d, day: dayKey(d.time) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  if (!trades.length) {
    return { dates: [], states: [], deals: [], symbols: [], currentPnlPctBySym: {}, currentPnlBySym: {} };
  }

  const dealLite: DealLite[] = trades.map((d) => {
    const side: "buy" | "sell" = d.entry === ENTRY_OUT || d.type === DEAL_SELL ? "sell" : "buy";
    return {
      date: d.day,
      symbol: d.symbol,
      sector: classify(d.symbol).sector,
      side,
      qty: d.volume,
      notional: d.volume * d.price,
      profit: d.profit,
    };
  });

  // price lookup (ffill) per symbol
  const priceMap = new Map<string, Map<string, number>>();
  for (const sym of new Set(trades.map((t) => t.symbol))) {
    const m = new Map<string, number>();
    (rates[sym]?.dates ?? []).forEach((dt, i) => m.set(dt, rates[sym].close[i]));
    priceMap.set(sym, m);
  }
  // last deal price per symbol as fallback price
  const lastDealPrice = new Map<string, number>();

  // daily axis from first trade to today
  const start = trades[0].day;
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let d = start; d <= today; d = addDay(d)) dates.push(d);

  // current snapshot pnl by symbol
  const currentPnlBySym: Record<string, number> = {};
  const currentBasisBySym: Record<string, number> = {};
  for (const p of positions) {
    currentPnlBySym[p.symbol] = (currentPnlBySym[p.symbol] ?? 0) + p.unrealizedPnl;
    currentBasisBySym[p.symbol] = (currentBasisBySym[p.symbol] ?? 0) + Math.abs(p.entryPrice * p.volume);
  }
  const currentPnlPctBySym: Record<string, number> = {};
  for (const s of Object.keys(currentPnlBySym)) currentPnlPctBySym[s] = currentBasisBySym[s] > 0 ? (currentPnlBySym[s] / currentBasisBySym[s]) * 100 : 0;

  // replay
  const qty = new Map<string, number>();
  const states: DayState[] = [];
  let ti = 0;
  for (const date of dates) {
    while (ti < trades.length && trades[ti].day <= date) {
      const t = trades[ti];
      const sign = t.entry === ENTRY_OUT || t.type === DEAL_SELL ? -1 : 1;
      qty.set(t.symbol, (qty.get(t.symbol) ?? 0) + sign * t.volume);
      lastDealPrice.set(t.symbol, t.price);
      ti++;
    }
    const bySymbolMv: Record<string, number> = {};
    let mv = 0;
    for (const [sym, q] of qty) {
      if (q <= 1e-9) continue;
      let px = priceMap.get(sym)?.get(date);
      if (px === undefined) {
        // ffill within rates up to date, else last deal price
        const m = priceMap.get(sym);
        if (m) for (let i = dates.indexOf(date); i >= 0; i--) { const v = m.get(dates[i]); if (v !== undefined) { px = v; break; } }
      }
      if (px === undefined) px = lastDealPrice.get(sym);
      const val = q * (px ?? 0);
      if (val > 0) { bySymbolMv[sym] = val; mv += val; }
    }
    const weights: Record<string, number> = {};
    const sectorW: Record<string, number> = {};
    for (const [sym, v] of Object.entries(bySymbolMv)) {
      const w = mv > 0 ? (v / mv) * 100 : 0;
      weights[sym] = w;
      const sec = classify(sym).sector;
      sectorW[sec] = (sectorW[sec] ?? 0) + w;
    }
    const c = concentration(Object.values(weights));
    states.push({ date, mv, weights, bySymbolMv, sectorWeights: sectorW, ...c });
  }

  // symbol info
  const symbols: SymbolInfo[] = [...new Set(trades.map((t) => t.symbol))].map((sym) => {
    const sdeals = trades.filter((t) => t.symbol === sym);
    let net = 0;
    for (const d of sdeals) net += (d.entry === ENTRY_OUT || d.type === DEAL_SELL ? -1 : 1) * d.volume;
    const exited = net <= 1e-9;
    return {
      symbol: sym,
      sector: classify(sym).sector,
      firstBuy: sdeals[0].day,
      lastActivity: sdeals[sdeals.length - 1].day,
      netQty: net,
      exited,
      exitDate: exited ? sdeals[sdeals.length - 1].day : "",
    };
  });

  return { dates, states, deals: dealLite, symbols, currentPnlPctBySym, currentPnlBySym };
}

// ── period-relative derivations ──────────────────────────────────────────────────

export const PERIOD_DAYS: Record<string, number> = {
  "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, Inception: 99999,
};

export function startIndexFor(data: EvolutionData, period: string): number {
  if (!data.dates.length) return 0;
  const days = PERIOD_DAYS[period] ?? 99999;
  if (days >= 99999) return 0;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const key = cutoff.toISOString().slice(0, 10);
  const idx = data.dates.findIndex((d) => d >= key);
  return idx < 0 ? 0 : idx;
}

export interface ChangeRow {
  symbol: string;
  sector: string;
  action: "New Position" | "Added" | "Trimmed" | "Fully Exited" | "Unchanged";
  prevWeight: number;
  currWeight: number;
  change: number;
  capitalChange: number;
  lastTradeDate: string;            // most recent deal date in window (YYYY-MM-DD), "" if none
  lastTradeSide: "buy" | "sell" | "";
}

export interface PeriodAnalysis {
  startDate: string;
  endDate: string;
  changeLog: ChangeRow[];
  newPositions: { symbol: string; entryDate: string; initialWeight: number; currentWeight: number; pnl: number; pnlPct: number }[];
  exits: { symbol: string; exitDate: string; finalReturn: number; holdingDays: number; realizedPnl: number }[];
  convictionUp: ChangeRow[];
  convictionDown: ChangeRow[];
  capitalBySector: { key: string; added: number; removed: number; net: number }[];
  capitalBySymbol: { key: string; added: number; removed: number; net: number }[];
  kpis: {
    newAdded: number; exited: number; netAdded: number; netRemoved: number;
    largestIncrease: ChangeRow | null; largestDecrease: ChangeRow | null;
    turnover: number; activeChanges: number;
  };
}

export function analyzePeriod(data: EvolutionData, period: string): PeriodAnalysis {
  const startIdx = startIndexFor(data, period);
  const last = data.states.length - 1;
  const startState = data.states[startIdx];
  const endState = data.states[last];
  const startDate = data.dates[startIdx];
  const endDate = data.dates[last];

  const windowDeals = data.deals.filter((d) => d.date >= startDate);
  // Include symbols that traded in the window even if they net to zero weight at
  // both ends (e.g. opened and fully closed mid-window) so exits/trims surface.
  const symbolsSet = new Set<string>([
    ...Object.keys(startState?.weights ?? {}),
    ...Object.keys(endState?.weights ?? {}),
    ...windowDeals.map((d) => d.symbol),
  ]);

  type SymCap = { added: number; removed: number; boughtQty: number; soldQty: number; lastDate: string; lastSide: "buy" | "sell" };
  const capBySym = new Map<string, SymCap>();
  const capBySec = new Map<string, { added: number; removed: number }>();
  for (const d of windowDeals) {
    const s = capBySym.get(d.symbol) ?? { added: 0, removed: 0, boughtQty: 0, soldQty: 0, lastDate: "", lastSide: "buy" as "buy" | "sell" };
    const sec = capBySec.get(d.sector) ?? { added: 0, removed: 0 };
    if (d.side === "buy") { s.added += d.notional; s.boughtQty += d.qty; sec.added += d.notional; }
    else { s.removed += d.notional; s.soldQty += d.qty; sec.removed += d.notional; }
    // windowDeals are in ascending date order → the last one seen is the most recent
    s.lastDate = d.date; s.lastSide = d.side;
    capBySym.set(d.symbol, s);
    capBySec.set(d.sector, sec);
  }

  const changeLog: ChangeRow[] = [];
  for (const sym of symbolsSet) {
    const prev = startState?.weights[sym] ?? 0;
    const curr = endState?.weights[sym] ?? 0;
    const cap = capBySym.get(sym);
    const capitalChange = (cap?.added ?? 0) - (cap?.removed ?? 0);
    const heldStart = prev >= 0.01;
    const heldEnd = curr >= 0.01;
    const boughtQty = cap?.boughtQty ?? 0;
    const soldQty = cap?.soldQty ?? 0;
    const netQty = boughtQty - soldQty;   // net units traded this window
    const traded = boughtQty > 1e-9 || soldQty > 1e-9;
    // Action reflects the NET position change over the window, not just whether a
    // sell occurred: buying more than you sold (net up) is "Added" even if a trim
    // happened mid-window. The Last Trade column still surfaces the latest deal.
    let action: ChangeRow["action"];
    if (!heldStart && heldEnd) action = "New Position";
    else if (!heldEnd && (heldStart || traded)) action = "Fully Exited";
    else if (heldEnd && netQty > 1e-9) action = "Added";
    else if (heldEnd && netQty < -1e-9) action = "Trimmed";
    else action = "Unchanged";
    changeLog.push({
      symbol: sym, sector: classify(sym).sector, action,
      prevWeight: prev, currWeight: curr, change: curr - prev, capitalChange,
      lastTradeDate: cap?.lastDate ?? "", lastTradeSide: cap?.lastDate ? cap.lastSide : "",
    });
  }
  // Order: most recent trade first, then by weight move; Unchanged rows sink.
  changeLog.sort((a, b) => (b.lastTradeDate || "").localeCompare(a.lastTradeDate || "") || Math.abs(b.change) - Math.abs(a.change));

  const newPositions = data.symbols
    .filter((s) => s.firstBuy >= startDate && !s.exited)
    .map((s) => {
      const initIdx = data.dates.indexOf(s.firstBuy);
      return {
        symbol: s.symbol,
        entryDate: s.firstBuy,
        initialWeight: data.states[initIdx]?.weights[s.symbol] ?? 0,
        currentWeight: endState?.weights[s.symbol] ?? 0,
        pnl: data.currentPnlBySym[s.symbol] ?? 0,
        pnlPct: data.currentPnlPctBySym[s.symbol] ?? 0,
      };
    });

  const exits = data.symbols
    .filter((s) => s.exited && s.exitDate >= startDate)
    .map((s) => {
      const sdeals = data.deals.filter((d) => d.symbol === s.symbol);
      const realized = sdeals.reduce((sum, d) => sum + d.profit, 0);
      const buys = sdeals.filter((d) => d.side === "buy").reduce((sum, d) => sum + d.notional, 0);
      const hold = Math.round((new Date(s.exitDate).getTime() - new Date(s.firstBuy).getTime()) / 86400000);
      return { symbol: s.symbol, exitDate: s.exitDate, finalReturn: buys > 0 ? (realized / buys) * 100 : 0, holdingDays: hold, realizedPnl: realized };
    });

  const convictionUp = changeLog.filter((c) => c.change > 0.1).slice(0, 10);
  const convictionDown = changeLog.filter((c) => c.change < -0.1).sort((a, b) => a.change - b.change).slice(0, 10);

  const buys = windowDeals.filter((d) => d.side === "buy").reduce((s, d) => s + d.notional, 0);
  const sells = windowDeals.filter((d) => d.side === "sell").reduce((s, d) => s + d.notional, 0);
  const avgMv = data.states.slice(startIdx).reduce((s, st) => s + st.mv, 0) / Math.max(1, last - startIdx + 1);
  const turnover = avgMv > 0 ? (Math.min(buys, sells) / avgMv) * 100 : 0;

  return {
    startDate, endDate,
    changeLog,
    newPositions,
    exits,
    convictionUp,
    convictionDown,
    capitalBySector: [...capBySec.entries()].map(([key, v]) => ({ key, added: v.added, removed: v.removed, net: v.added - v.removed })).sort((a, b) => b.net - a.net),
    capitalBySymbol: [...capBySym.entries()].map(([key, v]) => ({ key, added: v.added, removed: v.removed, net: v.added - v.removed })).sort((a, b) => b.net - a.net),
    kpis: {
      newAdded: newPositions.length,
      exited: exits.length,
      netAdded: buys,
      netRemoved: sells,
      largestIncrease: convictionUp[0] ?? null,
      largestDecrease: convictionDown[0] ?? null,
      turnover,
      activeChanges: changeLog.filter((c) => c.action !== "Unchanged").length,
    },
  };
}
