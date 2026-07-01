// Risk-Adjusted Performance engine. Answers "is the portfolio being adequately
// compensated for the risk it takes?" — Sharpe / Sortino / Treynor / Jensen's
// alpha / beta / information ratio / tracking error / downside deviation, a
// return distribution, intuitive probabilities, a risk-vs-return map, a
// benchmark comparison, and a 0–100 Risk-Efficiency Score, plus CIO-style
// insights and an executive summary — all supported by calculated metrics.
//
// Returns come from the reconstructed portfolio daily series (current signed
// weights × each holding's daily return from MT5 symbol_rates). The benchmark
// series (SPY / QQQ / URTH) comes from Yahoo via /api/benchmark.

import type { Account, Position, SymbolRates } from "./types";

export interface Benchmark { dates: string[]; close: number[]; name?: string }

const TRADING_DAYS = 252;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
function covar(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const compoundAnn = (rets: number[]) => {
  if (!rets.length) return 0;
  const cum = rets.reduce((acc, r) => acc * (1 + r), 1);
  return Math.pow(cum, TRADING_DAYS / rets.length) - 1;
};
const maxDrawdown = (rets: number[]) => {
  let cum = 1, peak = 1, mdd = 0;
  for (const r of rets) { cum *= 1 + r; peak = Math.max(peak, cum); mdd = Math.min(mdd, cum / peak - 1); }
  return mdd * 100; // negative %
};

export interface RaKpi {
  id: string; label: string; glossary: string;
  value: number; prev: number; hasPrev: boolean;
  unit: "ratio" | "pct" | "beta"; higherBetter: boolean;
}

export interface RaData {
  ok: boolean;
  nObs: number;
  rfAnnual: number;
  benchName: string;

  annReturn: number; annVol: number; downsideDevAnnual: number;
  sharpe: number; sortino: number; treynor: number; beta: number;
  jensenAlphaAnnual: number; jensenAlphaMonthly: number;
  informationRatio: number; trackingError: number;
  portMaxDD: number;

  bench: { annReturn: number; annVol: number; sharpe: number; sortino: number; maxDD: number };

  kpis: RaKpi[];

  dist: { bins: { x: number; n: number; tail: boolean }[]; mean: number; median: number; std: number; var95: number; cvar95: number };
  prob: { pPos: number; pNeg: number; pBeyondVar: number; worst5Avg: number; best5Avg: number };
  rolling: { dates: string[]; sharpe: number[]; sortino: number[]; beta: number[]; window: number };
  scatter: { name: string; kind: "portfolio" | "benchmark" | "equal"; vol: number; ret: number; sharpe: number }[];

  score: number; scoreLabel: string;
  scoreComponents: { label: string; score: number; weight: number }[];

  insights: string[];
  summary: string;
}

interface Opts { rfAnnual?: number; marAnnual?: number }

// ── portfolio daily return series (dated) ───────────────────────────────────────
function portfolioReturns(positions: Position[], rates: SymbolRates, weightMode: "mv" | "equal"): { dates: string[]; rets: number[] } {
  const dateSet = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  const axis = [...dateSet].sort();
  if (axis.length < 4) return { dates: [], rets: [] };

  const closes: Record<string, number[]> = {};
  for (const p of positions) {
    if (closes[p.symbol]) continue;
    const m = new Map<string, number>();
    (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i]));
    let carry = NaN;
    closes[p.symbol] = axis.map((d) => { const v = m.get(d); if (v !== undefined) carry = v; return carry; });
  }

  const syms = [...new Set(positions.map((p) => p.symbol))].filter((s) => closes[s]?.some((x) => Number.isFinite(x)));
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const w: Record<string, number> = {};
  if (weightMode === "equal") {
    const n = syms.length || 1;
    for (const s of syms) w[s] = 1 / n; // equal-weight, long-only
  } else {
    for (const p of positions) {
      const wi = (Math.abs(p.marketValue) / gross) * (p.direction === "Short" ? -1 : 1);
      w[p.symbol] = (w[p.symbol] ?? 0) + wi;
    }
  }

  const dates: string[] = [];
  const rets: number[] = [];
  for (let t = 1; t < axis.length; t++) {
    let r = 0, ok = false;
    for (const s of syms) {
      const c0 = closes[s][t - 1], c1 = closes[s][t];
      if (Number.isFinite(c0) && Number.isFinite(c1) && c0 > 0) { r += (w[s] ?? 0) * (c1 / c0 - 1); ok = true; }
    }
    if (ok) { dates.push(axis[t]); rets.push(r); }
  }
  return { dates, rets };
}

function benchReturnsByDate(b?: Benchmark): Map<string, number> {
  const out = new Map<string, number>();
  if (!b || b.close.length < 2) return out;
  for (let i = 1; i < b.close.length; i++) if (b.close[i - 1] > 0) out.set(b.dates[i], b.close[i] / b.close[i - 1] - 1);
  return out;
}

// core ratio bundle over an aligned (portfolio, benchmark) return pair
function ratios(pRet: number[], bRet: number[], rfAnnual: number, marDaily: number) {
  const rfDaily = rfAnnual / TRADING_DAYS;
  const annReturn = compoundAnn(pRet);
  const annVol = std(pRet) * Math.sqrt(TRADING_DAYS);
  const downside = Math.sqrt(mean(pRet.map((r) => Math.min(0, r - marDaily) ** 2))) * Math.sqrt(TRADING_DAYS);
  const beta = bRet.length >= 2 && std(bRet) > 0 ? covar(pRet, bRet) / (std(bRet) ** 2) : 0;
  const benchAnn = compoundAnn(bRet);
  const active = pRet.map((r, i) => r - (bRet[i] ?? 0));
  const te = std(active) * Math.sqrt(TRADING_DAYS);
  const excess = annReturn - rfAnnual;
  return {
    annReturn, annVol, downside, beta, benchAnn,
    sharpe: annVol > 0 ? excess / annVol : 0,
    sortino: downside > 0 ? excess / downside : 0,
    treynor: Math.abs(beta) > 1e-6 ? excess / beta : 0,
    jensenAnnual: annReturn - (rfAnnual + beta * (benchAnn - rfAnnual)),
    trackingError: te,
    informationRatio: te > 0 ? (annReturn - benchAnn) / te : 0,
    rfDailyUnused: rfDaily,
  };
}

function scoreBand(s: number): string {
  return s >= 85 ? "Excellent" : s >= 70 ? "Strong" : s >= 55 ? "Moderate" : s >= 40 ? "Weak" : "Poor";
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function buildRiskAdjusted(
  account: Account | null,
  positions: Position[],
  rates: SymbolRates,
  benchmark?: Benchmark,
  opts: Opts = {},
): RaData {
  const rfAnnual = opts.rfAnnual ?? 0.04;
  const marAnnual = opts.marAnnual ?? 0;        // min acceptable return for downside deviation
  const marDaily = marAnnual / TRADING_DAYS;
  const benchName = benchmark?.name ?? "S&P 500";

  const empty: RaData = {
    ok: false, nObs: 0, rfAnnual, benchName,
    annReturn: 0, annVol: 0, downsideDevAnnual: 0, sharpe: 0, sortino: 0, treynor: 0, beta: 0,
    jensenAlphaAnnual: 0, jensenAlphaMonthly: 0, informationRatio: 0, trackingError: 0, portMaxDD: 0,
    bench: { annReturn: 0, annVol: 0, sharpe: 0, sortino: 0, maxDD: 0 },
    kpis: [],
    dist: { bins: [], mean: 0, median: 0, std: 0, var95: 0, cvar95: 0 },
    prob: { pPos: 0, pNeg: 0, pBeyondVar: 0, worst5Avg: 0, best5Avg: 0 },
    rolling: { dates: [], sharpe: [], sortino: [], beta: [], window: 0 },
    scatter: [], score: 0, scoreLabel: "—", scoreComponents: [], insights: [], summary: "Insufficient history for risk-adjusted analysis.",
  };
  if (!account || positions.length === 0) return empty;

  const pSeries = portfolioReturns(positions, rates, "mv");
  if (pSeries.rets.length < 5) return empty;

  const bMap = benchReturnsByDate(benchmark);
  // align portfolio & benchmark on shared dates
  const alignedP: number[] = [], alignedB: number[] = [], alignedDates: string[] = [];
  for (let i = 0; i < pSeries.dates.length; i++) {
    const d = pSeries.dates[i];
    const b = bMap.get(d);
    alignedP.push(pSeries.rets[i]); alignedDates.push(d);
    alignedB.push(b ?? NaN);
  }
  // benchmark-dependent metrics use the subset where benchmark exists
  const bothIdx = alignedB.map((b, i) => (Number.isFinite(b) ? i : -1)).filter((i) => i >= 0);
  const pB = bothIdx.map((i) => alignedP[i]);
  const bB = bothIdx.map((i) => alignedB[i]);

  const R = ratios(pB.length >= 5 ? pB : alignedP, pB.length >= 5 ? bB : [], rfAnnual, marDaily);
  // whole-series (benchmark-independent) return/vol use the full portfolio series
  const fullAnnReturn = compoundAnn(alignedP);
  const fullAnnVol = std(alignedP) * Math.sqrt(TRADING_DAYS);
  const fullDownside = Math.sqrt(mean(alignedP.map((r) => Math.min(0, r - marDaily) ** 2))) * Math.sqrt(TRADING_DAYS);
  const excess = fullAnnReturn - rfAnnual;
  const sharpe = fullAnnVol > 0 ? excess / fullAnnVol : 0;
  const sortino = fullDownside > 0 ? excess / fullDownside : 0;
  const portMaxDD = maxDrawdown(alignedP);

  // benchmark own stats
  const benchAnnReturn = compoundAnn(bB);
  const benchAnnVol = std(bB) * Math.sqrt(TRADING_DAYS);
  const benchDownside = Math.sqrt(mean(bB.map((r) => Math.min(0, r - marDaily) ** 2))) * Math.sqrt(TRADING_DAYS);
  const benchStats = {
    annReturn: benchAnnReturn, annVol: benchAnnVol,
    sharpe: benchAnnVol > 0 ? (benchAnnReturn - rfAnnual) / benchAnnVol : 0,
    sortino: benchDownside > 0 ? (benchAnnReturn - rfAnnual) / benchDownside : 0,
    maxDD: maxDrawdown(bB),
  };

  // ── previous-month comparison: metrics as of ~21 trading days ago ─────────────
  const LAG = 21;
  const prevP = alignedP.slice(0, Math.max(0, alignedP.length - LAG));
  const prevBothIdx = bothIdx.filter((i) => i < alignedP.length - LAG);
  const prevPB = prevBothIdx.map((i) => alignedP[i]);
  const prevBB = prevBothIdx.map((i) => alignedB[i]);
  const hasPrev = prevP.length >= 5;
  const prevR = hasPrev ? ratios(prevPB.length >= 5 ? prevPB : prevP, prevPB.length >= 5 ? prevBB : [], rfAnnual, marDaily) : null;
  const prevAnnRet = hasPrev ? compoundAnn(prevP) : 0;
  const prevAnnVol = hasPrev ? std(prevP) * Math.sqrt(TRADING_DAYS) : 0;
  const prevExcess = prevAnnRet - rfAnnual;
  const prevSharpe = hasPrev && prevAnnVol > 0 ? prevExcess / prevAnnVol : 0;
  const prevDownside = hasPrev ? Math.sqrt(mean(prevP.map((r) => Math.min(0, r - marDaily) ** 2))) * Math.sqrt(TRADING_DAYS) : 0;
  const prevSortino = hasPrev && prevDownside > 0 ? prevExcess / prevDownside : 0;

  // ── distribution ──────────────────────────────────────────────────────────────
  const sorted = [...alignedP].sort((a, b) => a - b);
  const var95 = sorted[Math.max(0, Math.floor(0.05 * sorted.length))] ?? 0; // 5th pct (daily, negative)
  const tail = sorted.filter((r) => r <= var95);
  const cvar95 = tail.length ? mean(tail) : var95;
  const dmean = mean(alignedP), dstd = std(alignedP), dmed = median(alignedP);
  const lo = sorted[0], hi = sorted[sorted.length - 1], nbins = 31, wbin = (hi - lo) / nbins || 1;
  const bins = Array.from({ length: nbins }, (_, b) => {
    const x = lo + (b + 0.5) * wbin;
    return { x: +(x * 100).toFixed(2), n: 0, tail: x <= var95 };
  });
  for (const r of alignedP) { const b = Math.min(nbins - 1, Math.max(0, Math.floor((r - lo) / wbin))); bins[b].n++; }

  // ── probabilities ─────────────────────────────────────────────────────────────
  const nP = alignedP.length;
  const pPos = alignedP.filter((r) => r > 0).length / nP;
  const pNeg = alignedP.filter((r) => r < 0).length / nP;
  const pBeyondVar = alignedP.filter((r) => r < var95).length / nP;
  const best5 = sorted.slice(Math.floor(0.95 * sorted.length));
  const worst5Avg = cvar95, best5Avg = best5.length ? mean(best5) : hi;

  // ── rolling ratios ────────────────────────────────────────────────────────────
  const W = Math.min(20, Math.max(5, Math.floor(alignedP.length / 2)));
  const rollDates: string[] = [], rollSharpe: number[] = [], rollSortino: number[] = [], rollBeta: number[] = [];
  for (let end = W; end <= alignedP.length; end++) {
    const win = alignedP.slice(end - W, end);
    const ar = compoundAnn(win), av = std(win) * Math.sqrt(TRADING_DAYS);
    const dd = Math.sqrt(mean(win.map((r) => Math.min(0, r - marDaily) ** 2))) * Math.sqrt(TRADING_DAYS);
    const ex = ar - rfAnnual;
    rollSharpe.push(+(av > 0 ? ex / av : 0).toFixed(2));
    rollSortino.push(+(dd > 0 ? ex / dd : 0).toFixed(2));
    // rolling beta over the same window (benchmark aligned)
    const winP: number[] = [], winB: number[] = [];
    for (let i = end - W; i < end; i++) if (Number.isFinite(alignedB[i])) { winP.push(alignedP[i]); winB.push(alignedB[i]); }
    rollBeta.push(+(winB.length >= 3 && std(winB) > 0 ? covar(winP, winB) / (std(winB) ** 2) : 0).toFixed(2));
    rollDates.push(alignedDates[end - 1].slice(5));
  }

  // ── risk vs return scatter ────────────────────────────────────────────────────
  const eq = portfolioReturns(positions, rates, "equal");
  const eqAnn = compoundAnn(eq.rets), eqVol = std(eq.rets) * Math.sqrt(TRADING_DAYS);
  const scatter: RaData["scatter"] = [
    { name: "Portfolio", kind: "portfolio", vol: fullAnnVol * 100, ret: fullAnnReturn * 100, sharpe },
    { name: benchName, kind: "benchmark", vol: benchStats.annVol * 100, ret: benchStats.annReturn * 100, sharpe: benchStats.sharpe },
    { name: "Equal-Weight", kind: "equal", vol: eqVol * 100, ret: eqAnn * 100, sharpe: eqVol > 0 ? (eqAnn - rfAnnual) / eqVol : 0 },
  ];

  // ── Risk-Efficiency Score (0–100) ─────────────────────────────────────────────
  const cSharpe = clamp01(sharpe / 2.5) * 100;
  const cSortino = clamp01(sortino / 3.0) * 100;
  const cAlpha = clamp01((R.jensenAnnual + 0.10) / 0.25) * 100;      // −10%→0, +15%→100
  const cBeta = clamp01(1 - Math.abs(R.beta - 0.9) / 1.0) * 100;      // ideal ~0.9
  const cMDD = clamp01((25 + portMaxDD) / 25) * 100;                  // portMaxDD negative; −25%→0
  const cDown = clamp01((0.25 - fullDownside) / 0.25) * 100;          // 25% downside→0
  const cIR = clamp01((R.informationRatio + 0.5) / 1.5) * 100;        // −0.5→0, +1.0→100
  const scoreComponents = [
    { label: "Sharpe", score: cSharpe, weight: 0.22 },
    { label: "Sortino", score: cSortino, weight: 0.18 },
    { label: "Jensen's α", score: cAlpha, weight: 0.15 },
    { label: "Beta health", score: cBeta, weight: 0.12 },
    { label: "Max Drawdown", score: cMDD, weight: 0.13 },
    { label: "Downside Dev", score: cDown, weight: 0.10 },
    { label: "Information Ratio", score: cIR, weight: 0.10 },
  ];
  const score = scoreComponents.reduce((s, c) => s + c.score * c.weight, 0);
  const scoreLabel = scoreBand(score);

  // ── KPI bundle (current + previous month) ─────────────────────────────────────
  const kpis: RaKpi[] = [
    { id: "annRet", label: "Annualized Return", glossary: "annualized-return", value: fullAnnReturn * 100, prev: prevAnnRet * 100, hasPrev, unit: "pct", higherBetter: true },
    { id: "annVol", label: "Annualized Volatility", glossary: "volatility", value: fullAnnVol * 100, prev: prevAnnVol * 100, hasPrev, unit: "pct", higherBetter: false },
    { id: "sharpe", label: "Sharpe Ratio", glossary: "sharpe", value: sharpe, prev: prevSharpe, hasPrev, unit: "ratio", higherBetter: true },
    { id: "sortino", label: "Sortino Ratio", glossary: "sortino", value: sortino, prev: prevSortino, hasPrev, unit: "ratio", higherBetter: true },
    { id: "treynor", label: "Treynor Ratio", glossary: "treynor", value: R.treynor * 100, prev: (prevR?.treynor ?? 0) * 100, hasPrev: hasPrev && !!prevR, unit: "pct", higherBetter: true },
    { id: "jensen", label: "Jensen's Alpha", glossary: "jensens-alpha", value: R.jensenAnnual * 100, prev: (prevR?.jensenAnnual ?? 0) * 100, hasPrev: hasPrev && !!prevR, unit: "pct", higherBetter: true },
    { id: "beta", label: "Portfolio Beta", glossary: "portfolio-beta", value: R.beta, prev: prevR?.beta ?? 0, hasPrev: hasPrev && !!prevR, unit: "beta", higherBetter: false },
    { id: "ir", label: "Information Ratio", glossary: "information-ratio", value: R.informationRatio, prev: prevR?.informationRatio ?? 0, hasPrev: hasPrev && !!prevR, unit: "ratio", higherBetter: true },
    { id: "te", label: "Tracking Error", glossary: "tracking-error", value: R.trackingError * 100, prev: (prevR?.trackingError ?? 0) * 100, hasPrev: hasPrev && !!prevR, unit: "pct", higherBetter: false },
    { id: "downdev", label: "Downside Deviation", glossary: "downside-deviation", value: fullDownside * 100, prev: prevDownside * 100, hasPrev, unit: "pct", higherBetter: false },
  ];

  // ── insights (each supported by a metric) ─────────────────────────────────────
  const insights: string[] = [];
  insights.push(`The portfolio generates ${sharpe.toFixed(2)} units of excess return for every unit of total risk (Sharpe ${sharpe.toFixed(2)} — ${sharpe > 2 ? "excellent" : sharpe > 1 ? "good" : sharpe > 0.5 ? "moderate" : "weak"}).`);
  if (sortino > sharpe) insights.push(`Sortino (${sortino.toFixed(2)}) exceeds Sharpe (${sharpe.toFixed(2)}), indicating downside risk has been better controlled than total volatility would suggest.`);
  else insights.push(`Sortino (${sortino.toFixed(2)}) sits near Sharpe (${sharpe.toFixed(2)}), so volatility is roughly symmetric between up and down days.`);
  insights.push(`Jensen's alpha is ${R.jensenAnnual >= 0 ? "positive" : "negative"} at ${(R.jensenAnnual * 100).toFixed(1)}% p.a. — the book ${R.jensenAnnual >= 0 ? "outperformed" : "underperformed"} its CAPM-expected return given a beta of ${R.beta.toFixed(2)} vs ${benchName}.`);
  if (hasPrev && prevR) {
    const db = R.beta - prevR.beta;
    if (Math.abs(db) >= 0.05) insights.push(`Portfolio beta has ${db > 0 ? "risen" : "fallen"} from ${prevR.beta.toFixed(2)} to ${R.beta.toFixed(2)} over the past month, ${db > 0 ? "increasing" : "reducing"} sensitivity to market moves.`);
  }
  insights.push(`Beta of ${R.beta.toFixed(2)} vs ${benchName} means the book is ${R.beta < 0.85 ? "defensive" : R.beta > 1.15 ? "aggressive" : "roughly market-neutral"} to broad ${benchName} moves.`);
  insights.push(`Information ratio of ${R.informationRatio.toFixed(2)} on ${(R.trackingError * 100).toFixed(1)}% tracking error reflects ${Math.abs(R.informationRatio) < 0.3 ? "modest" : R.informationRatio > 0.5 ? "strong" : "some"} active skill relative to the benchmark.`);
  insights.push(`Downside deviation (${(fullDownside * 100).toFixed(1)}%) is ${fullDownside < fullAnnVol ? "below" : "in line with"} total volatility (${(fullAnnVol * 100).toFixed(1)}%), so ${fullDownside < fullAnnVol ? "most variability is on the upside" : "risk is broadly two-sided"}.`);
  insights.push(`Roughly ${(pPos * 100).toFixed(0)}% of days are positive; the worst 5% of days average ${(worst5Avg * 100).toFixed(1)}% and the best 5% average +${(best5Avg * 100).toFixed(1)}%.`);
  if (portMaxDD < -0.01) insights.push(`Maximum drawdown over the window was ${portMaxDD.toFixed(1)}%, versus ${benchStats.maxDD.toFixed(1)}% for ${benchName}.`);

  // ── executive summary (CIO tone, ~150–250 words) ──────────────────────────────
  const betterVsBench = fullAnnReturn > benchStats.annReturn;
  const summary =
    `The portfolio earns a Risk-Efficiency Score of ${score.toFixed(0)}/100 (${scoreLabel}), indicating ${scoreLabel === "Excellent" || scoreLabel === "Strong" ? "the return achieved is well-compensated for the risk taken" : scoreLabel === "Moderate" ? "acceptable but improvable compensation for risk" : "returns are not yet adequately compensating for the risk taken"}. ` +
    `On a total-risk basis the Sharpe ratio is ${sharpe.toFixed(2)}, while the Sortino ratio of ${sortino.toFixed(2)} shows ${sortino >= sharpe ? "downside risk has been the tighter-controlled dimension" : "up- and down-side variability are broadly balanced"}. ` +
    `Against ${benchName}, portfolio beta is ${R.beta.toFixed(2)}${hasPrev && prevR ? ` (from ${prevR.beta.toFixed(2)} a month ago)` : ""}, and Jensen's alpha is ${(R.jensenAnnual * 100).toFixed(1)}% p.a. — ${R.jensenAnnual >= 0 ? "positive, i.e. the book is adding value beyond its market exposure" : "negative, i.e. the book is lagging its market-implied return"}. ` +
    `Active positioning runs at ${(R.trackingError * 100).toFixed(1)}% tracking error for an information ratio of ${R.informationRatio.toFixed(2)}. ` +
    `Return distribution is centred near ${(dmean * 100).toFixed(2)}%/day with a 95% daily VaR of ${(var95 * 100).toFixed(1)}% and a worst-tail (CVaR) average of ${(cvar95 * 100).toFixed(1)}%. ` +
    `The book ${betterVsBench ? "outpaced" : "trailed"} ${benchName} on annualized return (${(fullAnnReturn * 100).toFixed(1)}% vs ${(benchStats.annReturn * 100).toFixed(1)}%). ` +
    `Areas to watch: ${R.beta > 1.15 ? "rising market sensitivity" : fullDownside > fullAnnVol ? "downside-skewed volatility" : sharpe < 1 ? "thin risk-adjusted return" : "concentration and the short return history"}. ` +
    `History spans ${alignedP.length} trading days, so figures are indicative and will firm up as the track record lengthens.`;

  return {
    ok: true, nObs: alignedP.length, rfAnnual, benchName,
    annReturn: fullAnnReturn, annVol: fullAnnVol, downsideDevAnnual: fullDownside,
    sharpe, sortino, treynor: R.treynor, beta: R.beta,
    jensenAlphaAnnual: R.jensenAnnual, jensenAlphaMonthly: R.jensenAnnual / 12,
    informationRatio: R.informationRatio, trackingError: R.trackingError, portMaxDD,
    bench: benchStats, kpis,
    dist: { bins, mean: dmean, median: dmed, std: dstd, var95, cvar95 },
    prob: { pPos, pNeg, pBeyondVar, worst5Avg, best5Avg },
    rolling: { dates: rollDates, sharpe: rollSharpe, sortino: rollSortino, beta: rollBeta, window: W },
    scatter, score, scoreLabel, scoreComponents, insights: insights.slice(0, 10), summary,
  };
}
