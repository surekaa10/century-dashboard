// Stress testing engine. Estimates portfolio impact under historical crises,
// macro shocks, factor shocks, custom scenarios, and a Monte-Carlo tail
// simulation. Holdings postdate the historical crises, so impacts are
// FACTOR-BASED PREDICTED estimates: per-position betas to factor-proxy ETF
// returns × each scenario's characteristic shock vector (the Aladdin/Barra
// "predicted scenario" approach), not an actual price replay.

import type { Position, SymbolRates } from "./types";
import { classify } from "./sectors";

type Series = { dates: string[]; close: number[] };
type Raw = Record<string, Series>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
function retMap(s?: Series): Map<string, number> { const m = new Map<string, number>(); if (!s || s.close.length < 2) return m; for (let i = 1; i < s.close.length; i++) if (s.close[i - 1] > 0) m.set(s.dates[i], s.close[i] / s.close[i - 1] - 1); return m; }
function diff(a: Map<string, number>, b: Map<string, number>) { const m = new Map<string, number>(); for (const [d, v] of a) if (b.has(d)) m.set(d, v - b.get(d)!); return m; }
function beta(y: Map<string, number>, f: Map<string, number>): number { const ys: number[] = [], fs: number[] = []; for (const [d, v] of y) if (f.has(d)) { ys.push(v); fs.push(f.get(d)!); } if (ys.length < 4) return 0; const vf = std(fs) ** 2; if (vf === 0) return 0; const my = mean(ys), mf = mean(fs); let c = 0; for (let i = 0; i < ys.length; i++) c += (ys[i] - my) * (fs[i] - mf); return c / (ys.length - 1) / vf; }

export type Shocks = { mkt: number; bonds: number; vix: number; oil: number; gold: number; dxy: number; growth: number; momentum: number };
const ZERO: Shocks = { mkt: 0, bonds: 0, vix: 0, oil: 0, gold: 0, dxy: 0, growth: 0, momentum: 0 };

export interface StressPos { symbol: string; sector: string; weight: number; mv: number; betas: Shocks; }
export interface ScenarioResult { name: string; portRet: number; loss: number; worstPos: string; worstSector: string; severity: "Severe" | "High" | "Moderate" | "Mild"; }
export interface PosImpact { symbol: string; sector: string; ret: number; loss: number; contribPct: number; }
export interface SectorImpact { sector: string; ret: number; loss: number; contribPct: number; }

export interface StressModel { positions: StressPos[]; grossMV: number; }
export interface StressData {
  ok: boolean;
  model: StressModel;
  historical: ScenarioResult[];
  worst: ScenarioResult | null;
  worstPositions: PosImpact[];      // under worst scenario
  worstSectors: SectorImpact[];
  sectorByScenario: { sector: string; values: Record<string, number> }[];
  scenarioNames: string[];
  monteCarlo: { hist: { x: number; n: number }[]; var95: number; var99: number; es: number; mean: number; horizonDays: number };
  resilience: { total: number; label: string };
  tailRiskScore: number;
  recovery: { name: string; dd: number; recoveryNeeded: number; months: number }[];
  vulnerability: { factor: string; portfolio: number; sectors: { sector: string; v: number }[] }[];
  worstObserved: { worstDay: number; worstWeek: number; maxDD: number };
  insights: string[];
  summary: string;
}

export const HISTORICAL_SCENARIOS: { name: string; shocks: Shocks }[] = [
  { name: "Global Financial Crisis 2008", shocks: { mkt: -0.46, bonds: 0.10, vix: 2.5, oil: -0.50, gold: 0.05, dxy: 0.08, growth: -0.10, momentum: -0.20 } },
  { name: "Dot-Com Crash 2000–02", shocks: { mkt: -0.35, bonds: 0.12, vix: 1.2, oil: -0.10, gold: 0.10, dxy: 0.04, growth: -0.40, momentum: -0.30 } },
  { name: "COVID Crash 2020", shocks: { mkt: -0.34, bonds: 0.10, vix: 3.0, oil: -0.55, gold: 0.03, dxy: 0.03, growth: -0.10, momentum: -0.15 } },
  { name: "Inflation Shock 2022", shocks: { mkt: -0.20, bonds: -0.15, vix: 0.6, oil: 0.30, gold: -0.05, dxy: 0.12, growth: -0.30, momentum: -0.10 } },
  { name: "Regional Banking Crisis 2023", shocks: { mkt: -0.08, bonds: 0.05, vix: 0.4, oil: -0.10, gold: 0.08, dxy: 0.02, growth: 0.02, momentum: -0.08 } },
  { name: "Fed Tightening Cycle", shocks: { mkt: -0.12, bonds: -0.12, vix: 0.3, oil: 0.05, gold: -0.06, dxy: 0.07, growth: -0.20, momentum: -0.05 } },
  { name: "Volatility Spike Event", shocks: { mkt: -0.10, bonds: 0.03, vix: 0.8, oil: -0.05, gold: 0.02, dxy: 0.02, growth: -0.05, momentum: -0.10 } },
  { name: "Commodity Shock", shocks: { mkt: -0.05, bonds: -0.04, vix: 0.3, oil: 0.50, gold: 0.15, dxy: 0.03, growth: -0.03, momentum: 0 } },
];

const clampRet = (r: number) => Math.max(-0.95, Math.min(1.5, r));

export function posReturn(b: Shocks, s: Shocks): number {
  return clampRet(b.mkt * s.mkt + b.bonds * s.bonds + b.vix * s.vix + b.oil * s.oil + b.gold * s.gold + b.dxy * s.dxy + b.growth * s.growth + b.momentum * s.momentum);
}

export function applyShocks(model: StressModel, s: Shocks): { portRet: number; loss: number; positions: PosImpact[]; sectors: SectorImpact[] } {
  const positions: PosImpact[] = model.positions.map((p) => {
    const ret = posReturn(p.betas, s);
    return { symbol: p.symbol, sector: p.sector, ret, loss: ret * p.mv, contribPct: 0 };
  });
  const portLoss = positions.reduce((a, p) => a + p.loss, 0);
  const portRet = model.grossMV > 0 ? portLoss / model.grossMV : 0;
  const totalLoss = positions.reduce((a, p) => a + Math.min(0, p.loss), 0) || -1;
  for (const p of positions) p.contribPct = p.loss < 0 ? (p.loss / totalLoss) * 100 : 0;
  const secMap = new Map<string, { loss: number; mv: number }>();
  for (let i = 0; i < model.positions.length; i++) { const mp = model.positions[i]; const e = secMap.get(mp.sector) ?? { loss: 0, mv: 0 }; e.loss += positions[i].loss; e.mv += mp.mv; secMap.set(mp.sector, e); }
  const negTot = [...secMap.values()].reduce((a, e) => a + Math.min(0, e.loss), 0) || -1;
  const sectors: SectorImpact[] = [...secMap.entries()].map(([sector, e]) => ({ sector, ret: e.mv > 0 ? e.loss / e.mv : 0, loss: e.loss, contribPct: e.loss < 0 ? (e.loss / negTot) * 100 : 0 })).sort((a, b) => a.loss - b.loss);
  return { portRet, loss: portLoss, positions, sectors };
}

function severity(ret: number): ScenarioResult["severity"] { const r = -ret; return r > 0.25 ? "Severe" : r > 0.15 ? "High" : r > 0.07 ? "Moderate" : "Mild"; }

// Box–Muller normal
function randn(): number { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function buildStress(positions: Position[], rates: SymbolRates, raw: Raw, equity: number): StressData {
  const empty: StressData = { ok: false, model: { positions: [], grossMV: 0 }, historical: [], worst: null, worstPositions: [], worstSectors: [], sectorByScenario: [], scenarioNames: [], monteCarlo: { hist: [], var95: 0, var99: 0, es: 0, mean: 0, horizonDays: 21 }, resilience: { total: 0, label: "—" }, tailRiskScore: 0, recovery: [], vulnerability: [], worstObserved: { worstDay: 0, worstWeek: 0, maxDD: 0 }, insights: [], summary: "Insufficient data for stress testing." };
  if (!raw || !raw["SPY"] || raw["SPY"].close.length < 4) return empty;

  const R: Record<string, Map<string, number>> = {};
  for (const k of Object.keys(raw)) R[k] = retMap(raw[k]);
  const fr: Shocks = ZERO; void fr;
  const F = {
    mkt: R["SPY"], bonds: R["TLT"], vix: R["^VIX"] ?? R["VIX"], oil: R["USO"], gold: R["GLD"], dxy: R["UUP"],
    growth: diff(R["IWF"] ?? new Map(), R["SPY"]), momentum: diff(R["MTUM"] ?? new Map(), R["SPY"]),
  };

  const grossMV = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const model: StressModel = {
    grossMV,
    positions: positions.map((p) => {
      const y = retMap(rates[p.symbol]);
      const sign = p.direction === "Short" ? -1 : 1;
      const betas: Shocks = {
        mkt: beta(y, F.mkt) * sign, bonds: beta(y, F.bonds) * sign, vix: beta(y, F.vix ?? new Map()) * sign,
        oil: beta(y, F.oil) * sign, gold: beta(y, F.gold) * sign, dxy: beta(y, F.dxy) * sign,
        growth: beta(y, F.growth) * sign, momentum: beta(y, F.momentum) * sign,
      };
      return { symbol: p.symbol, sector: classify(p.symbol).sector, weight: (Math.abs(p.marketValue) / grossMV) * 100, mv: Math.abs(p.marketValue), betas };
    }),
  };

  // historical scenarios
  const historical: ScenarioResult[] = HISTORICAL_SCENARIOS.map((sc) => {
    const r = applyShocks(model, sc.shocks);
    const wp = [...r.positions].sort((a, b) => a.loss - b.loss)[0];
    const ws = r.sectors[0];
    return { name: sc.name, portRet: r.portRet, loss: r.loss, worstPos: wp?.symbol ?? "—", worstSector: ws?.sector ?? "—", severity: severity(r.portRet) };
  }).sort((a, b) => a.portRet - b.portRet);

  const worstSc = historical[0] ?? null;
  const worstShock = HISTORICAL_SCENARIOS.find((s) => s.name === worstSc?.name)?.shocks ?? ZERO;
  const worstApplied = applyShocks(model, worstShock);
  const worstPositions = [...worstApplied.positions].sort((a, b) => a.loss - b.loss).slice(0, 10);
  const worstSectors = worstApplied.sectors;

  // sector × scenario heatmap
  const scenarioNames = HISTORICAL_SCENARIOS.map((s) => s.name);
  const allSectors = [...new Set(model.positions.map((p) => p.sector))];
  const sectorByScenario = allSectors.map((sector) => {
    const values: Record<string, number> = {};
    for (const sc of HISTORICAL_SCENARIOS) { const r = applyShocks(model, sc.shocks); const si = r.sectors.find((x) => x.sector === sector); values[sc.name] = si ? si.ret * 100 : 0; }
    return { sector, values };
  });

  // Monte Carlo (portfolio daily return ~ N(mu, sigma) from holdings; stressed vol ×1.4)
  const syms = [...new Set(positions.map((p) => p.symbol))].filter((s) => retMap(rates[s]).size >= 3);
  const retArr: Record<string, number[]> = {};
  const dates = [...retMap(rates[syms[0]] ?? undefined).keys()];
  for (const s of syms) { const m = retMap(rates[s]); retArr[s] = [...m.values()]; }
  // portfolio daily series (aligned by truncation)
  const w: Record<string, number> = {};
  for (const p of positions) w[p.symbol] = (w[p.symbol] ?? 0) + (Math.abs(p.marketValue) / grossMV) * (p.direction === "Short" ? -1 : 1);
  const minL = syms.length ? Math.min(...syms.map((s) => retArr[s].length)) : 0;
  const portDaily: number[] = [];
  for (let t = 0; t < minL; t++) { let r = 0; for (const s of syms) r += w[s] * retArr[s][retArr[s].length - minL + t]; portDaily.push(r); }
  const muD = mean(portDaily), sdD = (std(portDaily) || 0.01) * 1.4;
  const H = 21, N = 8000;
  const sims: number[] = [];
  for (let i = 0; i < N; i++) { let c = 0; for (let d = 0; d < H; d++) c += muD + sdD * randn(); sims.push(c); }
  sims.sort((a, b) => a - b);
  const q = (p: number) => sims[Math.floor(p * N)];
  const var95 = q(0.05), var99 = q(0.01);
  const es = mean(sims.slice(0, Math.floor(0.05 * N)));
  // histogram
  const lo = sims[0], hiV = sims[N - 1], bins = 40, wbin = (hiV - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, b) => ({ x: +((lo + (b + 0.5) * wbin) * 100).toFixed(1), n: 0 }));
  for (const v of sims) { const b = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / wbin))); hist[b].n++; }

  // worst observed (own history)
  const worstDay = portDaily.length ? Math.min(...portDaily) : 0;
  let worstWeek = 0;
  for (let i = 4; i < portDaily.length; i++) { const wk = portDaily.slice(i - 4, i + 1).reduce((a, b) => a + b, 0); worstWeek = Math.min(worstWeek, wk); }
  // max drawdown of cumulative
  let cum = 1, peak = 1, mdd = 0; for (const r of portDaily) { cum *= 1 + r; peak = Math.max(peak, cum); mdd = Math.min(mdd, cum / peak - 1); }

  // recovery analysis (per scenario)
  const recovery = historical.map((sc) => { const dd = sc.portRet; const recoveryNeeded = dd < 0 ? -dd / (1 + dd) : 0; const months = recoveryNeeded > 0 ? Math.round((recoveryNeeded / 0.012)) : 0; return { name: sc.name, dd, recoveryNeeded, months }; });

  // resilience score
  const avgHist = mean(historical.map((s) => s.portRet));
  const cHist = Math.max(0, Math.min(1, (avgHist + 0.3) / 0.3)) * 100;        // avg loss 0 → 100, -30% → 0
  const cTail = Math.max(0, Math.min(1, (es + 0.25) / 0.25)) * 100;            // ES -25% → 0
  const hhi = model.positions.reduce((s, p) => s + (p.weight / 100) ** 2, 0);
  const cConc = Math.max(0, Math.min(1, (0.25 - hhi) / 0.25)) * 100;
  const portBeta = model.positions.reduce((s, p) => s + (p.weight / 100) * p.betas.mkt, 0);
  const cBeta = Math.max(0, Math.min(1, (1.4 - Math.abs(portBeta)) / 1.4)) * 100;
  const total = 0.4 * cHist + 0.25 * cTail + 0.2 * cConc + 0.15 * cBeta;
  const label = total >= 90 ? "Highly Resilient" : total >= 75 ? "Strong" : total >= 60 ? "Moderate" : total >= 40 ? "Weak" : "Fragile";
  const tailRiskScore = Math.max(0, Math.min(100, -es * 250));

  // vulnerability map (portfolio + sector sensitivity to a -10% / +shock per factor)
  const factorDefs: { factor: string; key: keyof Shocks; shock: number }[] = [
    { factor: "S&P −10%", key: "mkt", shock: -0.1 }, { factor: "Nasdaq −10% (growth)", key: "growth", shock: -0.1 },
    { factor: "Rates +100bp (bonds −10%)", key: "bonds", shock: -0.1 }, { factor: "Oil +20%", key: "oil", shock: 0.2 },
    { factor: "Gold +10%", key: "gold", shock: 0.1 }, { factor: "DXY +5%", key: "dxy", shock: 0.05 }, { factor: "VIX +50%", key: "vix", shock: 0.5 },
  ];
  const vulnerability = factorDefs.map((fd) => {
    const s: Shocks = { ...ZERO, [fd.key]: fd.shock };
    const r = applyShocks(model, s);
    const sectors = r.sectors.map((x) => ({ sector: x.sector, v: x.ret * 100 })).sort((a, b) => a.v - b.v).slice(0, 6);
    return { factor: fd.factor, portfolio: r.portRet * 100, sectors };
  });

  // insights + summary
  const covidShock = HISTORICAL_SCENARIOS.find((s) => s.name.includes("COVID"))!.shocks;
  const covid = applyShocks(model, covidShock);
  const insights: string[] = [];
  insights.push(`The portfolio would have lost approximately ${Math.abs(covid.portRet * 100).toFixed(1)}% during the COVID 2020 crash (factor-based estimate).`);
  if (worstSc) insights.push(`Worst historical scenario is ${worstSc.name}: estimated ${(worstSc.portRet * 100).toFixed(1)}% (${worstSc.loss < 0 ? "-" : ""}$${Math.abs(worstSc.loss).toLocaleString("en-US", { maximumFractionDigits: 0 })}).`);
  const topSec = worstSectors[0];
  if (topSec) insights.push(`${topSec.sector} accounts for ${Math.abs(topSec.contribPct).toFixed(0)}% of projected losses under the worst equity stress.`);
  const top3 = worstPositions.slice(0, 3).reduce((a, p) => a + Math.abs(p.contribPct), 0);
  insights.push(`Three positions account for ${top3.toFixed(0)}% of projected losses in the severest scenario.`);
  const rateScn = applyShocks(model, { ...ZERO, bonds: -0.1, mkt: -0.05 });
  insights.push(`A 100bp rise in interest rates is estimated to reduce portfolio value by ${Math.abs(rateScn.portRet * 100).toFixed(1)}%.`);
  if (tailRiskScore > 50) insights.push(`The portfolio exhibits above-average sensitivity to volatility/tail shocks (tail-risk score ${tailRiskScore.toFixed(0)}).`);
  insights.push(`Monte-Carlo 1-month 95% stress VaR is ${(var95 * 100).toFixed(1)}%; expected shortfall ${(es * 100).toFixed(1)}%.`);

  const summary = `The portfolio demonstrates ${label.toLowerCase()} resilience under historical stress. The worst modelled scenario (${worstSc?.name}) implies an estimated loss of ${worstSc ? Math.abs(worstSc.portRet * 100).toFixed(1) : "—"}%, and the COVID-2020 shock implies roughly ${Math.abs(covid.portRet * 100).toFixed(1)}%. Portfolio market beta is ${portBeta.toFixed(2)}; losses are concentrated in ${worstSectors[0]?.sector ?? "—"} and a small number of positions. The book ${portBeta > 1 ? "amplifies" : "dampens"} broad equity moves and is ${(model.positions.reduce((s, p) => s + (p.weight / 100) * p.betas.bonds, 0)) > 0 ? "helped by falling rates" : "pressured by rising rates"}.`;

  return {
    ok: true, model, historical, worst: worstSc, worstPositions, worstSectors, sectorByScenario, scenarioNames,
    monteCarlo: { hist, var95, var99, es, mean: mean(sims), horizonDays: H },
    resilience: { total, label }, tailRiskScore,
    recovery, vulnerability,
    worstObserved: { worstDay, worstWeek, maxDD: mdd },
    insights: insights.slice(0, 10), summary,
  };
}
