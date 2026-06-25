// Portfolio Intelligence engine. Runs every analytics engine and synthesizes
// their outputs + rolling histories into a prioritized, evidence-based insight
// feed (risk/performance/concentration/diversification/factor/exposure/
// drawdown/stress/warning/opportunity/trend/recommendation) + a CIO daily brief.

import type { Account, Position, SymbolRates } from "./types";
import { buildAnalytics, buildKpiHistory, type Benchmark } from "./analytics";
import { buildRisk } from "./risk";
import { buildDiversification } from "./diversification";
import { buildDrawdown } from "./drawdown";
import { buildContribution, sectorAttribution, leadership, contributionConcentration } from "./attribution";
import { buildScorecard } from "./scorecard";
import { buildFactors } from "./factors";
import { buildStress } from "./stress";

export type Category = "risk" | "performance" | "concentration" | "diversification" | "factor" | "exposure" | "drawdown" | "stress" | "warning" | "opportunity" | "trend" | "recommendation";
export type Severity = "low" | "medium" | "high" | "critical";

export interface Insight {
  id: string; category: Category; severity: Severity; confidence: number;
  headline: string; detail: string; metrics: { label: string; value: string }[];
  action?: string; section: string;
}
export interface Intelligence {
  ok: boolean;
  status: "healthy" | "watchlist" | "elevated"; healthScore: number;
  nActive: number; nHighPriority: number; brief: string;
  insights: Insight[];
}

type Raw = Record<string, { dates: string[]; close: number[] }>;
const pct = (x: number, dp = 0) => `${x >= 0 ? "" : ""}${x.toFixed(dp)}%`;
function trailingRun(series: number[], dir: 1 | -1): number {
  let n = 0;
  for (let i = series.length - 1; i > 0; i--) { if (dir === 1 ? series[i] > series[i - 1] : series[i] < series[i - 1]) n++; else break; }
  return n;
}

export function buildIntelligence(account: Account | null, positions: Position[], rates: SymbolRates, benchmark?: Benchmark, factorRaw?: Raw): Intelligence {
  const empty: Intelligence = { ok: false, status: "watchlist", healthScore: 0, nActive: 0, nHighPriority: 0, brief: "Insufficient data.", insights: [] };
  if (!account || positions.length === 0) return empty;

  const ana = buildAnalytics(positions, rates, benchmark);
  const risk = buildRisk(positions, rates);
  const div = buildDiversification(positions, rates, benchmark);
  const dd = buildDrawdown(account, positions, rates);
  const contrib = buildContribution(positions, rates);
  const sectors = sectorAttribution(contrib.perPosition);
  const lead = leadership(contrib.perPosition);
  const conc = contributionConcentration(contrib.perPosition);
  const kpi = buildKpiHistory(positions, rates, 30);
  const score = buildScorecard(account, positions, rates, benchmark);
  const factors = factorRaw ? buildFactors(positions, rates, factorRaw) : null;
  const stress = factorRaw ? buildStress(positions, rates, factorRaw, account.equity) : null;

  const out: Insight[] = [];
  let seq = 0;
  const add = (category: Category, severity: Severity, confidence: number, headline: string, detail: string, metrics: { label: string; value: string }[], section: string, action?: string) =>
    out.push({ id: `i${seq++}`, category, severity, confidence, headline, detail, metrics, section, action });

  const gross = risk.gross || 1;
  const eq = account.equity || 1;

  // ── RISK ──
  const byRisk = [...risk.rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
  const top3Risk = byRisk.slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0);
  const top3Wt = byRisk.slice(0, 3).reduce((s, r) => s + r.weight, 0);
  if (top3Risk > top3Wt + 3) add("risk", top3Risk > 55 ? "high" : "medium", 90, `Risk is concentrated in ${byRisk[0].symbol}, ${byRisk[1]?.symbol}, ${byRisk[2]?.symbol}`, `The top 3 positions drive ${top3Risk.toFixed(0)}% of portfolio risk while holding only ${top3Wt.toFixed(0)}% of capital — risk is materially more concentrated than weights suggest.`, [{ label: "Top-3 risk", value: `${top3Risk.toFixed(0)}%` }, { label: "Top-3 weight", value: `${top3Wt.toFixed(0)}%` }], "Risk", "Rebalance away from the dominant risk contributors.");
  if (risk.history.volPct.length >= 3) {
    const v = risk.history.volPct; const chg = ((v[v.length - 1] - v[0]) / (v[0] || 1)) * 100; const run = trailingRun(v, 1);
    if (chg > 8) add("risk", chg > 25 ? "high" : "medium", 70, `Portfolio volatility rising`, `Annualized volatility increased ${chg.toFixed(0)}% over the available window to ${v[v.length - 1].toFixed(0)}%${run >= 3 ? `, up ${run} consecutive sessions` : ""}.`, [{ label: "Vol now", value: `${v[v.length - 1].toFixed(0)}%` }, { label: "Change", value: `+${chg.toFixed(0)}%` }], "Risk");
  }
  if (risk.history.var95.length >= 4) { const v = risk.history.var95; const now = v[v.length - 1]; const p = Math.round((v.filter((x) => x <= now).length / v.length) * 100); if (p >= 80) add("risk", p >= 95 ? "high" : "medium", 75, `VaR near the top of its recent range`, `1-day 95% VaR ($${(risk.var95).toLocaleString("en-US", { maximumFractionDigits: 0 })}) sits in the ${p}th percentile of the available window.`, [{ label: "VaR 95%", value: `$${risk.var95.toFixed(0)}` }, { label: "Percentile", value: `${p}th` }], "Risk"); }

  // ── PERFORMANCE ──
  if (sectors[0] && sectors[0].contribUsd > 0) { const s = sectors[0]; const share = (s.contribUsd / (conc.totalGains || 1)) * 100; add("performance", "low", 80, `${s.sector} is the top performance driver`, `${s.sector} generated ${share.toFixed(0)}% of gains while representing ${s.weight.toFixed(0)}% of capital.`, [{ label: "Gain share", value: `${share.toFixed(0)}%` }, { label: "Weight", value: `${s.weight.toFixed(0)}%` }], "Attribution"); }
  add("performance", "low", 85, `Top contributors concentrated`, `The top 5 contributors account for ${conc.top5.toFixed(0)}% of total portfolio gains.`, [{ label: "Top-5 gains", value: `${conc.top5.toFixed(0)}%` }], "Attribution");
  if (lead.avgLoserRet !== 0) add("performance", "low", 75, `Winner/loser asymmetry`, `Win rate is ${lead.winRate.toFixed(0)}% with the average winner returning ${pct(lead.avgWinnerRet, 1)} vs ${pct(lead.avgLoserRet, 1)} for losers (profit factor ${Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞"}).`, [{ label: "Win rate", value: `${lead.winRate.toFixed(0)}%` }, { label: "Profit factor", value: Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞" }], "Attribution");

  // ── CONCENTRATION ──
  if (ana.largestWeightPct > 10) add("concentration", ana.largestWeightPct > 15 ? "high" : "medium", 95, `Largest position exceeds 10% guideline`, `${[...ana.positions].sort((a, b) => b.weight - a.weight)[0]?.symbol} is ${ana.largestWeightPct.toFixed(1)}% of the book, above the internal 10% single-name threshold.`, [{ label: "Largest", value: `${ana.largestWeightPct.toFixed(1)}%` }], "Analytics", "Trim the largest position toward <10%.");
  add("concentration", ana.top5Pct > 50 ? "medium" : "low", 90, `Top 5 holdings = ${ana.top5Pct.toFixed(0)}% of capital`, `The five largest holdings represent ${ana.top5Pct.toFixed(0)}% of portfolio value; effective holdings ≈ ${ana.effectiveN.toFixed(1)} of ${positions.length}.`, [{ label: "Top-5", value: `${ana.top5Pct.toFixed(0)}%` }, { label: "Eff. holdings", value: ana.effectiveN.toFixed(1) }], "Analytics");
  if (risk.largestRiskContribPct > ana.largestWeightPct + 3) add("concentration", "medium", 85, `Risk concentration outpaces capital concentration`, `The largest risk contributor (${risk.largestRiskContribPct.toFixed(0)}%) exceeds the largest capital weight (${ana.largestWeightPct.toFixed(0)}%) — concentration is hidden in risk, not weights.`, [{ label: "Top risk", value: `${risk.largestRiskContribPct.toFixed(0)}%` }, { label: "Top weight", value: `${ana.largestWeightPct.toFixed(0)}%` }], "Risk");

  // ── DIVERSIFICATION ──
  add("diversification", div.effectiveBets < positions.length / 2 ? "medium" : "low", 88, `${positions.length} holdings ≈ ${div.effectiveBets.toFixed(1)} independent bets`, `Correlation-adjusted analysis shows the portfolio behaves like ${div.effectiveBets.toFixed(1)} independent bets despite ${positions.length} positions (avg ρ ${div.avgCorr.toFixed(2)}).`, [{ label: "Effective bets", value: div.effectiveBets.toFixed(1) }, { label: "Avg ρ", value: div.avgCorr.toFixed(2) }], "Diversification");
  if (div.history.avgCorr.length >= 3) { const c = div.history.avgCorr; const chg = c[c.length - 1] - c[0]; if (chg > 0.08) add("diversification", "medium", 70, `Average correlation rising`, `Average pairwise correlation increased from ${c[0].toFixed(2)} to ${c[c.length - 1].toFixed(2)} over the window — diversification benefit is eroding.`, [{ label: "ρ start", value: c[0].toFixed(2) }, { label: "ρ now", value: c[c.length - 1].toFixed(2) }], "Diversification", "Add low-correlation assets."); }
  if (div.clusters[0]) add("diversification", div.clusters[0].riskContribPct > 40 ? "high" : "medium", 80, `Correlation cluster: ${div.clusters[0].members.slice(0, 3).join("/")}`, `These names move together (internal ρ ${div.clusters[0].internalCorr.toFixed(2)}) and contribute ${div.clusters[0].riskContribPct.toFixed(0)}% of risk — effectively a single bet.`, [{ label: "Cluster risk", value: `${div.clusters[0].riskContribPct.toFixed(0)}%` }, { label: "Internal ρ", value: div.clusters[0].internalCorr.toFixed(2) }], "Diversification");

  // ── FACTOR ──
  if (factors && factors.ok) {
    const fr = [...factors.rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
    add("factor", "low", 80, `Style: ${factors.style.label}`, `${fr.slice(0, 3).map((r) => r.label).join(", ")} explain ${fr.slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0).toFixed(0)}% of factor risk. Market beta ${factors.marketBeta.toFixed(2)}.`, [{ label: "Beta", value: factors.marketBeta.toFixed(2) }, { label: "Top-3 factor risk", value: `${fr.slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0).toFixed(0)}%` }], "Factors");
    const rateF = factors.rows.find((r) => r.key === "rates");
    if (rateF && Math.abs(rateF.exposure) > 0.15) add("factor", "medium", 70, `Interest-rate sensitivity`, `The portfolio is ${rateF.exposure > 0 ? "positively" : "negatively"} exposed to long bonds (β ${rateF.exposure.toFixed(2)}) — ${rateF.exposure > 0 ? "benefits from falling" : "hurt by rising"} rates.`, [{ label: "Rate β", value: rateF.exposure.toFixed(2) }], "Factors");
  }

  // ── EXPOSURE ──
  const netPct = (ana.netExposure / eq) * 100; const grossX = gross / eq;
  add("exposure", "low", 85, `Net ${netPct.toFixed(0)}% / gross ${grossX.toFixed(2)}x of equity`, `Net exposure is ${netPct.toFixed(0)}% of equity (${ana.netExposure >= 0 ? "net long" : "net short"}); gross exposure ${grossX.toFixed(2)}x. Long $${(ana.longExposure / 1000).toFixed(0)}k / short $${(ana.shortExposure / 1000).toFixed(0)}k.`, [{ label: "Net", value: `${netPct.toFixed(0)}%` }, { label: "Gross", value: `${grossX.toFixed(2)}x` }], "Margin & Leverage");
  if (kpi.length >= 3) { const g = kpi.map((k) => k.gross); const chg = ((g[g.length - 1] - g[0]) / (g[0] || 1)) * 100; if (Math.abs(chg) > 8) add("exposure", "low", 65, `Gross exposure ${chg > 0 ? "rising" : "falling"}`, `Gross exposure ${chg > 0 ? "increased" : "decreased"} ${Math.abs(chg).toFixed(0)}% over the window.`, [{ label: "Change", value: `${chg > 0 ? "+" : ""}${chg.toFixed(0)}%` }], "Evolution"); }

  // ── DRAWDOWN ──
  const mdd = dd.maxDD ? -dd.maxDD.ddPct : 0;
  add("drawdown", Math.abs(dd.currentDD) > 8 ? "medium" : "low", 85, `Current drawdown ${dd.currentDD.toFixed(1)}%`, `The portfolio is ${Math.abs(dd.currentDD) < mdd * 0.7 ? "well below" : "approaching"} its maximum reconstructed drawdown of ${mdd.toFixed(1)}%. ${dd.recovery.avg > 0 ? `Typical recovery ≈ ${dd.recovery.avg.toFixed(0)} days.` : ""}`, [{ label: "Current DD", value: `${dd.currentDD.toFixed(1)}%` }, { label: "Max DD", value: `${(-mdd).toFixed(1)}%` }], "Drawdown");

  // ── STRESS ──
  if (stress && stress.ok && stress.worst) {
    add("stress", -stress.worst.portRet > 0.2 ? "high" : "medium", 65, `Worst scenario: ${stress.worst.name.replace(/\s\d{4}.*/, "")} ${(stress.worst.portRet * 100).toFixed(0)}%`, `Factor-based stress estimates a ${(stress.worst.portRet * 100).toFixed(1)}% loss under ${stress.worst.name}, concentrated in ${stress.worstSectors[0]?.sector ?? "tech"}.`, [{ label: "Worst", value: `${(stress.worst.portRet * 100).toFixed(0)}%` }, { label: "Resilience", value: `${stress.resilience.total.toFixed(0)}` }], "Stress");
    const rateScn = stress.vulnerability.find((v) => v.factor.startsWith("Rates"));
    if (rateScn) add("stress", "medium", 60, `Rate-shock vulnerability`, `A 100bp rate rise is estimated to move the portfolio ${rateScn.portfolio.toFixed(1)}%.`, [{ label: "Impact", value: `${rateScn.portfolio.toFixed(1)}%` }], "Stress");
  }

  // ── WARNINGS ──
  if (ana.largestWeightPct > 12) add("warning", "critical", 95, `Largest position breaches concentration limit`, `${[...ana.positions].sort((a, b) => b.weight - a.weight)[0]?.symbol} at ${ana.largestWeightPct.toFixed(1)}% exceeds the 12% hard limit.`, [{ label: "Weight", value: `${ana.largestWeightPct.toFixed(1)}%` }], "Analytics", "Reduce position size.");
  if (Number.isFinite(ana.positions[0]?.beta) && factors && Math.abs(factors.marketBeta) > 1.2) add("warning", "high", 80, `Portfolio beta above risk limit`, `Market beta ${factors.marketBeta.toFixed(2)} exceeds the 1.20 guideline — amplified sensitivity to broad market moves.`, [{ label: "Beta", value: factors.marketBeta.toFixed(2) }], "Factors");
  if (div.avgCorr > 0.5) add("warning", "high", 80, `Elevated average correlation`, `Average pairwise correlation ${div.avgCorr.toFixed(2)} is high — diversification benefit is limited and losses may cluster.`, [{ label: "Avg ρ", value: div.avgCorr.toFixed(2) }], "Diversification");

  // ── OPPORTUNITY ──
  if (score.ok) {
    const ret = score.pillars.find((p) => p.key === "return");
    if (ret && ret.score >= 16) add("opportunity", "low", 75, `Strong risk-adjusted returns`, `Return Quality scores ${ret.score.toFixed(0)}/25 — Sharpe ${ret.metrics[0].value}, Sortino ${ret.metrics[1].value}.`, [{ label: "Sharpe", value: ret.metrics[0].value }, { label: "Sortino", value: ret.metrics[1].value }], "Scorecard");
    if (div.diversificationRatio > 1.4) add("opportunity", "low", 75, `Healthy diversification ratio`, `Diversification ratio ${div.diversificationRatio.toFixed(2)} indicates meaningful risk reduction vs an undiversified book.`, [{ label: "Div ratio", value: div.diversificationRatio.toFixed(2) }], "Diversification");
  }

  // ── TREND ──
  if (dd.rolling.length >= 4) { const run = trailingRun(dd.rolling.map((r) => r.dd), -1); if (run >= 3) add("trend", "medium", 60, `Drawdown deepening`, `The underwater curve has worsened for ${run} consecutive sessions.`, [{ label: "Sessions", value: `${run}` }], "Drawdown"); }
  if (factors && factors.ok) { const g = factors.evolution.series["growth"]; if (g && g.length >= 3) { const run = trailingRun(g, 1); if (run >= 2) add("trend", "low", 55, `Growth tilt increasing`, `Growth-factor exposure has risen for ${run} consecutive windows.`, [{ label: "Growth β now", value: g[g.length - 1].toFixed(2) }], "Factors"); } }

  // ── RECOMMENDATIONS (from scorecard, impact-ranked) ──
  if (score.ok) for (const r of score.recommendations.slice(0, 4)) add("recommendation", r.impact > 4 ? "medium" : "low", 80, `Recommendation`, r.text, [{ label: "Est. impact", value: `+${r.impact} pts` }], "Scorecard", r.text);

  // severity ordering
  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.confidence - a.confidence);

  const nHigh = out.filter((i) => i.severity === "high" || i.severity === "critical").length;
  const healthScore = score.ok ? score.total : 0;
  const status: Intelligence["status"] = nHigh >= 3 || healthScore < 55 || out.some((i) => i.severity === "critical") ? "elevated" : nHigh >= 1 || healthScore < 68 ? "watchlist" : "healthy";

  // executive brief
  const topSec = sectors[0]; const worstStress = stress?.worst;
  const brief = `Portfolio health is ${healthScore.toFixed(0)}/100 (${score.ok ? score.classification : "—"}), placing it on ${status === "healthy" ? "a healthy footing" : status === "watchlist" ? "the watchlist" : "elevated alert"}. ` +
    `Performance leadership sits with ${topSec?.sector ?? "the top sector"}, and the top 5 names account for ${conc.top5.toFixed(0)}% of gains, underscoring a return profile driven by a handful of positions. ` +
    `Risk is more concentrated than capital: the top three holdings carry ${top3Risk.toFixed(0)}% of risk on ${top3Wt.toFixed(0)}% of weight, and ${positions.length} holdings translate to roughly ${div.effectiveBets.toFixed(1)} independent bets (avg ρ ${div.avgCorr.toFixed(2)}). ` +
    `${factors?.ok ? `Factor exposure is a ${factors.style.label.toLowerCase()} with market beta ${factors.marketBeta.toFixed(2)}. ` : ""}` +
    `Downside is contained — current drawdown ${dd.currentDD.toFixed(1)}% against a ${mdd.toFixed(1)}% historical maximum${worstStress ? `, while a ${worstStress.name.replace(/\s\d{4}.*/, "")}-style shock is modelled at ${(worstStress.portRet * 100).toFixed(0)}%` : ""}. ` +
    `Priorities: ${ana.largestWeightPct > 10 ? `trim the ${ana.largestWeightPct.toFixed(0)}% top position; ` : ""}${div.avgCorr > 0.45 ? "add low-correlation exposure to rebuild diversification; " : ""}monitor the dominant risk contributors. ` +
    `Net exposure ${netPct.toFixed(0)}% of equity, gross ${grossX.toFixed(2)}x — ${grossX < 0.6 ? "ample flexibility to rebalance" : "leverage warrants monitoring"}.`;

  return { ok: true, status, healthScore, nActive: out.length, nHighPriority: nHigh, brief, insights: out };
}
