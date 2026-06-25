// Tactical Trading Intelligence engine. Treats a derived "tactical" sleeve
// (short-held / opportunistic positions) as a standalone book vs the "core"
// sleeve. Because the live snapshot has NO sleeve tags or trade-plan metadata,
// the split is a holding-period heuristic and risk uses an assumed stop — both
// adjustable. MFE/MAE/efficiency are computed from real symbol_rates history.

import type { Account, Position, SymbolRates } from "./types";
import { classify } from "./sectors";

const Z95 = 1.645, ES = 2.0626, TD = 252;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
function maxDD(vals: number[]): number { let pk = -Infinity, m = 0; for (const v of vals) { pk = Math.max(pk, v); if (pk > 0) m = Math.min(m, v / pk - 1); } return m * 100; }
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseOpen(s: string): string { const t = s.trim().split(/\s+/); if (t.length < 3) return ""; const d = +t[0], mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], y = +t[2]; return Number.isFinite(d) && mo !== undefined && Number.isFinite(y) ? `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : ""; }
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export function strategyOf(symbol: string): string {
  const c = classify(symbol);
  if (c.industry.toLowerCase().includes("semic")) return "AI / Semis";
  if (c.assetClass === "FX") return "Macro / FX";
  if (c.assetClass === "Commodity") return "Commodity";
  if (["Information Technology", "Communication Services", "Consumer Discretionary"].includes(c.sector)) return "Tech Momentum";
  if (c.sector === "Health Care") return "Healthcare";
  if (c.sector === "Industrials") return "Defence / Industrials";
  return c.sector;
}

export interface Trade {
  symbol: string; strategy: string; sector: string; openDate: string; holdingDays: number;
  entry: number; current: number; volume: number; costBasis: number; mv: number;
  pnl: number; returnPct: number; risk: number; rMultiple: number;
  stopPrice: number; targetPrice: number; distToStop: number; distToTarget: number;
  mfePct: number; maePct: number; exitEff: number; setupScore: number;
}
export interface SleevePerf { capital: number; pnl: number; returnPct: number; volAnnual: number; sharpe: number; sortino: number; maxDD: number; var95: number; winRate: number; avgHold: number; daily: number[]; dates: string[]; }
export interface StrategyPerf { strategy: string; n: number; winRate: number; avgReturn: number; avgHold: number; pnl: number; }

export interface TacticalData {
  ok: boolean;
  maxDays: number; stopPct: number; budgetPct: number;
  trades: Trade[]; coreCount: number;
  alloc: number; allocPnlShare: number; allocRiskShare: number;
  core: SleevePerf; tactical: SleevePerf;
  quality: { winRate: number; avgWinner: number; avgLoser: number; profitFactor: number; expectancy: number; avgR: number; largestWin: number; largestLoss: number; rHist: { label: string; n: number }[] };
  alpha: { excess: number; infoRatio: number; alpha: number; beta: number; corr: number; hitRate: number; capture: number; rolling: { period: string; v: number }[] };
  risk: { var95: number; cvar: number; drawdown: number; corr: number; concentration: number; beta: number; openRisk: number; leverage: number; remaining: number; overBudget: boolean };
  strategies: StrategyPerf[];
  efficiency: { best: Trade[]; worst: Trade[] };
  health: { total: number; label: string; components: { ret: number; exec: number; risk: number; capital: number; alpha: number; discipline: number } };
  insights: string[]; summary: string;
}

function sleeveSeries(posn: Position[], rates: SymbolRates): { daily: number[]; dates: string[]; capital: number } {
  const dateSet = new Set<string>(); for (const p of posn) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  const dates = [...dateSet].sort();
  const capital = posn.reduce((s, p) => s + Math.abs(p.entryPrice * p.volume), 0) || 1;
  if (dates.length < 2) return { daily: [], dates: [], capital };
  const pm = new Map<string, Map<string, number>>();
  for (const p of posn) if (!pm.has(p.symbol)) { const m = new Map<string, number>(); (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i])); pm.set(p.symbol, m); }
  const opened = new Map<Position, string>(); for (const p of posn) opened.set(p, parseOpen(p.openTime));
  const carry = new Map<string, number>();
  const pnlPath = dates.map((date) => {
    for (const p of posn) { const c = pm.get(p.symbol)?.get(date); if (c !== undefined) carry.set(p.symbol, c); }
    let f = 0; for (const p of posn) { const op = opened.get(p)!; if (op && op > date) continue; const px = carry.get(p.symbol); if (px === undefined) continue; f += (p.direction === "Short" ? -1 : 1) * p.volume * (px - p.entryPrice); }
    return f;
  });
  const daily: number[] = []; for (let i = 1; i < pnlPath.length; i++) daily.push((pnlPath[i] - pnlPath[i - 1]) / capital);
  return { daily, dates: dates.slice(1), capital };
}
function perfOf(posn: Position[], rates: SymbolRates): SleevePerf {
  const { daily, dates, capital } = sleeveSeries(posn, rates);
  const pnl = posn.reduce((s, p) => s + p.unrealizedPnl, 0);
  const m = mean(daily), sd = std(daily), dn = Math.sqrt(mean(daily.filter((r) => r < 0).map((r) => r * r)) || 0);
  let cum = 1; const vals = [1]; for (const r of daily) { cum *= 1 + r; vals.push(cum); }
  const winRate = posn.length ? (posn.filter((p) => p.unrealizedPnl > 0).length / posn.length) * 100 : 0;
  const today = new Date().toISOString().slice(0, 10);
  const avgHold = posn.length ? mean(posn.map((p) => dayDiff(parseOpen(p.openTime) || today, today))) : 0;
  return { capital, pnl, returnPct: (pnl / capital) * 100, volAnnual: sd * Math.sqrt(TD) * 100, sharpe: sd > 0 ? (m / sd) * Math.sqrt(TD) : 0, sortino: dn > 0 ? (m / dn) * Math.sqrt(TD) : 0, maxDD: maxDD(vals), var95: Z95 * sd * 100, winRate, avgHold, daily, dates };
}

export function buildTactical(account: Account | null, positions: Position[], rates: SymbolRates, maxDays = 25, stopPct = 8, budgetPct = 20): TacticalData {
  const empty = { ok: false } as TacticalData;
  if (!account || positions.length === 0) return empty;
  const today = new Date().toISOString().slice(0, 10);
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  // sleeve split by holding period
  const tagged = positions.map((p) => ({ p, hold: dayDiff(parseOpen(p.openTime) || today, today) }));
  const tacticalPos = tagged.filter((x) => x.hold <= maxDays).map((x) => x.p);
  const corePos = tagged.filter((x) => x.hold > maxDays).map((x) => x.p);
  if (tacticalPos.length === 0) return { ...empty, ok: false, maxDays, stopPct, budgetPct } as TacticalData;

  const tacGross = tacticalPos.reduce((s, p) => s + Math.abs(p.marketValue), 0);

  // per-trade metrics
  const trades: Trade[] = tacticalPos.map((p) => {
    const openDate = parseOpen(p.openTime) || today;
    const holdingDays = dayDiff(openDate, today);
    const costBasis = Math.abs(p.entryPrice * p.volume), mv = Math.abs(p.currentPrice * p.volume);
    const returnPct = costBasis > 0 ? (p.unrealizedPnl / costBasis) * 100 : 0;
    const risk = costBasis * (stopPct / 100);
    const rMultiple = risk > 0 ? p.unrealizedPnl / risk : 0;
    const sign = p.direction === "Short" ? -1 : 1;
    const stopPrice = p.entryPrice * (1 - sign * stopPct / 100);
    const targetPrice = p.entryPrice * (1 + sign * 2 * stopPct / 100); // 2R target
    const distToStop = ((p.currentPrice - stopPrice) / p.currentPrice) * 100 * sign;
    const distToTarget = ((targetPrice - p.currentPrice) / p.currentPrice) * 100 * sign;
    // MFE/MAE from price history over holding window
    const series = rates[p.symbol]; let hi = p.entryPrice, lo = p.entryPrice;
    if (series) for (let i = 0; i < series.dates.length; i++) if (series.dates[i] >= openDate) { hi = Math.max(hi, series.close[i]); lo = Math.min(lo, series.close[i]); }
    const mfePct = sign * (hi / p.entryPrice - 1) * 100, maePct = sign * (lo / p.entryPrice - 1) * 100;
    const exitEff = mfePct > 0 ? (returnPct / mfePct) * 100 : returnPct >= 0 ? 100 : 0;
    const setupScore = Math.max(0, Math.min(100, 50 + rMultiple * 20 + (exitEff - 50) * 0.2));
    return { symbol: p.symbol, strategy: strategyOf(p.symbol), sector: classify(p.symbol).sector, openDate, holdingDays, entry: p.entryPrice, current: p.currentPrice, volume: p.volume, costBasis, mv, pnl: p.unrealizedPnl, returnPct, risk, rMultiple, stopPrice, targetPrice, distToStop, distToTarget, mfePct, maePct, exitEff, setupScore };
  }).sort((a, b) => b.pnl - a.pnl);

  // quality
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWinner = wins.length ? mean(wins.map((t) => t.returnPct)) : 0, avgLoser = losses.length ? mean(losses.map((t) => t.returnPct)) : 0;
  const expectancy = (winRate / 100) * avgWinner + (1 - winRate / 100) * avgLoser;
  const rBuckets: [number, number, string][] = [[-99, -1, "<-1R"], [-1, 0, "-1–0R"], [0, 1, "0–1R"], [1, 2, "1–2R"], [2, 99, ">2R"]];
  const rHist = rBuckets.map(([lo, hi, label]) => ({ label, n: trades.filter((t) => t.rMultiple >= lo && t.rMultiple < hi).length }));
  const quality = { winRate, avgWinner, avgLoser, profitFactor: grossLoss > 0 ? grossWin / grossLoss : Infinity, expectancy, avgR: mean(trades.map((t) => t.rMultiple)), largestWin: Math.max(...trades.map((t) => t.returnPct), 0), largestLoss: Math.min(...trades.map((t) => t.returnPct), 0), rHist };

  // sleeve perf
  const core = perfOf(corePos.length ? corePos : positions, rates);
  const tactical = perfOf(tacticalPos, rates);

  // alpha (tactical vs core daily returns aligned by tail length)
  const n = Math.min(core.daily.length, tactical.daily.length);
  const cR = core.daily.slice(core.daily.length - n), tR = tactical.daily.slice(tactical.daily.length - n);
  const excessSeries = tR.map((v, i) => v - cR[i]);
  const exMean = mean(excessSeries), exSd = std(excessSeries);
  const varC = std(cR) ** 2, covTC = (() => { const mc = mean(cR), mt = mean(tR); let s = 0; for (let i = 0; i < n; i++) s += (tR[i] - mt) * (cR[i] - mc); return n > 1 ? s / (n - 1) : 0; })();
  const beta = varC > 0 ? covTC / varC : 0;
  const corr = std(cR) > 0 && std(tR) > 0 ? covTC / (std(cR) * std(tR)) : 0;
  const alphaAnn = (mean(tR) - beta * mean(cR)) * TD * 100;
  const hitRate = n ? (excessSeries.filter((x) => x > 0).length / n) * 100 : 0;
  const upC = mean(cR.filter((x) => x > 0)) || 1e-9, upT = mean(tR.filter((_, i) => cR[i] > 0)) || 0;
  const capture = upC !== 0 ? (upT / upC) * 100 : 0;
  const rollAlpha = (k: number) => { const cc = cR.slice(-k), tt = tR.slice(-k); return (tt.reduce((a, b) => a + b, 0) - cc.reduce((a, b) => a + b, 0)) * 100; };
  const alpha = { excess: (tactical.returnPct - core.returnPct), infoRatio: exSd > 0 ? (exMean / exSd) * Math.sqrt(TD) : 0, alpha: alphaAnn, beta, corr, hitRate, capture, rolling: [{ period: "5d", v: rollAlpha(5) }, { period: "10d", v: rollAlpha(10) }, { period: "21d", v: rollAlpha(21) }, { period: "All", v: rollAlpha(n) }] };

  // contribution
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0) || 1;
  const tacVaR = tactical.var95 * tactical.capital / 100, coreVaR = core.var95 * core.capital / 100;
  const alloc = (tacGross / gross) * 100;
  const allocPnlShare = (tactical.pnl / totalPnl) * 100;
  const allocRiskShare = (tacVaR / (tacVaR + coreVaR || 1)) * 100;

  // risk
  const openRisk = trades.reduce((s, t) => s + t.risk, 0);
  const risk = { var95: tactical.var95, cvar: ES * std(tR) * 100, drawdown: tactical.maxDD, corr, concentration: trades.length ? Math.max(...trades.map((t) => (Math.abs(t.mv) / (tacGross || 1)) * 100)) : 0, beta, openRisk, leverage: tacGross / (account.equity || 1), remaining: budgetPct - alloc, overBudget: alloc > budgetPct };

  // strategies
  const stratMap = new Map<string, Trade[]>();
  for (const t of trades) { if (!stratMap.has(t.strategy)) stratMap.set(t.strategy, []); stratMap.get(t.strategy)!.push(t); }
  const strategies: StrategyPerf[] = [...stratMap.entries()].map(([strategy, ts]) => ({ strategy, n: ts.length, winRate: (ts.filter((t) => t.pnl > 0).length / ts.length) * 100, avgReturn: mean(ts.map((t) => t.returnPct)), avgHold: mean(ts.map((t) => t.holdingDays)), pnl: ts.reduce((s, t) => s + t.pnl, 0) })).sort((a, b) => b.pnl - a.pnl);

  // efficiency: return per $ risked
  const eff = [...trades].sort((a, b) => (b.pnl / (b.risk || 1)) - (a.pnl / (a.risk || 1)));
  const efficiency = { best: eff.slice(0, 5), worst: eff.slice(-5).reverse() };

  // health score
  const cRet = Math.max(0, Math.min(1, (tactical.sharpe + 0.5) / 2.5)) * 100;
  const cExec = Math.max(0, Math.min(1, mean(trades.map((t) => t.exitEff)) / 100)) * 100;
  const cRisk = risk.overBudget ? 30 : Math.max(0, Math.min(1, (budgetPct - alloc) / budgetPct)) * 100;
  const cCap = Math.max(0, Math.min(1, (quality.avgR + 1) / 3)) * 100;
  const cAlpha = Math.max(0, Math.min(1, (alpha.infoRatio + 0.5) / 2)) * 100;
  const cDisc = trades.length ? (trades.filter((t) => t.maePct > -stopPct).length / trades.length) * 100 : 100;
  const total = 0.2 * cRet + 0.2 * cExec + 0.2 * cRisk + 0.15 * cCap + 0.15 * cAlpha + 0.1 * cDisc;
  const label = total >= 90 ? "Excellent Tactical Performance" : total >= 75 ? "Strong" : total >= 60 ? "Moderate" : total >= 40 ? "Weak" : "Underperforming";

  // insights
  const insights: string[] = [];
  if (strategies[0]) insights.push(`${strategies[0].strategy} trades generated ${totalPnl !== 0 ? ((strategies[0].pnl / (trades.reduce((s, t) => s + t.pnl, 0) || 1)) * 100).toFixed(0) : 0}% of tactical P&L across ${strategies[0].n} trade${strategies[0].n === 1 ? "" : "s"}.`);
  const topRiskStrat = [...stratMap.entries()].map(([s, ts]) => ({ s, mv: ts.reduce((a, t) => a + t.mv, 0) })).sort((a, b) => b.mv - a.mv)[0];
  if (topRiskStrat) insights.push(`${topRiskStrat.s} accounts for ${((topRiskStrat.mv / (tacGross || 1)) * 100).toFixed(0)}% of tactical exposure.`);
  if (risk.overBudget) insights.push(`Tactical allocation (${alloc.toFixed(0)}%) exceeds the ${budgetPct}% budget — reduce opportunistic exposure.`);
  else insights.push(`Tactical allocation (${alloc.toFixed(0)}%) is within the ${budgetPct}% risk budget (${risk.remaining.toFixed(0)}% headroom).`);
  insights.push(`The tactical sleeve has contributed ${allocPnlShare.toFixed(0)}% of portfolio P&L on ${alloc.toFixed(0)}% of capital${allocPnlShare > alloc ? " — positive capital efficiency" : ""}.`);
  if (alpha.infoRatio !== 0) insights.push(`Information ratio vs core is ${alpha.infoRatio.toFixed(2)} (correlation ${corr.toFixed(2)}, beta ${beta.toFixed(2)}) — tactical risk is ${corr < 0.5 ? "diversifying" : "amplifying"} core risk.`);
  const lowEff = trades.filter((t) => t.exitEff < 50 && t.mfePct > 3);
  if (lowEff[0]) insights.push(`${lowEff[0].symbol} captured only ${lowEff[0].exitEff.toFixed(0)}% of a ${lowEff[0].mfePct.toFixed(0)}% favourable move — exit timing is leaking returns.`);
  const nearStop = trades.filter((t) => t.distToStop < 3 && t.distToStop > -100);
  if (nearStop[0]) insights.push(`${nearStop[0].symbol} is within ${nearStop[0].distToStop.toFixed(1)}% of its assumed stop — monitor closely.`);

  const summary = `The tactical sleeve currently represents ${alloc.toFixed(0)}% of portfolio capital and has contributed ${allocPnlShare.toFixed(0)}% of total P&L while accounting for ~${allocRiskShare.toFixed(0)}% of portfolio risk. ${strategies[0] ? `${strategies[0].strategy} ${strategies[0].pnl >= 0 ? "leads" : "lags"} on P&L; ` : ""}win rate ${winRate.toFixed(0)}% with an average R of ${quality.avgR.toFixed(2)} (assumed ${stopPct}% stop). Tactical Sharpe ${tactical.sharpe.toFixed(2)} vs core ${core.sharpe.toFixed(2)}, information ratio ${alpha.infoRatio.toFixed(2)}. Allocation is ${risk.overBudget ? "ABOVE" : "within"} the ${budgetPct}% budget. Tactical Health Score: ${total.toFixed(0)}/100 (${label}).`;

  return { ok: true, maxDays, stopPct, budgetPct, trades, coreCount: corePos.length, alloc, allocPnlShare, allocRiskShare, core, tactical, quality, alpha, risk, strategies, efficiency, health: { total, label, components: { ret: cRet, exec: cExec, risk: cRisk, capital: cCap, alpha: cAlpha, discipline: cDisc } }, insights: insights.slice(0, 10), summary };
}
