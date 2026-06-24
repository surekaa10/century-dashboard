// Diversification analysis engine. Answers "how many independent bets do I
// actually own?" via correlation structure, eigenvalue-based effective number
// of bets, clustering, a composite diversification score, a downside/stress
// correlation test, and data-driven factor proxies (NOT a full Barra model).

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";
import { parseOpenDate } from "./analytics";

const TRADING_DAYS = 252;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function covAt(a: number[], b: number[], idx?: number[]): number {
  const ia = idx ?? a.map((_, i) => i);
  if (ia.length < 2) return 0;
  const av = ia.map((i) => a[i]);
  const bv = ia.map((i) => b[i]);
  const ma = mean(av), mb = mean(bv);
  let s = 0;
  for (let i = 0; i < ia.length; i++) s += (av[i] - ma) * (bv[i] - mb);
  return s / (ia.length - 1);
}
function corrAt(a: number[], b: number[], idx?: number[]): number {
  const ia = idx ?? a.map((_, i) => i);
  const av = ia.map((i) => a[i]);
  const bv = ia.map((i) => b[i]);
  const sa = stdev(av), sb = stdev(bv);
  if (sa === 0 || sb === 0) return 0;
  return covAt(a, b, idx) / (sa * sb);
}

// cyclic Jacobi eigenvalues of a symmetric matrix
function eigenvalues(m: number[][]): number[] {
  const n = m.length;
  if (!n) return [];
  const a = m.map((r) => [...r]);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-9) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-12) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  return a.map((_, i) => a[i][i]).sort((x, y) => y - x);
}

export interface DivCluster { members: string[]; internalCorr: number; weight: number; riskContribPct: number; }
export interface DivData {
  nHoldings: number;
  effectiveBets: number;
  diversificationRatio: number;
  avgCorr: number;
  corrConcentration: number;   // % variance in 1st principal component
  factorConcentration: number; // dominant sector capital share %
  hhi: number;
  effectiveRiskContributors: number;
  top5: number; top10: number;
  largestPos: { sym: string; w: number };
  largestRisk: { sym: string; pct: number };
  correlation: { symbols: string[]; matrix: number[][] };
  highestPair: { a: string; b: string; r: number } | null;
  lowestPair: { a: string; b: string; r: number } | null;
  clusters: DivCluster[];
  score: { total: number; label: string; components: { correlation: number; bets: number; ratio: number; concentration: number; factor: number } };
  factors: { marketBeta: number; momentumTilt: number; volTilt: number; sizeTilt: number; dominantSector: string; dominantShare: number; goldShare: number; usdShare: number };
  stress: { normalCorr: number; stressCorr: number; normalDR: number; stressDR: number; collapsePct: number };
  history: { dates: string[]; avgCorr: number[]; divRatio: number[]; effBets: number[]; score: number[] };
}

interface Bench { dates: string[]; close: number[]; }

function scoreLabel(s: number): string {
  if (s >= 90) return "Institutional-Grade Diversification";
  if (s >= 75) return "Strong Diversification";
  if (s >= 60) return "Moderate Diversification";
  if (s >= 40) return "Weak Diversification";
  return "Highly Concentrated Portfolio";
}

function zTilt(weights: number[], values: number[]): number {
  const m = mean(values), sd = stdev(values) || 1;
  let t = 0;
  for (let i = 0; i < weights.length; i++) t += weights[i] * ((values[i] - m) / sd);
  return t;
}

export function buildDiversification(positions: Position[], rates: SymbolRates, benchmark?: Bench): DivData {
  const empty: DivData = {
    nHoldings: positions.length, effectiveBets: 0, diversificationRatio: 0, avgCorr: 0, corrConcentration: 0,
    factorConcentration: 0, hhi: 0, effectiveRiskContributors: 0, top5: 0, top10: 0,
    largestPos: { sym: "—", w: 0 }, largestRisk: { sym: "—", pct: 0 },
    correlation: { symbols: [], matrix: [] }, highestPair: null, lowestPair: null, clusters: [],
    score: { total: 0, label: "—", components: { correlation: 0, bets: 0, ratio: 0, concentration: 0, factor: 0 } },
    factors: { marketBeta: NaN, momentumTilt: 0, volTilt: 0, sizeTilt: 0, dominantSector: "—", dominantShare: 0, goldShare: 0, usdShare: 0 },
    stress: { normalCorr: 0, stressCorr: 0, normalDR: 0, stressDR: 0, collapsePct: 0 },
    history: { dates: [], avgCorr: [], divRatio: [], effBets: [], score: [] },
  };

  // aligned returns over overlapping window
  const dateSet = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) dateSet.add(d);
  const axis = [...dateSet].sort();
  if (axis.length < 4) return empty;

  const closeMap = new Map<string, number[]>();
  for (const p of positions) {
    if (closeMap.has(p.symbol)) continue;
    const m = new Map<string, number>();
    (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i]));
    let carry = NaN;
    const arr = axis.map((d) => { const v = m.get(d); if (v !== undefined) carry = v; return carry; });
    closeMap.set(p.symbol, arr);
  }
  const grossCur = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  const syms = [...new Set(positions.map((p) => p.symbol))].filter((s) => {
    const c = closeMap.get(s)!;
    return c.filter((x) => Number.isFinite(x)).length >= 3;
  });
  const returns: Record<string, number[]> = {};
  for (const s of syms) {
    const c = closeMap.get(s)!;
    const r: number[] = [];
    for (let i = 1; i < c.length; i++) if (c[i - 1] > 0 && Number.isFinite(c[i])) r.push(c[i] / c[i - 1] - 1);
    returns[s] = r;
  }
  const minLen = syms.length ? Math.min(...syms.map((s) => returns[s].length)) : 0;
  for (const s of syms) returns[s] = returns[s].slice(returns[s].length - minLen);
  if (minLen < 2 || syms.length < 2) return empty;

  // weights (signed) and per-symbol vol
  const wSigned: Record<string, number> = {};
  for (const p of positions) {
    const w = (Math.abs(p.marketValue) / grossCur) * (p.direction === "Short" ? -1 : 1);
    wSigned[p.symbol] = (wSigned[p.symbol] ?? 0) + w;
  }
  const sig: Record<string, number> = {};
  for (const s of syms) sig[s] = stdev(returns[s]);

  // correlation + covariance
  const corr: number[][] = syms.map((a) => syms.map((b) => corrAt(returns[a], returns[b])));
  const cov: number[][] = syms.map((a) => syms.map((b) => covAt(returns[a], returns[b])));
  // portfolio vol + diversification ratio
  let portVar = 0;
  for (let i = 0; i < syms.length; i++) for (let j = 0; j < syms.length; j++) portVar += wSigned[syms[i]] * wSigned[syms[j]] * cov[i][j];
  const sigmaP = Math.sqrt(Math.max(portVar, 0));
  let wAvgVol = 0;
  for (const s of syms) wAvgVol += Math.abs(wSigned[s]) * sig[s];
  const divRatio = sigmaP > 0 ? wAvgVol / sigmaP : 0;

  // avg pairwise corr + extremes
  let cs = 0, cn = 0;
  let hi: DivData["highestPair"] = null, lo: DivData["lowestPair"] = null;
  for (let i = 0; i < syms.length; i++) for (let j = i + 1; j < syms.length; j++) {
    const r = corr[i][j]; cs += r; cn++;
    if (!hi || r > hi.r) hi = { a: syms[i], b: syms[j], r };
    if (!lo || r < lo.r) lo = { a: syms[i], b: syms[j], r };
  }
  const avgCorr = cn ? cs / cn : 0;

  // eigenvalues → effective number of bets (participation ratio) + corr concentration
  const ev = eigenvalues(corr);
  const sumEv = ev.reduce((s, x) => s + Math.max(0, x), 0) || syms.length;
  const sumEv2 = ev.reduce((s, x) => s + Math.max(0, x) ** 2, 0) || 1;
  const effectiveBets = (sumEv * sumEv) / sumEv2;
  const corrConcentration = (Math.max(...ev) / syms.length) * 100;

  // risk contributions (component VaR share)
  const sigmaW: Record<string, number> = {};
  for (let i = 0; i < syms.length; i++) { let acc = 0; for (let j = 0; j < syms.length; j++) acc += cov[i][j] * wSigned[syms[j]]; sigmaW[syms[i]] = acc; }
  const riskPct: Record<string, number> = {};
  for (const s of syms) riskPct[s] = portVar > 0 ? (wSigned[s] * sigmaW[s]) / portVar * 100 : 0;
  const riskShares = syms.map((s) => riskPct[s] / 100);
  const effRiskContrib = riskShares.reduce((a, b) => a + b * b, 0) > 0 ? 1 / riskShares.reduce((a, b) => a + b * b, 0) : 0;

  // concentration (capital)
  const weightsPct = positions.map((p) => (Math.abs(p.marketValue) / grossCur) * 100).sort((a, b) => b - a);
  const hhi = weightsPct.reduce((s, w) => s + (w / 100) ** 2, 0);
  const top5 = weightsPct.slice(0, 5).reduce((a, b) => a + b, 0);
  const top10 = weightsPct.slice(0, 10).reduce((a, b) => a + b, 0);
  const sortedByW = [...positions].sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));
  const largestPos = { sym: sortedByW[0]?.symbol ?? "—", w: sortedByW[0] ? (Math.abs(sortedByW[0].marketValue) / grossCur) * 100 : 0 };
  const lrSym = [...syms].sort((a, b) => riskPct[b] - riskPct[a])[0] ?? "—";
  const largestRisk = { sym: lrSym, pct: riskPct[lrSym] ?? 0 };

  // clusters: union-find on corr > 0.6
  const parent = syms.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < syms.length; i++) for (let j = i + 1; j < syms.length; j++) if (corr[i][j] > 0.6) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  syms.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(i); });
  const clusters: DivCluster[] = [...groups.values()].filter((g) => g.length >= 2).map((g) => {
    let ic = 0, icn = 0;
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) { ic += corr[g[a]][g[b]]; icn++; }
    const members = g.map((i) => syms[i]);
    const weight = members.reduce((s, m) => s + Math.abs(wSigned[m]) * 100, 0);
    const risk = members.reduce((s, m) => s + riskPct[m], 0);
    return { members, internalCorr: icn ? ic / icn : 0, weight, riskContribPct: risk };
  }).sort((a, b) => b.riskContribPct - a.riskContribPct);

  // correlation reorder by cluster grouping
  const order: number[] = [];
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) for (const i of g) order.push(i);
  const orderedSyms = order.map((i) => syms[i]);
  const orderedMatrix = order.map((i) => order.map((j) => +corr[i][j].toFixed(2)));

  // factor proxies
  const wAbs: number[] = syms.map((s) => Math.abs(wSigned[s]));
  const wNorm = wAbs.map((w) => w / (wAbs.reduce((a, b) => a + b, 0) || 1));
  const trailingRet = syms.map((s) => { const c = closeMap.get(s)!.filter((x) => Number.isFinite(x)); return c.length >= 2 ? c[c.length - 1] / c[0] - 1 : 0; });
  const vols = syms.map((s) => sig[s] * Math.sqrt(TRADING_DAYS));
  const mvs = syms.map((s) => positions.filter((p) => p.symbol === s).reduce((a, p) => a + Math.abs(p.marketValue), 0));
  const momentumTilt = zTilt(wNorm, trailingRet);
  const volTilt = zTilt(wNorm, vols);
  const sizeTilt = zTilt(wNorm, mvs);

  // market beta vs SPY
  let marketBeta = NaN;
  if (benchmark && benchmark.close.length > 2) {
    const bMap = new Map<string, number>();
    for (let i = 1; i < benchmark.close.length; i++) if (benchmark.close[i - 1] > 0) bMap.set(benchmark.dates[i], benchmark.close[i] / benchmark.close[i - 1] - 1);
    let bsum = 0, bw = 0;
    for (const p of positions) {
      const c = rates[p.symbol];
      if (!c || c.dates.length < 3) continue;
      const ar: number[] = [], br: number[] = [];
      for (let i = 1; i < c.dates.length; i++) { const bd = bMap.get(c.dates[i]); if (bd !== undefined && c.close[i - 1] > 0) { ar.push(c.close[i] / c.close[i - 1] - 1); br.push(bd); } }
      const vb = stdev(br) ** 2;
      if (ar.length >= 3 && vb > 0) { const beta = covAt(ar, br) / vb; bsum += (Math.abs(p.marketValue) / grossCur) * beta; bw += Math.abs(p.marketValue) / grossCur; }
    }
    if (bw > 0) marketBeta = bsum / bw;
  }

  // sector / macro shares
  const secW = new Map<string, number>();
  let goldShare = 0, usdShare = 0;
  for (const p of positions) {
    const c = classify(p.symbol);
    const w = (Math.abs(p.marketValue) / grossCur) * 100;
    secW.set(c.sector, (secW.get(c.sector) ?? 0) + w);
    if (c.assetClass === "Commodity") goldShare += w;
    if (c.assetClass === "FX") usdShare += w;
  }
  const dom = [...secW.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const factorConcentration = dom[1] as number;

  // diversification score
  const cCorr = Math.max(0, Math.min(1, (0.6 - avgCorr) / 0.6)) * 100;
  const cBets = Math.max(0, Math.min(1, effectiveBets / Math.max(1, syms.length))) * 100;
  const cRatio = Math.max(0, Math.min(1, (divRatio - 1) / 1)) * 100;
  const cConc = Math.max(0, Math.min(1, (0.25 - hhi) / 0.25)) * 100;
  const cFactor = Math.max(0, Math.min(1, (60 - factorConcentration) / 60)) * 100;
  const total = 0.30 * cCorr + 0.20 * cBets + 0.20 * cRatio + 0.15 * cConc + 0.15 * cFactor;

  // stress test: correlation in down-portfolio-return days
  const T = minLen;
  const portRet: number[] = [];
  for (let t = 0; t < T; t++) { let r = 0; for (const s of syms) r += wSigned[s] * returns[s][t]; portRet.push(r); }
  const sortedR = [...portRet].sort((a, b) => a - b);
  const thr = sortedR[Math.floor(sortedR.length / 3)] ?? 0;
  const stressIdx = portRet.map((r, i) => (r <= thr ? i : -1)).filter((i) => i >= 0);
  let scs = 0, scn = 0, scsAll = avgCorr;
  for (let i = 0; i < syms.length; i++) for (let j = i + 1; j < syms.length; j++) { scs += corrAt(returns[syms[i]], returns[syms[j]], stressIdx); scn++; }
  const stressCorr = scn ? scs / scn : avgCorr;
  // stressed DR using stress correlations × full vols
  let portVarStress = 0;
  for (let i = 0; i < syms.length; i++) for (let j = 0; j < syms.length; j++) {
    const rc = i === j ? 1 : corrAt(returns[syms[i]], returns[syms[j]], stressIdx);
    portVarStress += wSigned[syms[i]] * wSigned[syms[j]] * rc * sig[syms[i]] * sig[syms[j]];
  }
  const sigmaPStress = Math.sqrt(Math.max(portVarStress, 0));
  const stressDR = sigmaPStress > 0 ? wAvgVol / sigmaPStress : 0;
  const collapsePct = divRatio > 0 ? (1 - stressDR / divRatio) * 100 : 0;

  // rolling history (avgCorr, DR, effBets, score)
  const histDates: string[] = [], hCorr: number[] = [], hDR: number[] = [], hBets: number[] = [], hScore: number[] = [];
  const W = Math.min(12, Math.max(4, Math.floor(T / 2)));
  for (let end = W; end <= T; end++) {
    const idx = Array.from({ length: W }, (_, k) => end - W + k);
    let acs = 0, acn = 0;
    const cm: number[][] = syms.map((a) => syms.map((b) => corrAt(returns[a], returns[b], idx)));
    for (let i = 0; i < syms.length; i++) for (let j = i + 1; j < syms.length; j++) { acs += cm[i][j]; acn++; }
    const ac = acn ? acs / acn : 0;
    let pv = 0;
    for (let i = 0; i < syms.length; i++) for (let j = 0; j < syms.length; j++) pv += wSigned[syms[i]] * wSigned[syms[j]] * covAt(returns[syms[i]], returns[syms[j]], idx);
    const sp = Math.sqrt(Math.max(pv, 0));
    const dr = sp > 0 ? wAvgVol / sp : 0;
    const evv = eigenvalues(cm);
    const se = evv.reduce((s, x) => s + Math.max(0, x), 0) || syms.length;
    const se2 = evv.reduce((s, x) => s + Math.max(0, x) ** 2, 0) || 1;
    const eb = (se * se) / se2;
    const sc = 0.30 * Math.max(0, Math.min(1, (0.6 - ac) / 0.6)) * 100 + 0.20 * Math.max(0, Math.min(1, eb / Math.max(1, syms.length))) * 100 + 0.20 * Math.max(0, Math.min(1, (dr - 1) / 1)) * 100 + 0.15 * cConc + 0.15 * cFactor;
    histDates.push(axis[Math.min(axis.length - 1, end)].slice(5));
    hCorr.push(+ac.toFixed(2)); hDR.push(+dr.toFixed(2)); hBets.push(+eb.toFixed(1)); hScore.push(+sc.toFixed(0));
  }

  return {
    nHoldings: positions.length,
    effectiveBets, diversificationRatio: divRatio, avgCorr, corrConcentration, factorConcentration,
    hhi, effectiveRiskContributors: effRiskContrib, top5, top10, largestPos, largestRisk,
    correlation: { symbols: orderedSyms, matrix: orderedMatrix }, highestPair: hi, lowestPair: lo, clusters,
    score: { total, label: scoreLabel(total), components: { correlation: cCorr, bets: cBets, ratio: cRatio, concentration: cConc, factor: cFactor } },
    factors: { marketBeta, momentumTilt, volTilt, sizeTilt, dominantSector: dom[0] as string, dominantShare: dom[1] as number, goldShare, usdShare },
    stress: { normalCorr: avgCorr, stressCorr, normalDR: divRatio, stressDR, collapsePct },
    history: { dates: histDates, avgCorr: hCorr, divRatio: hDR, effBets: hBets, score: hScore },
  };
}
