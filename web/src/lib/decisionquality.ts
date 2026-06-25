// Decision Quality Engine. Scores every trade on PROCESS, independent of P&L,
// to separate skill from luck. A rule-breaking winner scores low; a plan-
// following loser scores high. Process dimensions that need trade-plan metadata
// (stops/targets/thesis — absent in the live feed) use clearly-labelled proxies;
// entry/size/risk-reward/exit use real MFE/MAE from price history.

import type { Account, Position, SymbolRates } from "./types";
import { classify } from "./sectors";
import { strategyOf } from "./tactical";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseOpen(s: string): string { const t = s.trim().split(/\s+/); if (t.length < 3) return ""; const d = +t[0], mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], y = +t[2]; return Number.isFinite(d) && mo !== undefined ? `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : ""; }
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export interface DQTrade {
  symbol: string; strategy: string; sector: string; openDate: string; holdingDays: number;
  weight: number; returnPct: number; mfe: number; mae: number; exitEff: number; r: number;
  decision: number; outcome: number; quadrant: 1 | 2 | 3 | 4; quadLabel: string;
  components: { plan: number; entry: number; size: number; stop: number; rr: number; exit: number; thesis: number };
  violations: string[]; luckSkill: string;
}
export interface DQData {
  ok: boolean;
  decisionScore: number; outcomeScore: number; processAdherence: number; discipline: number; riskMgmt: number; avgLast: number; improvement: number; violationCount: number;
  rating: string;
  quadrants: { q1: number; q2: number; q3: number; q4: number };
  componentAvg: { plan: number; entry: number; size: number; stop: number; rr: number; exit: number; thesis: number };
  skillPct: number; luckPct: number; alignment: number;
  violations: { name: string; count: number; severity: number; measurable: boolean }[];
  timeline: { date: string; symbol: string; decision: number; outcome: number; quadrant: number; violations: number }[];
  trades: DQTrade[];
  coach: string[];
  report: { continue: string[]; stop: string[]; improve: string[] };
}

type Raw = unknown;

const WEIGHTS = { plan: 0.2, entry: 0.15, size: 0.15, stop: 0.15, rr: 0.15, exit: 0.1, thesis: 0.1 };
const QUAD_LABEL: Record<number, string> = { 1: "Good Decision · Good Outcome", 2: "Good Decision · Bad Outcome", 3: "Bad Decision · Good Outcome", 4: "Bad Decision · Bad Outcome" };
const QUAD_INSIGHT: Record<number, string> = {
  1: "Excellent trade — repeat this process.",
  2: "Correct process; loss was market randomness. Don't change strategy on this trade.",
  3: "Profit from poor behaviour — success was luck, not discipline. Do not repeat.",
  4: "High-priority mistake — review before similar trades.",
};

export function buildDecisionQuality(account: Account | null, positions: Position[], rates: SymbolRates, stopPct = 8, _raw?: Raw): DQData {
  const empty = { ok: false } as DQData;
  if (!account || positions.length === 0) return empty;
  const today = new Date().toISOString().slice(0, 10);
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  // averaging detection per symbol (for violations)
  const lotsBySym = new Map<string, Position[]>(); for (const p of positions) { if (!lotsBySym.has(p.symbol)) lotsBySym.set(p.symbol, []); lotsBySym.get(p.symbol)!.push(p); }

  const trades: DQTrade[] = positions.map((p) => {
    const openDate = parseOpen(p.openTime) || today;
    const holdingDays = dayDiff(openDate, today);
    const costBasis = Math.abs(p.entryPrice * p.volume);
    const returnPct = costBasis > 0 ? (p.unrealizedPnl / costBasis) * 100 : 0;
    const weight = (Math.abs(p.marketValue) / gross) * 100;
    const sign = p.direction === "Short" ? -1 : 1;
    const series = rates[p.symbol]; let hi = p.entryPrice, lo = p.entryPrice;
    if (series) for (let i = 0; i < series.dates.length; i++) if (series.dates[i] >= openDate) { hi = Math.max(hi, series.close[i]); lo = Math.min(lo, series.close[i]); }
    const mfe = sign * (hi / p.entryPrice - 1) * 100, mae = sign * (lo / p.entryPrice - 1) * 100;
    const exitEff = mfe > 0 ? clamp01(returnPct / mfe) * 100 : returnPct >= 0 ? 100 : 0;
    const r = (costBasis * stopPct / 100) > 0 ? p.unrealizedPnl / (costBasis * stopPct / 100) : 0;

    // outcome-independent component scores (0..1)
    const stopRespected = mae > -stopPct;
    const cEntry = clamp01((stopPct + mae) / stopPct);                 // entered without immediate adverse move
    const cSize = weight >= 3 && weight <= 8 ? 1 : weight < 3 ? 0.7 : clamp01((14 - weight) / 6);
    const cStop = 0.4 + (stopRespected ? 0.6 : 0);                      // no explicit stop in data → capped; bonus if assumed stop held
    const cRR = Math.abs(mae) > 0.5 ? clamp01(mfe / Math.abs(mae) / 2) : 0.6;
    const cExit = clamp01(exitEff / 100);
    const cThesis = 0.6;                                                // thesis not captured in data → neutral
    const cPlan = clamp01(0.5 * cSize + 0.5 * (stopRespected ? 1 : 0.4)); // proxy: size + stop adherence
    const components = { plan: cPlan, entry: cEntry, size: cSize, stop: cStop, rr: cRR, exit: cExit, thesis: cThesis };
    const decision = (WEIGHTS.plan * cPlan + WEIGHTS.entry * cEntry + WEIGHTS.size * cSize + WEIGHTS.stop * cStop + WEIGHTS.rr * cRR + WEIGHTS.exit * cExit + WEIGHTS.thesis * cThesis) * 100;
    const outcome = clamp01((returnPct + 10) / 20) * 100;

    const decisionGood = decision >= 65, outcomeGood = returnPct > 0;
    const quadrant = (decisionGood && outcomeGood ? 1 : decisionGood && !outcomeGood ? 2 : !decisionGood && outcomeGood ? 3 : 4) as 1 | 2 | 3 | 4;

    // violations
    const violations: string[] = [];
    if (weight > 10) violations.push("Oversized position");
    if (!stopRespected) violations.push("Adverse move beyond assumed stop");
    const lots = lotsBySym.get(p.symbol)!;
    if (lots.length > 1) { const sorted = [...lots].sort((a, b) => (parseOpen(a.openTime) || "").localeCompare(parseOpen(b.openTime) || "")); if (sorted[sorted.length - 1].entryPrice > sorted[0].entryPrice * 1.005 && returnPct < 0) violations.push("Added higher into a decliner"); if (sorted[sorted.length - 1].entryPrice < sorted[0].entryPrice * 0.995) violations.push("Averaged down"); }
    if (mfe > 2 * stopPct && exitEff < 50) violations.push("Round-tripped gains (ignored target)");
    if (returnPct < -stopPct && holdingDays > 20) violations.push("Holding a loser long");
    violations.push("No predefined stop/target"); // standing data gap

    const luckSkill = quadrant === 1 ? "Skill — sound process, paid off" : quadrant === 2 ? "Sound but unlucky" : quadrant === 3 ? "Luck — unsound process, lucky outcome" : "Mistake — unsound process, lost";
    return { symbol: p.symbol, strategy: strategyOf(p.symbol), sector: classify(p.symbol).sector, openDate, holdingDays, weight, returnPct, mfe, mae, exitEff, r, decision, outcome, quadrant, quadLabel: QUAD_LABEL[quadrant], components, violations, luckSkill };
  }).sort((a, b) => a.openDate.localeCompare(b.openDate));

  const decisionScore = mean(trades.map((t) => t.decision));
  const outcomeScore = mean(trades.map((t) => t.outcome));
  const adherent = trades.filter((t) => t.components.size >= 0.7 && t.mae > -stopPct).length;
  const processAdherence = (adherent / trades.length) * 100;
  const weights = trades.map((t) => t.weight);
  const sizingConsistency = mean(weights) > 0 ? clamp01(1 - std(weights) / mean(weights)) * 100 : 0;
  const violAll = trades.flatMap((t) => t.violations.filter((v) => v !== "No predefined stop/target"));
  const violationCount = violAll.length;
  const discipline = clamp01(processAdherence / 100 * 0.6 + (1 - Math.min(1, violationCount / (trades.length * 1.5))) * 0.4) * 100;
  const riskMgmt = clamp01(0.6 * (sizingConsistency / 100) + 0.4 * (trades.filter((t) => t.weight <= 10).length / trades.length)) * 100;

  const q = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of trades) q[`q${t.quadrant}` as "q1"]++;

  const componentAvg = { plan: mean(trades.map((t) => t.components.plan)) * 100, entry: mean(trades.map((t) => t.components.entry)) * 100, size: mean(trades.map((t) => t.components.size)) * 100, stop: mean(trades.map((t) => t.components.stop)) * 100, rr: mean(trades.map((t) => t.components.rr)) * 100, exit: mean(trades.map((t) => t.components.exit)) * 100, thesis: mean(trades.map((t) => t.components.thesis)) * 100 };

  // luck vs skill: correlation between decision and outcome
  const ds = trades.map((t) => t.decision), os = trades.map((t) => t.outcome);
  const md = mean(ds), mo = mean(os), sd = std(ds), so = std(os);
  let cov = 0; for (let i = 0; i < trades.length; i++) cov += (ds[i] - md) * (os[i] - mo); cov /= Math.max(1, trades.length - 1);
  const alignment = sd > 0 && so > 0 ? cov / (sd * so) : 0;
  const skillPct = clamp01((alignment + 1) / 2) * 100;
  const luckPct = 100 - skillPct;

  const half = Math.floor(trades.length / 2);
  const improvement = trades.length >= 4 ? mean(trades.slice(half).map((t) => t.decision)) - mean(trades.slice(0, half).map((t) => t.decision)) : 0;

  // violation aggregation
  const vmap = new Map<string, number>(); for (const v of trades.flatMap((t) => t.violations)) vmap.set(v, (vmap.get(v) ?? 0) + 1);
  const sevMap: Record<string, number> = { "Oversized position": 70, "Adverse move beyond assumed stop": 50, "Added higher into a decliner": 75, "Averaged down": 65, "Round-tripped gains (ignored target)": 60, "Holding a loser long": 70, "No predefined stop/target": 55 };
  const violations = [...vmap.entries()].map(([name, count]) => ({ name, count, severity: sevMap[name] ?? 40, measurable: true })).sort((a, b) => b.count * b.severity - a.count * a.severity);
  violations.push({ name: "Revenge trading", count: 0, severity: 0, measurable: false }, { name: "Emotional exit", count: 0, severity: 0, measurable: false });

  const timeline = trades.map((t) => ({ date: t.openDate.slice(5), symbol: t.symbol, decision: +t.decision.toFixed(0), outcome: +t.outcome.toFixed(0), quadrant: t.quadrant, violations: t.violations.filter((v) => v !== "No predefined stop/target").length }));
  const rating = decisionScore >= 90 ? "Elite" : decisionScore >= 80 ? "Excellent" : decisionScore >= 70 ? "Good" : decisionScore >= 60 ? "Acceptable" : "Needs Improvement";

  // coach
  const coach: string[] = [];
  if (q.q3 > 0) coach.push(`${q.q3} profitable trade${q.q3 > 1 ? "s" : ""} scored as poor decisions (Quadrant 3) — these wins were luck, not process. Do not reinforce them.`);
  if (q.q2 > 0) coach.push(`${q.q2} sound decision${q.q2 > 1 ? "s" : ""} produced losses (Quadrant 2) — correct process; don't abandon the approach over these.`);
  const lowExit = trades.filter((t) => t.exitEff < 50 && t.mfe > 3);
  if (lowExit.length) coach.push(`You frequently let gains round-trip — ${lowExit.length} trade(s) captured under half of a 3%+ favourable move.`);
  coach.push(`Process adherence is ${processAdherence.toFixed(0)}%; the weakest decision component is ${Object.entries(componentAvg).sort((a, b) => a[1] - b[1])[0][0]} (${Object.entries(componentAvg).sort((a, b) => a[1] - b[1])[0][1].toFixed(0)}/100).`);
  coach.push(`No predefined stops/targets exist in the data — defining them would lift the Stop & Plan components and convert luck into measurable skill.`);
  if (alignment < 0.2) coach.push(`Decision scores and outcomes are weakly correlated (${alignment.toFixed(2)}) — current results are more luck- than skill-driven over this small sample.`);
  else coach.push(`Decision quality and outcomes are aligned (${alignment.toFixed(2)}) — results are tracking process, a sign of genuine edge.`);
  if (improvement > 3) coach.push(`Decision quality has improved (${improvement.toFixed(0)} pts) across the trade sequence — process is trending up.`);

  const report = {
    continue: [trades.length ? `Best process trades: ${[...trades].sort((a, b) => b.decision - a.decision)[0].symbol} (${[...trades].sort((a, b) => b.decision - a.decision)[0].decision.toFixed(0)})` : "", "Disciplined position sizing where applied", "Trading your known strategies"].filter(Boolean),
    stop: [q.q3 > 0 ? "Treating lucky winners as validation" : "", violations.find((v) => v.name === "Averaged down" && v.count) ? "Averaging down into losers" : "", violations.find((v) => v.name === "Added higher into a decliner" && v.count) ? "Adding higher into decliners" : "", "Trading without predefined stops"].filter(Boolean),
    improve: [`Exit discipline (capture more of MFE; current exit component ${componentAvg.exit.toFixed(0)})`, `Define a stop & target per idea (Stop component ${componentAvg.stop.toFixed(0)})`, sizingConsistency < 60 ? "Tighten sizing to a repeatable band" : "Maintain sizing discipline"],
  };

  return { ok: true, decisionScore, outcomeScore, processAdherence, discipline, riskMgmt, avgLast: decisionScore, improvement, violationCount, rating, quadrants: q, componentAvg, skillPct, luckPct, alignment, violations, timeline, trades, coach: coach.slice(0, 10), report };
}

export { QUAD_INSIGHT };
