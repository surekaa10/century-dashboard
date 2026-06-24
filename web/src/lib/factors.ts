// Factor exposure engine. Estimates portfolio factor betas by regressing each
// holding's daily returns on factor-proxy returns (style = long/short ETF
// spreads, macro = ETF/index returns), then aggregates by weight. Univariate
// betas + a small OLS for risk decomposition — an ETF-proxy model, not Barra.

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";

const TD = 252;
type Series = { dates: string[]; close: number[] };
type RawFactors = Record<string, Series>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

function retMap(s?: Series): Map<string, number> {
  const m = new Map<string, number>();
  if (!s || s.close.length < 2) return m;
  for (let i = 1; i < s.close.length; i++) if (s.close[i - 1] > 0) m.set(s.dates[i], s.close[i] / s.close[i - 1] - 1);
  return m;
}
function diff(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [d, v] of a) if (b.has(d)) m.set(d, v - b.get(d)!);
  return m;
}
function betaOf(y: Map<string, number>, f: Map<string, number>): number {
  const ys: number[] = [], fs: number[] = [];
  for (const [d, v] of y) if (f.has(d)) { ys.push(v); fs.push(f.get(d)!); }
  if (ys.length < 4) return NaN;
  const vf = std(fs) ** 2;
  if (vf === 0) return 0;
  const my = mean(ys), mf = mean(fs);
  let c = 0; for (let i = 0; i < ys.length; i++) c += (ys[i] - my) * (fs[i] - mf);
  return c / (ys.length - 1) / vf;
}
function cumRet(f: Map<string, number>): number { let p = 1; for (const v of f.values()) p *= 1 + v; return p - 1; }

// small OLS R² with intercept
function olsR2(y: number[], cols: number[][]): number {
  const n = y.length;
  const X = y.map((_, i) => [1, ...cols.map((c) => c[i])]);
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) { for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; } }
  // solve XtX beta = Xty (Gaussian elimination)
  const M = XtX.map((r, i) => [...r, Xty[i]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return 0;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < k; r++) if (r !== col) { const f = M[r][col] / M[col][col]; for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c]; }
  }
  const beta = M.map((r, i) => r[k] / M[i][i]);
  const my = mean(y);
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) { let yh = 0; for (let a = 0; a < k; a++) yh += beta[a] * X[i][a]; ssr += (y[i] - yh) ** 2; sst += (y[i] - my) ** 2; }
  return sst > 0 ? Math.max(0, Math.min(1, 1 - ssr / sst)) : 0;
}

export interface FactorRow {
  key: string; label: string; category: "equity" | "macro";
  exposure: number; riskContribPct: number; returnContribPct: number; factorVol: number; trend: number; significant: boolean;
}
export interface FactorData {
  ok: boolean;
  rows: FactorRow[];
  marketBeta: number;
  dominantFactor: string;
  largestExposure: { key: string; v: number };
  largestRisk: { key: string; v: number };
  nSignificant: number;
  factorHHI: number;
  factorEffN: number;
  factorConcentration: number;
  diversificationScore: { total: number; label: string };
  style: { primary: string; secondary: string; confidence: number; label: string };
  riskDecomp: { market: number; style: number; specific: number };
  returnAttr: { name: string; v: number }[];
  clusters: { dominant: string; members: string[]; weight: number; risk: number }[];
  evolution: { dates: string[]; series: Record<string, number[]>; keys: string[] };
  stress: { scenario: string; impactPct: number }[];
  insights: string[];
  summary: string;
}

interface FactorDef { key: string; label: string; category: "equity" | "macro"; make: (R: Record<string, Map<string, number>>) => Map<string, number>; }

export function buildFactors(positions: Position[], rates: SymbolRates, raw: RawFactors): FactorData {
  const empty: FactorData = {
    ok: false, rows: [], marketBeta: NaN, dominantFactor: "—", largestExposure: { key: "—", v: 0 }, largestRisk: { key: "—", v: 0 },
    nSignificant: 0, factorHHI: 0, factorEffN: 0, factorConcentration: 0, diversificationScore: { total: 0, label: "—" },
    style: { primary: "—", secondary: "—", confidence: 0, label: "Insufficient data" }, riskDecomp: { market: 0, style: 0, specific: 0 },
    returnAttr: [], clusters: [], evolution: { dates: [], series: {}, keys: [] }, stress: [], insights: [], summary: "Insufficient factor data.",
  };
  if (!raw || !raw["SPY"] || raw["SPY"].close.length < 4) return empty;

  const R: Record<string, Map<string, number>> = {};
  for (const k of Object.keys(raw)) R[k] = retMap(raw[k]);

  const defs: FactorDef[] = [
    { key: "market", label: "Market Beta", category: "equity", make: (r) => r["SPY"] },
    { key: "size", label: "Size", category: "equity", make: (r) => diff(r["IWM"], r["SPY"]) },
    { key: "value", label: "Value", category: "equity", make: (r) => diff(r["IWD"], r["SPY"]) },
    { key: "growth", label: "Growth", category: "equity", make: (r) => diff(r["IWF"], r["SPY"]) },
    { key: "momentum", label: "Momentum", category: "equity", make: (r) => diff(r["MTUM"], r["SPY"]) },
    { key: "quality", label: "Quality", category: "equity", make: (r) => diff(r["QUAL"], r["SPY"]) },
    { key: "lowvol", label: "Low Volatility", category: "equity", make: (r) => diff(r["USMV"], r["SPY"]) },
    { key: "dxy", label: "US Dollar (DXY)", category: "macro", make: (r) => r["UUP"] },
    { key: "gold", label: "Gold", category: "macro", make: (r) => r["GLD"] },
    { key: "oil", label: "Oil", category: "macro", make: (r) => r["USO"] },
    { key: "rates", label: "Rates (long bonds)", category: "macro", make: (r) => r["TLT"] },
    { key: "vix", label: "VIX", category: "macro", make: (r) => r["VIX"] ?? r["^VIX"] },
    { key: "infl", label: "Inflation (TIPS)", category: "macro", make: (r) => r["TIP"] },
    { key: "credit", label: "Credit (HY)", category: "macro", make: (r) => r["HYG"] },
  ];
  // normalize ^VIX key
  if (R["^VIX"]) R["VIX"] = R["^VIX"];

  const factorRet: Record<string, Map<string, number>> = {};
  for (const d of defs) factorRet[d.key] = d.make(R) ?? new Map();

  // holding return maps + weights
  const gross = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const holdings = positions.map((p) => {
    const s = rates[p.symbol];
    const m = retMap(s);
    return { p, ret: m, w: (Math.abs(p.marketValue) / gross) * (p.direction === "Short" ? -1 : 1), sym: p.symbol };
  });

  // per-factor portfolio exposure = Σ w_i β_i
  const exposures: Record<string, number> = {};
  const betaBySymFactor: Record<string, Record<string, number>> = {};
  for (const d of defs) {
    let exp = 0;
    for (const h of holdings) {
      const b = betaOf(h.ret, factorRet[d.key]);
      const bb = Number.isFinite(b) ? b : 0;
      (betaBySymFactor[h.sym] ??= {})[d.key] = bb;
      exp += h.w * bb;
    }
    exposures[d.key] = exp;
  }

  const factorVol: Record<string, number> = {};
  for (const d of defs) factorVol[d.key] = std([...factorRet[d.key].values()]) * Math.sqrt(TD);

  // risk contribution (exposure-weighted factor vol), normalized within equity+macro
  const rawRisk: Record<string, number> = {};
  for (const d of defs) rawRisk[d.key] = Math.abs(exposures[d.key]) * (factorVol[d.key] || 0);
  const totRisk = Object.values(rawRisk).reduce((a, b) => a + b, 0) || 1;

  // return contribution = exposure × factor cumulative return (window)
  const facCum: Record<string, number> = {};
  for (const d of defs) facCum[d.key] = cumRet(factorRet[d.key]) * 100;

  // rolling evolution (last vs first half) for trend
  const rows: FactorRow[] = defs.map((d) => {
    const exposure = exposures[d.key];
    const riskContribPct = (rawRisk[d.key] / totRisk) * 100;
    const returnContribPct = exposure * facCum[d.key];
    const significant = Math.abs(exposure) > (d.key === "market" ? 0.3 : 0.15);
    return { key: d.key, label: d.label, category: d.category, exposure, riskContribPct, returnContribPct, factorVol: factorVol[d.key] * 100, trend: 0, significant };
  });

  const marketBeta = exposures["market"];
  const styleRows = rows.filter((r) => r.category === "equity" && r.key !== "market");
  const sortedByAbs = [...rows].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));
  const dominantFactor = sortedByAbs[0]?.label ?? "—";
  const largestExposure = { key: sortedByAbs[0]?.label ?? "—", v: sortedByAbs[0]?.exposure ?? 0 };
  const byRisk = [...rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
  const largestRisk = { key: byRisk[0]?.label ?? "—", v: byRisk[0]?.riskContribPct ?? 0 };
  const nSignificant = rows.filter((r) => r.significant).length;

  const riskShares = rows.map((r) => r.riskContribPct / 100);
  const factorHHI = riskShares.reduce((s, x) => s + x * x, 0);
  const factorEffN = factorHHI > 0 ? 1 / factorHHI : 0;
  const factorConcentration = byRisk[0]?.riskContribPct ?? 0;

  // portfolio daily returns over common dates
  const allDates = [...factorRet["market"].keys()].sort();
  const portRet: number[] = [];
  const mkt: number[] = [], mom: number[] = [], gmv: number[] = [], qual: number[] = [];
  for (const dt of allDates) {
    let r = 0, has = false;
    for (const h of holdings) if (h.ret.has(dt)) { r += h.w * h.ret.get(dt)!; has = true; }
    if (!has) continue;
    const m = factorRet["market"].get(dt);
    if (m === undefined) continue;
    portRet.push(r);
    mkt.push(m);
    mom.push(factorRet["momentum"].get(dt) ?? 0);
    gmv.push((factorRet["growth"].get(dt) ?? 0) - (factorRet["value"].get(dt) ?? 0));
    qual.push(factorRet["quality"].get(dt) ?? 0);
  }
  let market = 0, style = 0, specific = 1;
  if (portRet.length >= 6) {
    const r2m = olsR2(portRet, [mkt]);
    const r2s = olsR2(portRet, [mkt, mom, gmv, qual]);
    market = r2m;
    style = Math.max(0, r2s - r2m);
    specific = Math.max(0, 1 - r2s);
    const tot = market + style + specific || 1;
    market /= tot; style /= tot; specific /= tot;
  }

  // return attribution waterfall
  const pCum = cumRet(new Map(allDates.map((d, i) => [String(i), portRet[i] ?? 0]))) * 100;
  const attrFactors: [string, string][] = [["market", "Market"], ["momentum", "Momentum"], ["growth", "Growth"], ["value", "Value"], ["quality", "Quality"]];
  const returnAttr: { name: string; v: number }[] = [];
  let explained = 0;
  for (const [key, name] of attrFactors) { const v = exposures[key] * facCum[key]; returnAttr.push({ name, v: +v.toFixed(2) }); explained += v; }
  returnAttr.push({ name: "Alpha", v: +(pCum - explained).toFixed(2) });
  returnAttr.push({ name: "Total", v: +pCum.toFixed(2) });

  // clusters by dominant style factor
  const clusterMap = new Map<string, { members: string[]; weight: number; risk: number }>();
  for (const h of holdings) {
    const bf = betaBySymFactor[h.sym] ?? {};
    let best = "market", bv = -Infinity;
    for (const r of styleRows) { const v = Math.abs(bf[r.key] ?? 0); if (v > bv) { bv = v; best = r.label; } }
    const e = clusterMap.get(best) ?? { members: [], weight: 0, risk: 0 };
    if (!e.members.includes(h.sym)) e.members.push(h.sym);
    e.weight += Math.abs(h.w) * 100;
    clusterMap.set(best, e);
  }
  const clusters = [...clusterMap.entries()].map(([dominant, v]) => ({ dominant, members: v.members, weight: v.weight, risk: v.weight })).sort((a, b) => b.weight - a.weight);

  // evolution: rolling exposure (trailing window) for key factors
  const evoKeys = ["market", "growth", "value", "momentum", "quality"];
  const evoDates: string[] = [];
  const evoSeries: Record<string, number[]> = {}; evoKeys.forEach((k) => (evoSeries[k] = []));
  const W = Math.min(12, Math.max(5, Math.floor(allDates.length / 2)));
  for (let end = W; end <= allDates.length; end++) {
    const windowDates = new Set(allDates.slice(end - W, end));
    for (const k of evoKeys) {
      let exp = 0;
      const fr = new Map([...factorRet[k]].filter(([d]) => windowDates.has(d)));
      for (const h of holdings) { const hr = new Map([...h.ret].filter(([d]) => windowDates.has(d))); const b = betaOf(hr, fr); exp += h.w * (Number.isFinite(b) ? b : 0); }
      evoSeries[k].push(+exp.toFixed(2));
    }
    evoDates.push(allDates[Math.min(allDates.length - 1, end - 1)].slice(5));
  }
  // trend = last - first
  for (const r of rows) if (evoSeries[r.key]) { const s = evoSeries[r.key]; r.trend = s.length >= 2 ? s[s.length - 1] - s[0] : 0; }

  // stress scenarios (impact% = Σ exposure × shock)
  const stress = [
    { scenario: "Market −10% (S&P)", impactPct: exposures["market"] * -10 },
    { scenario: "Rates +100bp (bonds ≈ −10%)", impactPct: exposures["rates"] * -10 },
    { scenario: "VIX +50%", impactPct: exposures["vix"] * 50 },
    { scenario: "Oil +20%", impactPct: exposures["oil"] * 20 },
    { scenario: "Dollar +5% (DXY)", impactPct: exposures["dxy"] * 5 },
  ].map((s) => ({ ...s, impactPct: +s.impactPct.toFixed(2) })).sort((a, b) => a.impactPct - b.impactPct);

  // style classification
  const posStyles = styleRows.filter((r) => r.exposure > 0.1).sort((a, b) => b.exposure - a.exposure);
  const primary = posStyles[0]?.label ?? (marketBeta > 1.05 ? "Aggressive Beta" : "Balanced");
  const secondary = posStyles[1]?.label ?? (exposures["lowvol"] > 0.1 ? "Defensive" : "Market");
  const betaWord = marketBeta > 1.1 ? "Aggressive" : marketBeta < 0.9 ? "Defensive" : "";
  const styleLabel = `${betaWord ? betaWord + " " : ""}${primary}${secondary !== "Market" ? `-oriented ${secondary}` : ""} Portfolio`.replace(/\s+/g, " ").trim();
  const confidence = Math.min(99, Math.round(40 + Math.abs(posStyles[0]?.exposure ?? 0) * 40 + factorConcentration / 3));

  // factor diversification score
  const cConc = Math.max(0, Math.min(1, (factorEffN) / Math.max(3, rows.length / 2))) * 100;
  const cBal = Math.max(0, Math.min(1, (60 - factorConcentration) / 60)) * 100;
  const cSpecific = specific * 100;
  const divTotal = 0.4 * cConc + 0.35 * cBal + 0.25 * cSpecific;
  const divLabel = divTotal >= 90 ? "Excellent" : divTotal >= 75 ? "Strong" : divTotal >= 60 ? "Moderate" : divTotal >= 40 ? "Weak" : "Highly Concentrated";

  // insights
  const insights: string[] = [];
  const topRet = [...rows].filter((r) => r.category === "equity").sort((a, b) => b.returnContribPct - a.returnContribPct);
  insights.push(`Portfolio returns are primarily driven by ${byRisk[0]?.label} and ${byRisk[1]?.label} factors.`);
  insights.push(`${byRisk.slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0).toFixed(0)}% of factor risk is explained by the top 3 factors (${byRisk.slice(0, 3).map((r) => r.label).join(", ")}).`);
  if (Math.abs(marketBeta) > 0) insights.push(`Portfolio market beta is ${marketBeta.toFixed(2)} — ${marketBeta > 1.1 ? "more aggressive than" : marketBeta < 0.9 ? "more defensive than" : "in line with"} the broad market.`);
  const rateRow = rows.find((r) => r.key === "rates");
  if (rateRow && Math.abs(rateRow.exposure) > 0.15) insights.push(`Portfolio is ${rateRow.exposure > 0 ? "positively exposed to long bonds (benefits from falling rates)" : "negatively exposed to bonds (hurt by falling rates)"} (β ${rateRow.exposure.toFixed(2)}).`);
  const vixRow = rows.find((r) => r.key === "vix");
  if (vixRow && vixRow.exposure < -0.1) insights.push(`Elevated volatility sensitivity: a VIX spike is a key vulnerability (β ${vixRow.exposure.toFixed(2)}).`);
  if (specific < 0.4) insights.push(`Only ${(specific * 100).toFixed(0)}% of risk is stock-specific — ${(100 - specific * 100).toFixed(0)}% is systematic/factor-driven.`);
  if (topRet[0]) insights.push(`${topRet[0].label} contributes the most to factor return (${topRet[0].returnContribPct >= 0 ? "+" : ""}${topRet[0].returnContribPct.toFixed(2)}%).`);
  insights.push(`Despite ${positions.length} holdings, factor analysis suggests roughly ${factorEffN.toFixed(1)} independent factor drivers.`);

  const summary = `The portfolio is primarily a ${styleLabel}. Approximately ${byRisk.slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0).toFixed(0)}% of factor risk is driven by ${byRisk.slice(0, 3).map((r) => r.label).join(", ")}. Market beta is ${marketBeta.toFixed(2)}; ${specific < 0.4 ? `only ${(specific * 100).toFixed(0)}% of risk is stock-specific` : `${(specific * 100).toFixed(0)}% of risk is stock-specific`}. It ${(rows.find((r) => r.key === "rates")?.exposure ?? 0) > 0 ? "benefits from falling interest rates" : "is pressured by falling rates"} and ${(rows.find((r) => r.key === "vix")?.exposure ?? 0) < 0 ? "is vulnerable to volatility spikes" : "is relatively resilient to volatility"}. Despite ${positions.length} securities, factor analysis suggests roughly ${factorEffN.toFixed(1)} independent risk drivers.`;

  return {
    ok: true, rows, marketBeta, dominantFactor, largestExposure, largestRisk, nSignificant,
    factorHHI, factorEffN, factorConcentration,
    diversificationScore: { total: divTotal, label: divLabel },
    style: { primary, secondary, confidence, label: styleLabel },
    riskDecomp: { market: market * 100, style: style * 100, specific: specific * 100 },
    returnAttr, clusters,
    evolution: { dates: evoDates, series: evoSeries, keys: evoKeys },
    stress, insights: insights.slice(0, 10), summary,
  };
}
