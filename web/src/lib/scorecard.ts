// Portfolio Quality Scorecard. Synthesises the existing analytics engines into a
// single 0–100 Portfolio Health Score across four 25-pt pillars: Return,
// Diversification, Risk, Concentration. Plus strengths/weaknesses,
// recommendations, benchmark comparison, score history, and a CIO review.

import type { Account, Position, SymbolRates } from "./types";
import { buildAnalytics, type Benchmark } from "./analytics";
import { buildRisk } from "./risk";
import { buildDiversification } from "./diversification";
import { buildDrawdown } from "./drawdown";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
function maxDDof(values: number[]): number { let peak = -Infinity, mdd = 0; for (const v of values) { peak = Math.max(peak, v); if (peak > 0) mdd = Math.min(mdd, v / peak - 1); } return mdd * 100; }

export interface SubMetric { label: string; value: string; raw: number; }
export interface Pillar { key: string; label: string; score: number; max: number; classification: string; metrics: SubMetric[]; insight: string; }
export interface ScoreCard {
  ok: boolean;
  total: number;
  rating: number; // stars 1-5
  classification: string;
  pillars: Pillar[];
  history: { dates: string[]; total: number[]; return: number[]; risk: number[]; div: number[]; conc: number[] };
  best: number; worst: number; percentile: number;
  strengths: { label: string; detail: string }[];
  weaknesses: { label: string; detail: string }[];
  recommendations: { text: string; impact: number }[];
  benchmark: { name: string; health: number; sharpe: number; maxDD: number; divRatio: number; top5: number }[];
  radar: { pillar: string; score: number }[];
  review: string;
}

function bandWord(total: number): string {
  return total >= 90 ? "Elite Institutional Portfolio" : total >= 80 ? "Excellent" : total >= 70 ? "Good" : total >= 60 ? "Average" : total >= 50 ? "Weak" : "High Risk Portfolio";
}
const cls25 = (s: number) => (s >= 22 ? "Excellent" : s >= 18 ? "Strong" : s >= 14 ? "Good" : s >= 10 ? "Moderate" : s >= 6 ? "Weak" : "Critical");

// aligned per-symbol daily returns (for benchmark comparison)
function alignedReturns(positions: Position[], rates: SymbolRates) {
  const syms = [...new Set(positions.map((p) => p.symbol))].filter((s) => (rates[s]?.close.length ?? 0) >= 4);
  const dateSet = new Set<string>();
  for (const s of syms) for (const d of rates[s].dates) dateSet.add(d);
  const dates = [...dateSet].sort();
  const ret: Record<string, number[]> = {};
  for (const s of syms) {
    const m = new Map<string, number>(); rates[s].dates.forEach((d, i) => m.set(d, rates[s].close[i]));
    let carry = NaN; const aligned = dates.map((d) => { const v = m.get(d); if (v !== undefined) carry = v; return carry; });
    const r: number[] = []; for (let i = 1; i < aligned.length; i++) r.push(aligned[i - 1] > 0 && Number.isFinite(aligned[i]) ? aligned[i] / aligned[i - 1] - 1 : 0); ret[s] = r;
  }
  const minL = syms.length ? Math.min(...syms.map((s) => ret[s].length)) : 0;
  for (const s of syms) ret[s] = ret[s].slice(ret[s].length - minL);
  return { syms, ret, minL };
}

function portfolioStats(syms: string[], ret: Record<string, number[]>, weights: Record<string, number>, minL: number) {
  const series: number[] = [];
  for (let t = 0; t < minL; t++) { let r = 0; for (const s of syms) r += (weights[s] ?? 0) * ret[s][t]; series.push(r); }
  const m = mean(series), sd = std(series);
  const sharpe = sd > 0 ? (m / sd) * Math.sqrt(252) : 0;
  const vol = sd * Math.sqrt(252) * 100;
  let cum = 1; const vals = [1]; for (const r of series) { cum *= 1 + r; vals.push(cum); }
  const mdd = maxDDof(vals);
  // diversification ratio
  let wAvgVol = 0; for (const s of syms) wAvgVol += Math.abs(weights[s] ?? 0) * std(ret[s]);
  const divRatio = sd > 0 ? wAvgVol / sd : 0;
  const top5 = Object.values(weights).map((w) => Math.abs(w) * 100).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
  return { sharpe, vol, mdd, divRatio, top5 };
}

export function buildScorecard(account: Account | null, positions: Position[], rates: SymbolRates, benchmark?: Benchmark): ScoreCard {
  const empty: ScoreCard = { ok: false, total: 0, rating: 0, classification: "—", pillars: [], history: { dates: [], total: [], return: [], risk: [], div: [], conc: [] }, best: 0, worst: 0, percentile: 0, strengths: [], weaknesses: [], recommendations: [], benchmark: [], radar: [], review: "Insufficient data." };
  if (!account || positions.length === 0) return empty;

  const ana = buildAnalytics(positions, rates, benchmark);
  const risk = buildRisk(positions, rates);
  const div = buildDiversification(positions, rates, benchmark);
  const dd = buildDrawdown(account, positions, rates);
  if (!dd.ok) return empty;

  // portfolio daily returns from equity curve
  const curveVals = dd.curve.map((c) => c.value);
  const rets: number[] = []; for (let i = 1; i < curveVals.length; i++) if (curveVals[i - 1] > 0) rets.push(curveVals[i] / curveVals[i - 1] - 1);
  const m = mean(rets), sd = std(rets);
  const downSd = Math.sqrt(mean(rets.filter((r) => r < 0).map((r) => r * r)) || 0);
  const sharpe = sd > 0 ? (m / sd) * Math.sqrt(252) : 0;
  const sortino = downSd > 0 ? (m / downSd) * Math.sqrt(252) : sharpe;
  const annual = m * 252 * 100;
  const consistency = rets.length ? rets.filter((r) => r > 0).length / rets.length : 0;
  const winRate = positions.length ? positions.filter((p) => p.unrealizedPnl > 0).length / positions.length : 0;

  // ── Pillar 1: Return Quality ──
  const rSharpe = clamp01(sharpe / 2.5), rSort = clamp01(sortino / 3), rAnn = clamp01(annual / 25), rCons = clamp01((consistency - 0.4) / 0.25), rWin = clamp01((winRate - 0.3) / 0.4);
  const returnScore = (0.3 * rSharpe + 0.2 * rSort + 0.2 * rAnn + 0.15 * rCons + 0.15 * rWin) * 25;

  // ── Pillar 2: Diversification Quality ── (reuse div composite)
  const divScore = (div.score.total / 100) * 25;

  // ── Pillar 3: Risk Quality ──
  const var95pct = risk.gross > 0 ? (risk.var95 / risk.gross) * 100 : 0;
  const mdd = dd.maxDD ? -dd.maxDD.ddPct : 0;
  const qVol = clamp01((40 - risk.portfolioVolPct) / 40), qMax = clamp01((25 - mdd) / 25), qCur = clamp01((15 - Math.abs(dd.currentDD)) / 15), qVar = clamp01((5 - Math.abs(var95pct)) / 5), qRec = clamp01((60 - dd.recovery.avg) / 60);
  const riskScore = (0.3 * qMax + 0.25 * qVol + 0.2 * qVar + 0.15 * qCur + 0.1 * qRec) * 25;

  // ── Pillar 4: Concentration Quality ──
  const cHHI = clamp01((0.25 - ana.hhi) / 0.25), cLarge = clamp01((20 - ana.largestWeightPct) / 20), cTop5 = clamp01((60 - ana.top5Pct) / 60), cRisk = clamp01((25 - risk.largestRiskContribPct) / 25), cEff = clamp01(ana.effectiveN / Math.max(1, positions.length));
  const concScore = (0.3 * cHHI + 0.25 * cLarge + 0.2 * cTop5 + 0.15 * cRisk + 0.1 * cEff) * 25;

  const total = returnScore + divScore + riskScore + concScore;

  const pillars: Pillar[] = [
    { key: "return", label: "Return Quality", score: returnScore, max: 25, classification: cls25(returnScore), insight: returnScore >= 16 ? "Strong risk-adjusted returns with consistent performance." : returnScore >= 10 ? "Adequate returns; risk-adjusted quality has room to improve." : "Weak risk-adjusted returns relative to volatility taken.", metrics: [
      { label: "Sharpe Ratio", value: sharpe.toFixed(2), raw: sharpe }, { label: "Sortino Ratio", value: sortino.toFixed(2), raw: sortino }, { label: "Annual Return", value: `${annual.toFixed(1)}%`, raw: annual }, { label: "Consistency", value: `${(consistency * 100).toFixed(0)}%`, raw: consistency }, { label: "Win Rate", value: `${(winRate * 100).toFixed(0)}%`, raw: winRate },
    ] },
    { key: "div", label: "Diversification Quality", score: divScore, max: 25, classification: cls25(divScore), insight: divScore >= 16 ? "Robust diversification with low correlations and many independent bets." : "Diversification is concentrated in a few effective bets — adding low-correlation assets would help.", metrics: [
      { label: "Avg Correlation", value: div.avgCorr.toFixed(2), raw: div.avgCorr }, { label: "Effective Bets", value: div.effectiveBets.toFixed(1), raw: div.effectiveBets }, { label: "Diversification Ratio", value: div.diversificationRatio.toFixed(2), raw: div.diversificationRatio }, { label: "Factor Concentration", value: `${div.factorConcentration.toFixed(0)}%`, raw: div.factorConcentration },
    ] },
    { key: "risk", label: "Risk Quality", score: riskScore, max: 25, classification: cls25(riskScore), insight: riskScore >= 16 ? "Downside risk is well controlled with moderate drawdowns and stable volatility." : "Elevated risk — volatility, drawdown or VaR are pressuring the score.", metrics: [
      { label: "Max Drawdown", value: `${(-mdd).toFixed(1)}%`, raw: mdd }, { label: "Current Drawdown", value: `${dd.currentDD.toFixed(1)}%`, raw: dd.currentDD }, { label: "VaR 95%", value: `${(-Math.abs(var95pct)).toFixed(1)}%`, raw: var95pct }, { label: "Volatility", value: `${risk.portfolioVolPct.toFixed(1)}%`, raw: risk.portfolioVolPct }, { label: "Avg Recovery", value: `${dd.recovery.avg.toFixed(0)}d`, raw: dd.recovery.avg },
    ] },
    { key: "conc", label: "Concentration Quality", score: concScore, max: 25, classification: cls25(concScore), insight: concScore >= 16 ? "No excessive concentration across positions or sectors." : "Concentration is elevated — the largest names dominate capital and/or risk.", metrics: [
      { label: "HHI", value: ana.hhi.toFixed(3), raw: ana.hhi }, { label: "Largest Position", value: `${ana.largestWeightPct.toFixed(1)}%`, raw: ana.largestWeightPct }, { label: "Top 5 Holdings", value: `${ana.top5Pct.toFixed(0)}%`, raw: ana.top5Pct }, { label: "Largest Risk", value: `${risk.largestRiskContribPct.toFixed(0)}%`, raw: risk.largestRiskContribPct }, { label: "Effective Holdings", value: ana.effectiveN.toFixed(1), raw: ana.effectiveN },
    ] },
  ];

  // strengths / weaknesses from sub-component scores
  const comps: { label: string; detail: string; v: number }[] = [
    { label: "Sharpe Ratio", detail: `Sharpe ${sharpe.toFixed(2)}`, v: rSharpe }, { label: "Sortino Ratio", detail: `Sortino ${sortino.toFixed(2)}`, v: rSort },
    { label: "Consistency", detail: `${(consistency * 100).toFixed(0)}% positive days`, v: rCons }, { label: "Win Rate", detail: `${(winRate * 100).toFixed(0)}% winners`, v: rWin },
    { label: "Diversification", detail: `${div.effectiveBets.toFixed(1)} effective bets`, v: clamp01(div.score.total / 100) }, { label: "Low Correlation", detail: `avg ρ ${div.avgCorr.toFixed(2)}`, v: clamp01((0.6 - div.avgCorr) / 0.6) },
    { label: "Drawdown Control", detail: `max DD ${(-mdd).toFixed(1)}%`, v: qMax }, { label: "Volatility", detail: `${risk.portfolioVolPct.toFixed(1)}% ann.`, v: qVol }, { label: "VaR Profile", detail: `95% VaR ${(-Math.abs(var95pct)).toFixed(1)}%`, v: qVar },
    { label: "Position Sizing", detail: `largest ${ana.largestWeightPct.toFixed(1)}%`, v: cLarge }, { label: "Capital Concentration", detail: `top-5 ${ana.top5Pct.toFixed(0)}%`, v: cTop5 }, { label: "Risk Concentration", detail: `top risk ${risk.largestRiskContribPct.toFixed(0)}%`, v: cRisk },
  ];
  const sortedComp = [...comps].sort((a, b) => b.v - a.v);
  const strengths = sortedComp.slice(0, 5).map((c) => ({ label: c.label, detail: c.detail }));
  const weaknesses = [...comps].sort((a, b) => a.v - b.v).slice(0, 5).map((c) => ({ label: c.label, detail: c.detail }));

  // recommendations from weakest pillar gaps (impact = points recoverable)
  const recs: { text: string; impact: number }[] = [];
  if (cLarge < 0.7) recs.push({ text: `Trim the largest position (${ana.largestWeightPct.toFixed(1)}%) toward <8% to lift Concentration Quality.`, impact: +((0.7 - cLarge) * 0.25 * 25).toFixed(1) });
  if (clamp01(div.score.total / 100) < 0.7) recs.push({ text: `Add low-correlation assets — raising effective bets from ${div.effectiveBets.toFixed(1)} would improve Diversification Quality by ~${((0.7 - div.score.total / 100) * 25).toFixed(0)} pts.`, impact: +((0.7 - div.score.total / 100) * 25).toFixed(1) });
  if (qVol < 0.6) recs.push({ text: `Reduce portfolio volatility (${risk.portfolioVolPct.toFixed(0)}% ann.) to materially improve Risk Quality.`, impact: +((0.6 - qVol) * 0.25 * 25).toFixed(1) });
  if (qMax < 0.6) recs.push({ text: `Improve downside protection — shrinking max drawdown (${(-mdd).toFixed(1)}%) could push the overall score higher.`, impact: +((0.6 - qMax) * 0.3 * 25).toFixed(1) });
  if (cRisk < 0.6) recs.push({ text: `Rebalance away from the top risk contributor (${risk.largestRiskContribPct.toFixed(0)}% of risk) to balance risk allocation.`, impact: +((0.6 - cRisk) * 0.15 * 25).toFixed(1) });
  recs.sort((a, b) => b.impact - a.impact);

  // benchmark comparison
  const { syms, ret, minL } = alignedReturns(positions, rates);
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const wActual: Record<string, number> = {}; for (const p of positions) wActual[p.symbol] = (wActual[p.symbol] ?? 0) + (Math.abs(p.marketValue) / gross) * (p.direction === "Short" ? -1 : 1);
  const wEqual: Record<string, number> = {}; for (const s of syms) wEqual[s] = 1 / Math.max(1, syms.length);
  const invVol: Record<string, number> = {}; let zv = 0; for (const s of syms) { const v = 1 / (std(ret[s]) || 1e9); invVol[s] = v; zv += v; } for (const s of syms) invVol[s] /= zv || 1;
  const cur = portfolioStats(syms, ret, wActual, minL);
  const eq = portfolioStats(syms, ret, wEqual, minL);
  const rp = portfolioStats(syms, ret, invVol, minL);
  // SPY
  let spy = { sharpe: 0, vol: 0, mdd: 0, divRatio: 1, top5: 100 };
  if (benchmark && benchmark.close.length > 4) { const sr: number[] = []; for (let i = 1; i < benchmark.close.length; i++) if (benchmark.close[i - 1] > 0) sr.push(benchmark.close[i] / benchmark.close[i - 1] - 1); const sm = mean(sr), ssd = std(sr); let cum = 1; const vals = [1]; for (const r of sr) { cum *= 1 + r; vals.push(cum); } spy = { sharpe: ssd > 0 ? (sm / ssd) * Math.sqrt(252) : 0, vol: ssd * Math.sqrt(252) * 100, mdd: maxDDof(vals), divRatio: 1, top5: 100 }; }
  const healthProxy = (s: { sharpe: number; mdd: number; divRatio: number; top5: number }) => clamp01(s.sharpe / 2.5) * 25 + clamp01((s.divRatio - 1) / 1) * 25 + clamp01((25 + s.mdd) / 25) * 25 + clamp01((60 - s.top5) / 60) * 25;
  const benchmarkRows = [
    { name: "Current Portfolio", health: total, sharpe: cur.sharpe, maxDD: cur.mdd, divRatio: div.diversificationRatio, top5: ana.top5Pct },
    { name: "Equal-Weight", health: healthProxy(eq), sharpe: eq.sharpe, maxDD: eq.mdd, divRatio: eq.divRatio, top5: eq.top5 },
    { name: "Risk-Parity (inv-vol)", health: healthProxy(rp), sharpe: rp.sharpe, maxDD: rp.mdd, divRatio: rp.divRatio, top5: rp.top5 },
    { name: "S&P 500 (SPY)", health: healthProxy(spy), sharpe: spy.sharpe, maxDD: spy.mdd, divRatio: 1, top5: 100 },
  ];

  // history: return & risk pillars rolling over the equity curve; div from its rolling; conc held current
  const W = Math.min(10, Math.max(4, Math.floor(rets.length / 2)));
  const hd: string[] = [], ht: number[] = [], hr: number[] = [], hk: number[] = [], hdv: number[] = [], hc: number[] = [];
  for (let end = W; end <= rets.length; end++) {
    const win = rets.slice(end - W, end); const wm = mean(win), wsd = std(win); const wsh = wsd > 0 ? (wm / wsd) * Math.sqrt(252) : 0;
    const rP = (0.5 * clamp01(wsh / 2.5) + 0.25 * clamp01((win.filter((r) => r > 0).length / win.length - 0.4) / 0.25) + 0.25 * rWin) * 25;
    let cum = 1; const vals = [1]; for (const r of win) { cum *= 1 + r; vals.push(cum); } const wmdd = -maxDDof(vals); const wvol = wsd * Math.sqrt(252) * 100;
    const kP = (0.5 * clamp01((25 - wmdd) / 25) + 0.3 * clamp01((40 - wvol) / 40) + 0.2 * qVar) * 25;
    const dIdx = div.history.score.length ? div.history.score[Math.min(div.history.score.length - 1, end - W)] : div.score.total;
    const dP = (dIdx / 100) * 25;
    hd.push(dd.curve[Math.min(dd.curve.length - 1, end)].date.slice(5)); hr.push(+rP.toFixed(1)); hk.push(+kP.toFixed(1)); hdv.push(+dP.toFixed(1)); hc.push(+concScore.toFixed(1)); ht.push(+(rP + kP + dP + concScore).toFixed(1));
  }
  const best = ht.length ? Math.max(...ht) : total;
  const worst = ht.length ? Math.min(...ht) : total;
  const percentile = ht.length ? Math.round((ht.filter((x) => x <= total).length / ht.length) * 100) : 50;

  const rating = total >= 90 ? 5 : total >= 75 ? 4 : total >= 60 ? 3 : total >= 45 ? 2 : 1;
  const radar = pillars.map((p) => ({ pillar: p.label.replace(" Quality", ""), score: +(p.score / 25 * 100).toFixed(0) }));

  const strongest = [...pillars].sort((a, b) => b.score - a.score)[0];
  const weakest = [...pillars].sort((a, b) => a.score - b.score)[0];
  const review = `This portfolio scores ${total.toFixed(0)}/100 (${bandWord(total)}) on the proprietary Portfolio Health Score. Its strongest pillar is ${strongest.label} (${strongest.score.toFixed(0)}/25), reflecting ${strongest.insight.toLowerCase()} The primary opportunity for improvement is ${weakest.label} (${weakest.score.toFixed(0)}/25): ${weakest.insight.toLowerCase()} ${recs[0] ? recs[0].text + " " : ""}Diversification translates ${positions.length} holdings into roughly ${div.effectiveBets.toFixed(1)} independent bets, and downside risk is characterised by a ${(-mdd).toFixed(1)}% maximum drawdown. Overall the portfolio ranks in the ${percentile}th percentile of its own recent history for quality.`;

  return { ok: true, total, rating, classification: bandWord(total), pillars, history: { dates: hd, total: ht, return: hr, risk: hk, div: hdv, conc: hc }, best, worst, percentile, strengths, weaknesses, recommendations: recs, benchmark: benchmarkRows, radar, review };
}
