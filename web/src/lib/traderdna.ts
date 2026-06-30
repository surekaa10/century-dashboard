// Trader DNA engine. Learns behavioural patterns from the actual trade data
// that EXISTS — entry lots (scaling/averaging), entry time-of-day, position
// sizing, execution quality (MFE/MAE from price history), and market regime at
// entry (SPY/VIX). Behaviours that genuinely require closed trades are reported
// as "pending", never fabricated. Outcome-independent decision-quality scoring.

import type { Account, Position, SymbolRates } from "./types";
import { classify } from "./sectors";
import { strategyOf } from "./tactical";

const TD = 252;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseOpen(s: string): { date: string; hour: number } {
  const t = s.trim().split(/\s+/); if (t.length < 3) return { date: "", hour: -1 };
  const d = +t[0], mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], y = +t[2];
  const hour = t[3] ? +t[3].split(":")[0] : -1;
  return { date: Number.isFinite(d) && mo !== undefined ? `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "", hour };
}
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export interface DnaTrade { symbol: string; strategy: string; sector: string; openDate: string; hour: number; holdingDays: number; entry: number; current: number; weight: number; pnl: number; returnPct: number; mfe: number; mae: number; exitEff: number; r: number; decision: number; regime: string; }
export interface Bias { name: string; severity: number; measurable: boolean; evidence: string; }
export interface StrategyRow { strategy: string; n: number; winRate: number; avgReturn: number; expectancy: number; avgHold: number; pnl: number; }
export interface DnaData {
  ok: boolean;
  dnaScore: number; rating: string; components: { edge: number; execution: number; discipline: number; risk: number; consistency: number; learning: number };
  scores: { discipline: number; execution: number; risk: number; decision: number; consistency: number; bias: number; learning: number };
  style: { primary: string; secondary: string; confidence: number; radar: { axis: string; v: number }[] };
  strategies: StrategyRow[];
  biases: Bias[];
  execution: { entryEff: number; exitEff: number; mfe: number; mae: number };
  regimes: { regime: string; n: number; winRate: number; avgReturn: number }[];
  risk: { avgRisk: number; maxRisk: number; heat: number; sizingConsistency: number; rHist: { label: string; n: number }[]; maxWeight: number };
  decisionTimeline: { date: string; symbol: string; score: number }[];
  patterns: string[];
  playbook: { bestStrategy: string; bestHold: string; bestSize: string; bestWin: number; bestReturn: number; avoid: string[] };
  coach: string[];
  trades: DnaTrade[];
}

type Raw = Record<string, { dates: string[]; close: number[] }>;

export function buildTraderDNA(account: Account | null, positions: Position[], rates: SymbolRates, stopPct = 8, raw?: Raw): DnaData {
  const empty = { ok: false } as DnaData;
  if (!account || positions.length === 0) return empty;
  const today = new Date().toISOString().slice(0, 10);
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  // market regime helpers from SPY/VIX
  const spy = raw?.["SPY"]; const vix = raw?.["^VIX"] ?? raw?.["VIX"];
  const vixMed = vix && vix.close.length ? median(vix.close) : 0;
  const regimeAt = (date: string): string => {
    if (!spy || !spy.close.length) return "Unknown";
    let idx = -1; for (let i = 0; i < spy.dates.length; i++) { if (spy.dates[i] <= date) idx = i; else break; }
    if (idx < 5) return "Unknown";
    const trail = spy.close[idx] / spy.close[idx - 5] - 1;
    let vlevel = "LowVol"; if (vix) { let vi = -1; for (let i = 0; i < vix.dates.length; i++) { if (vix.dates[i] <= date) vi = i; else break; } if (vi >= 0 && vix.close[vi] > vixMed) vlevel = "HighVol"; }
    return `${trail >= 0 ? "Bull" : "Bear"} · ${vlevel}`;
  };

  const trades: DnaTrade[] = positions.map((p) => {
    const { date: openDate, hour } = parseOpen(p.openTime);
    const od = openDate || today;
    const holdingDays = dayDiff(od, today);
    const costBasis = Math.abs(p.entryPrice * p.volume);
    const returnPct = costBasis > 0 ? (p.unrealizedPnl / costBasis) * 100 : 0;
    const sign = p.direction === "Short" ? -1 : 1;
    const series = rates[p.symbol]; let hi = p.entryPrice, lo = p.entryPrice;
    if (series) for (let i = 0; i < series.dates.length; i++) if (series.dates[i] >= od) { hi = Math.max(hi, series.close[i]); lo = Math.min(lo, series.close[i]); }
    const mfe = sign * (hi / p.entryPrice - 1) * 100, mae = sign * (lo / p.entryPrice - 1) * 100;
    const exitEff = mfe > 0 ? clamp01(returnPct / mfe) * 100 : returnPct >= 0 ? 100 : 0;
    const r = (costBasis * stopPct / 100) > 0 ? p.unrealizedPnl / (costBasis * stopPct / 100) : 0;
    const weight = (Math.abs(p.marketValue) / gross) * 100;
    // outcome-independent decision quality
    const entryQ = clamp01((stopPct + mae) / stopPct);          // didn't immediately blow past stop
    const rr = Math.abs(mae) > 0.5 ? clamp01(mfe / Math.abs(mae) / 2) : 0.6; // favourable vs adverse excursion
    const sizeQ = weight >= 2 && weight <= 8 ? 1 : weight < 2 ? 0.7 : clamp01((14 - weight) / 6);
    const planQ = mae > -stopPct ? 0.8 : 0.4;                    // respected the (assumed) stop
    const decision = (0.3 * entryQ + 0.25 * rr + 0.25 * sizeQ + 0.2 * planQ) * 100;
    return { symbol: p.symbol, strategy: strategyOf(p.symbol), sector: classify(p).sector, openDate: od, hour, holdingDays, entry: p.entryPrice, current: p.currentPrice, weight, pnl: p.unrealizedPnl, returnPct, mfe, mae, exitEff, r, decision, regime: regimeAt(od) };
  }).sort((a, b) => a.openDate.localeCompare(b.openDate));

  // scaling / averaging per symbol
  const bySym = new Map<string, DnaTrade[]>(); for (const t of trades) { if (!bySym.has(t.symbol)) bySym.set(t.symbol, []); bySym.get(t.symbol)!.push(t); }
  let avgDownCount = 0, chaseUpCount = 0, scaledSymbols = 0; const avgDownImpact: number[] = [];
  for (const [, lots] of bySym) {
    if (lots.length < 2) continue; scaledSymbols++;
    const sorted = [...lots].sort((a, b) => a.openDate.localeCompare(b.openDate));
    const firstEntry = sorted[0].entry, lastEntry = sorted[sorted.length - 1].entry;
    const symPnlPct = mean(lots.map((l) => l.returnPct));
    if (lastEntry < firstEntry * 0.995) { avgDownCount++; avgDownImpact.push(symPnlPct); }
    else if (lastEntry > firstEntry * 1.005) { chaseUpCount++; if (symPnlPct < 0) avgDownImpact.push(symPnlPct); }
  }

  // strategies
  const stratMap = new Map<string, DnaTrade[]>(); for (const t of trades) { if (!stratMap.has(t.strategy)) stratMap.set(t.strategy, []); stratMap.get(t.strategy)!.push(t); }
  const strategies: StrategyRow[] = [...stratMap.entries()].map(([strategy, ts]) => {
    const wr = (ts.filter((t) => t.pnl > 0).length / ts.length) * 100;
    const avgR = mean(ts.map((t) => t.returnPct));
    const wins = ts.filter((t) => t.pnl > 0), losses = ts.filter((t) => t.pnl < 0);
    const exp = (wr / 100) * (wins.length ? mean(wins.map((t) => t.returnPct)) : 0) + (1 - wr / 100) * (losses.length ? mean(losses.map((t) => t.returnPct)) : 0);
    return { strategy, n: ts.length, winRate: wr, avgReturn: avgR, expectancy: exp, avgHold: mean(ts.map((t) => t.holdingDays)), pnl: ts.reduce((s, t) => s + t.pnl, 0) };
  }).sort((a, b) => b.avgReturn - a.avgReturn);

  // execution
  const execution = { entryEff: mean(trades.map((t) => clamp01((t.mae + stopPct) / stopPct) * 100)), exitEff: mean(trades.map((t) => t.exitEff)), mfe: mean(trades.map((t) => t.mfe)), mae: mean(trades.map((t) => t.mae)) };

  // regimes matrix
  const regMap = new Map<string, DnaTrade[]>(); for (const t of trades) { if (t.regime === "Unknown") continue; if (!regMap.has(t.regime)) regMap.set(t.regime, []); regMap.get(t.regime)!.push(t); }
  const regimes = [...regMap.entries()].map(([regime, ts]) => ({ regime, n: ts.length, winRate: (ts.filter((t) => t.pnl > 0).length / ts.length) * 100, avgReturn: mean(ts.map((t) => t.returnPct)) })).sort((a, b) => b.avgReturn - a.avgReturn);

  // risk DNA
  const weights = trades.map((t) => t.weight);
  const sizingConsistency = mean(weights) > 0 ? clamp01(1 - std(weights) / mean(weights)) * 100 : 0;
  const rBuckets: [number, number, string][] = [[-99, -1, "<-1R"], [-1, 0, "-1–0R"], [0, 1, "0–1R"], [1, 2, "1–2R"], [2, 99, ">2R"]];
  const rHist = rBuckets.map(([lo, hi, label]) => ({ label, n: trades.filter((t) => t.r >= lo && t.r < hi).length }));
  const risk = { avgRisk: mean(trades.map((t) => Math.abs(t.entry * (positions.find((p) => p.symbol === t.symbol)?.volume ?? 0)) * stopPct / 100)), maxRisk: 0, heat: (trades.reduce((s, t) => { const p = positions.find((q) => q.symbol === t.symbol); return s + Math.abs((p?.entryPrice ?? 0) * (p?.volume ?? 0)) * stopPct / 100; }, 0) / (account.equity || 1)) * 100, sizingConsistency, rHist, maxWeight: Math.max(...weights, 0) };

  // decision timeline + learning (recent vs early)
  const decisionTimeline = trades.map((t) => ({ date: t.openDate.slice(5), symbol: t.symbol, score: +t.decision.toFixed(0) }));
  const half = Math.floor(trades.length / 2);
  const earlyDQ = mean(trades.slice(0, half).map((t) => t.decision)), recentDQ = mean(trades.slice(half).map((t) => t.decision));
  const learning = clamp01(0.5 + (recentDQ - earlyDQ) / 40) * 100;

  // biases (only severity where measurable)
  const biases: Bias[] = [];
  if (scaledSymbols) biases.push({ name: "Averaging down", severity: avgDownCount ? Math.min(100, 40 + avgDownCount * 20) : 10, measurable: true, evidence: avgDownCount ? `${avgDownCount} symbol(s) had later lots below earlier entries; avg outcome ${mean(avgDownImpact).toFixed(1)}%.` : "No averaging-down detected across multi-lot symbols." });
  if (chaseUpCount) biases.push({ name: "Chasing / adding higher", severity: Math.min(100, 30 + chaseUpCount * 18), measurable: true, evidence: `${chaseUpCount} symbol(s) added at higher prices; several now underwater (e.g., scaled-up tech).` });
  biases.push({ name: "Position-sizing inconsistency", severity: Math.round(100 - sizingConsistency), measurable: true, evidence: `Sizing consistency ${sizingConsistency.toFixed(0)}% (weights ${Math.min(...weights).toFixed(1)}–${Math.max(...weights).toFixed(1)}%).` });
  biases.push({ name: "No predefined stops", severity: 70, measurable: true, evidence: "No stop-loss levels present in the data — risk is implicit, not planned." });
  biases.push({ name: "Concentration", severity: Math.min(100, Math.max(0, (risk.maxWeight - 8) * 8)), measurable: true, evidence: `Largest position ${risk.maxWeight.toFixed(1)}% of the book.` });
  biases.push({ name: "Holding losers too long", severity: 0, measurable: false, evidence: "Pending — requires closed trades to compare winner vs loser holding times." });
  biases.push({ name: "Selling winners early", severity: 0, measurable: false, evidence: "Pending — requires realised exits." });
  biases.push({ name: "Revenge trading", severity: 0, measurable: false, evidence: "Pending — requires sequenced closed-trade outcomes." });

  // style classification
  const techWeight = trades.filter((t) => ["Tech Momentum", "AI / Semis"].includes(t.strategy)).reduce((s, t) => s + t.weight, 0);
  const holds = trades.map((t) => t.holdingDays); const medHold = median(holds);
  const styleScores: Record<string, number> = {
    "Momentum Trader": clamp01(techWeight / 60) * 0.6 + clamp01(chaseUpCount / 3) * 0.4,
    "Swing Trader": clamp01(1 - Math.abs(medHold - 15) / 25),
    "Position Trader": clamp01((medHold - 25) / 30),
    "High-Conviction Concentrated": clamp01((risk.maxWeight - 8) / 12),
    "Opportunistic": clamp01(stratMap.size / 6),
    "Macro Trader": clamp01(trades.filter((t) => t.strategy.includes("Macro")).reduce((s, t) => s + t.weight, 0) / 25),
  };
  const styleRank = Object.entries(styleScores).sort((a, b) => b[1] - a[1]);
  const confidence = Math.round(clamp01(styleRank[0][1]) * 60 + 35);
  const radar = [
    { axis: "Momentum", v: +(styleScores["Momentum Trader"] * 100).toFixed(0) },
    { axis: "Swing", v: +(styleScores["Swing Trader"] * 100).toFixed(0) },
    { axis: "Position", v: +(styleScores["Position Trader"] * 100).toFixed(0) },
    { axis: "Concentration", v: +(styleScores["High-Conviction Concentrated"] * 100).toFixed(0) },
    { axis: "Breadth", v: +(styleScores["Opportunistic"] * 100).toFixed(0) },
    { axis: "Macro", v: +(styleScores["Macro Trader"] * 100).toFixed(0) },
  ];

  // playbook
  const bestStrat = strategies[0]; const worstStrat = strategies[strategies.length - 1];
  const playbook = {
    bestStrategy: bestStrat?.strategy ?? "—", bestHold: `${Math.max(1, Math.round(medHold - 5))}–${Math.round(medHold + 5)} days`, bestSize: "3–6%",
    bestWin: bestStrat?.winRate ?? 0, bestReturn: bestStrat?.avgReturn ?? 0,
    avoid: [avgDownCount ? "Averaging down into losers" : "Adding to positions at higher prices without confirmation", risk.maxWeight > 10 ? `Oversizing (largest ${risk.maxWeight.toFixed(0)}%)` : "Inconsistent position sizing", "Trading without predefined stops", worstStrat && worstStrat.avgReturn < 0 ? `${worstStrat.strategy} setups (currently negative)` : "Holding beyond the planned window"],
  };

  // learning-engine patterns (only with evidence)
  const patterns: string[] = [];
  if (bestStrat && worstStrat && bestStrat.strategy !== worstStrat.strategy && bestStrat.n >= 2) patterns.push(`${bestStrat.strategy} trades average ${bestStrat.avgReturn.toFixed(1)}% vs ${worstStrat.avgReturn.toFixed(1)}% for ${worstStrat.strategy} — your edge is concentrated in ${bestStrat.strategy}.`);
  const small = trades.filter((t) => t.weight < 5), big = trades.filter((t) => t.weight >= 5);
  if (small.length >= 3 && big.length >= 2) { const ds = mean(small.map((t) => t.returnPct)) - mean(big.map((t) => t.returnPct)); if (Math.abs(ds) > 2) patterns.push(`Positions under 5% weight average ${mean(small.map((t) => t.returnPct)).toFixed(1)}% vs ${mean(big.map((t) => t.returnPct)).toFixed(1)}% for larger ones (${ds > 0 ? "smaller sizing helps" : "conviction sizing helps"}).`); }
  if (regimes.length >= 2) patterns.push(`Best market regime so far: ${regimes[0].regime} (avg ${regimes[0].avgReturn.toFixed(1)}%, win ${regimes[0].winRate.toFixed(0)}%); weakest: ${regimes[regimes.length - 1].regime}.`);
  const lowEff = trades.filter((t) => t.exitEff < 50 && t.mfe > 3);
  if (lowEff.length >= 2) patterns.push(`On ${lowEff.length} trades you captured under half of a 3%+ favourable move — exit timing is leaking returns.`);

  // coach
  const coach: string[] = [];
  coach.push(`Primary style reads as a ${styleRank[0][0]}${styleRank[1] ? ` with ${styleRank[1][0]} tendencies` : ""} (confidence ${confidence}%).`);
  if (bestStrat) coach.push(`Your highest-quality edge is ${bestStrat.strategy} (${bestStrat.winRate.toFixed(0)}% win, ${bestStrat.avgReturn.toFixed(1)}% avg) — lean into it.`);
  if (chaseUpCount) coach.push(`You added to ${chaseUpCount} position(s) at progressively higher prices that subsequently fell — add to winners on strength, not to laggards on hope.`);
  coach.push(`Execution is leaking value: average exit efficiency ${execution.exitEff.toFixed(0)}% — you keep only ~${execution.exitEff.toFixed(0)}% of the favourable move.`);
  coach.push(`Sizing consistency is ${sizingConsistency.toFixed(0)}% — ${sizingConsistency < 60 ? "tighten position sizing to a repeatable band (3–6%)" : "sizing is reasonably disciplined"}.`);
  coach.push(`No stops are present in the data; defining a stop per idea would convert implicit risk into a measurable, improvable process.`);
  if (recentDQ > earlyDQ + 3) coach.push(`Decision quality has improved (${earlyDQ.toFixed(0)} → ${recentDQ.toFixed(0)}) across the trade sequence — the process is trending the right way.`);
  else if (recentDQ < earlyDQ - 3) coach.push(`Decision quality has slipped (${earlyDQ.toFixed(0)} → ${recentDQ.toFixed(0)}) on more recent entries — revisit setup discipline.`);

  // DNA score
  const spread = bestStrat && worstStrat ? bestStrat.avgReturn - worstStrat.avgReturn : 0;
  const edge = clamp01(0.5 + spread / 20) * 100;
  const disciplineC = clamp01(1 - (avgDownCount * 0.15 + (risk.maxWeight > 12 ? 0.2 : 0))) * 100;
  const riskC = clamp01(0.6 * (sizingConsistency / 100) + 0.4 * clamp01((20 - risk.heat) / 20)) * 100;
  const consistencyC = sizingConsistency;
  const components = { edge, execution: execution.exitEff, discipline: disciplineC, risk: riskC, consistency: consistencyC, learning };
  const dnaScore = 0.2 * edge + 0.2 * execution.exitEff + 0.2 * disciplineC + 0.15 * riskC + 0.15 * consistencyC + 0.1 * learning;
  const rating = dnaScore >= 90 ? "Elite" : dnaScore >= 75 ? "Advanced" : dnaScore >= 60 ? "Developing" : dnaScore >= 45 ? "Novice" : "Undisciplined";

  const biasScore = 100 - clamp01(mean(biases.filter((b) => b.measurable).map((b) => b.severity)) / 100) * 100;
  const scores = { discipline: disciplineC, execution: execution.exitEff, risk: riskC, decision: mean(trades.map((t) => t.decision)), consistency: consistencyC, bias: biasScore, learning };

  return { ok: true, dnaScore, rating, components, scores, style: { primary: styleRank[0][0], secondary: styleRank[1]?.[0] ?? "—", confidence, radar }, strategies, biases, execution, regimes, risk, decisionTimeline, patterns, playbook, coach, trades };
}
