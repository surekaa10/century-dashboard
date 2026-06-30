// Drawdown analytics engine. Reconstructs a daily portfolio equity curve
// (balance + credit + floating P&L from current holdings valued at symbol_rates,
// from inception), then extracts peak→trough→recovery episodes and derives
// drawdown statistics, recovery analysis, distribution, per-position drivers,
// resilience score, and insights.

import type { Account, Position, SymbolRates } from "./types";
import { classify } from "./sectors";

export interface EquityPt { date: string; value: number; dd: number; } // dd = % from running peak
export interface Episode {
  peakDate: string; peakValue: number;
  troughDate: string; troughValue: number;
  recoveryDate: string | null;
  ddPct: number;       // negative %
  ddDollar: number;    // negative $
  durationDays: number;  // peak → trough
  recoveryDays: number;  // trough → recovery (or trough → today if ongoing)
  ongoing: boolean;
}

export interface DrawdownData {
  ok: boolean;
  curve: EquityPt[];
  currentDD: number; peakValue: number; currentValue: number; peakDate: string; daysSincePeak: number; recoveryNeeded: number; dollarLoss: number;
  maxDD: Episode | null;
  avgDD: number;
  episodes: Episode[];          // significant, worst-first
  topWorst: Episode[];
  nOver5: number; nOver10: number;
  recovery: { avg: number; median: number; fastest: number; slowest: number; successRate: number; hist: { label: string; n: number }[] };
  distribution: { bucket: string; n: number; avgDuration: number; avgRecovery: number }[];
  byPosition: { symbol: string; sector: string; pnl: number; contribPct: number }[];
  bySector: { sector: string; pnl: number; contribPct: number }[];
  recoveryCurve: { loss: number; needed: number }[];
  rolling: { date: string; dd: number }[];
  resilience: { total: number; label: string; components: { maxdd: number; avgdd: number; recovery: number; frequency: number; consistency: number } };
  recoveryScore: number;
  insights: string[];
  summary: string;
}

const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseOpen(openTime: string): string {
  const t = openTime.trim().split(/\s+/);
  if (t.length < 3) return "";
  const dd = parseInt(t[0], 10), mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], yy = parseInt(t[2], 10);
  if (!Number.isFinite(dd) || mo === undefined || !Number.isFinite(yy)) return "";
  return `${yy}-${String(mo + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function buildDrawdown(account: Account | null, positions: Position[], rates: SymbolRates): DrawdownData {
  const empty: DrawdownData = {
    ok: false, curve: [], currentDD: 0, peakValue: 0, currentValue: 0, peakDate: "", daysSincePeak: 0, recoveryNeeded: 0, dollarLoss: 0,
    maxDD: null, avgDD: 0, episodes: [], topWorst: [], nOver5: 0, nOver10: 0,
    recovery: { avg: 0, median: 0, fastest: 0, slowest: 0, successRate: 0, hist: [] },
    distribution: [], byPosition: [], bySector: [], recoveryCurve: [], rolling: [],
    resilience: { total: 0, label: "—", components: { maxdd: 0, avgdd: 0, recovery: 0, frequency: 0, consistency: 0 } },
    recoveryScore: 0, insights: [], summary: "Insufficient history for drawdown analysis.",
  };
  if (!account) return empty;

  // price maps + open dates
  const priceMap = new Map<string, Map<string, number>>();
  for (const p of positions) if (!priceMap.has(p.symbol)) { const m = new Map<string, number>(); (rates[p.symbol]?.dates ?? []).forEach((d, i) => m.set(d, rates[p.symbol].close[i])); priceMap.set(p.symbol, m); }
  const opened = new Map<Position, string>(); for (const p of positions) opened.set(p, parseOpen(p.openTime));

  // date axis: from first open date to latest rate date
  const firstOpen = [...opened.values()].filter(Boolean).sort()[0];
  const allDates = new Set<string>();
  for (const p of positions) for (const d of rates[p.symbol]?.dates ?? []) if (!firstOpen || d >= firstOpen) allDates.add(d);
  const dates = [...allDates].sort();
  if (dates.length < 3) return empty;

  const base = account.balance + account.credit;
  const carry = new Map<string, number>();
  const curveRaw: { date: string; value: number }[] = dates.map((date, idx) => {
    for (const p of positions) { const c = priceMap.get(p.symbol)?.get(date); if (c !== undefined) carry.set(p.symbol, c); }
    let floating = 0;
    for (const p of positions) {
      const op = opened.get(p)!; if (op && op > date) continue;
      const px = carry.get(p.symbol); if (px === undefined) continue;
      floating += (p.direction === "Short" ? -1 : 1) * p.volume * (px - p.entryPrice);
    }
    return { date, value: base + floating, _last: idx === dates.length - 1 };
  });
  if (curveRaw.length) curveRaw[curveRaw.length - 1].value = account.equity; // anchor

  // drawdown curve (underwater)
  let peak = -Infinity;
  const curve: EquityPt[] = curveRaw.map((p) => { peak = Math.max(peak, p.value); const dd = peak > 0 ? (p.value / peak - 1) * 100 : 0; return { date: p.date, value: p.value, dd }; });

  // episode extraction
  const episodes: Episode[] = [];
  let rp = curveRaw[0].value, rpDate = curveRaw[0].date, inDD = false, tVal = 0, tDate = "";
  let epPeak = rp, epPeakDate = rpDate;
  for (let i = 0; i < curveRaw.length; i++) {
    const v = curveRaw[i].value, d = curveRaw[i].date;
    if (v >= rp) {
      if (inDD) {
        const ddPct = (tVal / epPeak - 1) * 100;
        episodes.push({ peakDate: epPeakDate, peakValue: epPeak, troughDate: tDate, troughValue: tVal, recoveryDate: d, ddPct, ddDollar: tVal - epPeak, durationDays: dayDiff(epPeakDate, tDate), recoveryDays: dayDiff(tDate, d), ongoing: false });
        inDD = false;
      }
      rp = v; rpDate = d;
    } else {
      if (!inDD) { inDD = true; epPeak = rp; epPeakDate = rpDate; tVal = v; tDate = d; }
      if (v < tVal) { tVal = v; tDate = d; }
    }
  }
  const today = curveRaw[curveRaw.length - 1].date;
  if (inDD) {
    const ddPct = (tVal / epPeak - 1) * 100;
    episodes.push({ peakDate: epPeakDate, peakValue: epPeak, troughDate: tDate, troughValue: tVal, recoveryDate: null, ddPct, ddDollar: tVal - epPeak, durationDays: dayDiff(epPeakDate, tDate), recoveryDays: dayDiff(tDate, today), ongoing: true });
  }
  const significant = episodes.filter((e) => e.ddPct <= -0.5).sort((a, b) => a.ddPct - b.ddPct);

  // current drawdown
  const lastV = curveRaw[curveRaw.length - 1].value;
  let runPeak = -Infinity, runPeakDate = dates[0];
  for (const p of curveRaw) { if (p.value > runPeak) { runPeak = p.value; runPeakDate = p.date; } }
  const currentDD = runPeak > 0 ? (lastV / runPeak - 1) * 100 : 0;
  const recoveryNeeded = currentDD < 0 ? (runPeak / lastV - 1) * 100 : 0;

  const maxDD = significant[0] ?? null;
  const avgDD = significant.length ? significant.reduce((s, e) => s + e.ddPct, 0) / significant.length : 0;
  const recovered = significant.filter((e) => !e.ongoing);
  const recTimes = recovered.map((e) => e.recoveryDays);
  const recHistBuckets = [0, 7, 14, 30, 60, 9999];
  const recHist = recHistBuckets.slice(0, -1).map((lo, i) => { const hi = recHistBuckets[i + 1]; return { label: hi === 9999 ? `${lo}d+` : `${lo}-${hi}d`, n: recTimes.filter((t) => t >= lo && t < hi).length }; });

  // distribution buckets
  const bks: [number, number, string][] = [[0, 2, "0–2%"], [2, 5, "2–5%"], [5, 10, "5–10%"], [10, 15, "10–15%"], [15, 20, "15–20%"], [20, 9999, "20%+"]];
  const distribution = bks.map(([lo, hi, label]) => { const es = significant.filter((e) => -e.ddPct >= lo && -e.ddPct < hi); return { bucket: label, n: es.length, avgDuration: es.length ? es.reduce((s, e) => s + e.durationDays, 0) / es.length : 0, avgRecovery: es.length ? es.reduce((s, e) => s + e.recoveryDays, 0) / es.length : 0 }; });

  // drawdown by position (worst episode peak→trough price change)
  let byPosition: DrawdownData["byPosition"] = [], bySector: DrawdownData["bySector"] = [];
  if (maxDD) {
    const priceAt = (sym: string, date: string): number | undefined => { const m = priceMap.get(sym); if (!m) return undefined; let v: number | undefined; for (const d of dates) { if (d > date) break; const c = m.get(d); if (c !== undefined) v = c; } return v; };
    const totalDrop = maxDD.ddDollar || -1;
    const rows = positions.map((p) => {
      const op = opened.get(p)!;
      const pPeak = priceAt(p.symbol, maxDD.peakDate), pTr = priceAt(p.symbol, maxDD.troughDate);
      const active = (!op || op <= maxDD.troughDate);
      const pnl = active && pPeak !== undefined && pTr !== undefined ? (p.direction === "Short" ? -1 : 1) * p.volume * (pTr - pPeak) : 0;
      return { symbol: p.symbol, sector: classify(p).sector, pnl };
    });
    const agg = new Map<string, number>(); for (const r of rows) agg.set(r.symbol, (agg.get(r.symbol) ?? 0) + r.pnl);
    byPosition = [...agg.entries()].map(([symbol, pnl]) => ({ symbol, sector: classify(symbol).sector, pnl, contribPct: pnl < 0 ? (pnl / totalDrop) * 100 : 0 })).sort((a, b) => a.pnl - b.pnl).slice(0, 10);
    const sec = new Map<string, number>(); for (const r of rows) sec.set(r.sector, (sec.get(r.sector) ?? 0) + r.pnl);
    bySector = [...sec.entries()].map(([sector, pnl]) => ({ sector, pnl, contribPct: pnl < 0 ? (pnl / totalDrop) * 100 : 0 })).sort((a, b) => a.pnl - b.pnl);
  }

  // recovery probability curve
  const recoveryCurve = [-5, -10, -15, -20, -30, -40, -50].map((loss) => ({ loss, needed: +(-loss / (1 + loss / 100) / 1).toFixed(2) }));

  // rolling underwater (already curve.dd) for comparison/sparkline
  const rolling = curve.map((p) => ({ date: p.date.slice(5), dd: +p.dd.toFixed(2) }));

  // resilience score
  const mdd = maxDD ? -maxDD.ddPct : 0;
  const cMax = Math.max(0, Math.min(1, (25 - mdd) / 25)) * 100;
  const cAvg = Math.max(0, Math.min(1, (10 + avgDD) / 10)) * 100; // avgDD negative
  const avgRec = recTimes.length ? recTimes.reduce((a, b) => a + b, 0) / recTimes.length : 0;
  const cRec = Math.max(0, Math.min(1, (60 - avgRec) / 60)) * 100;
  const cFreq = Math.max(0, Math.min(1, (8 - significant.length) / 8)) * 100;
  const negRets: number[] = []; for (let i = 1; i < curveRaw.length; i++) { const r = curveRaw[i - 1].value > 0 ? curveRaw[i].value / curveRaw[i - 1].value - 1 : 0; if (r < 0) negRets.push(r); }
  const downStd = negRets.length ? Math.sqrt(negRets.reduce((s, x) => s + x * x, 0) / negRets.length) : 0;
  const cCons = Math.max(0, Math.min(1, (0.03 - downStd) / 0.03)) * 100;
  const total = 0.30 * cMax + 0.20 * cAvg + 0.20 * cRec + 0.15 * cFreq + 0.15 * cCons;
  const label = total >= 90 ? "Excellent" : total >= 75 ? "Strong" : total >= 60 ? "Moderate" : total >= 40 ? "Weak" : "High Downside Risk";
  const recoveryScore = recovered.length ? Math.round((recovered.length / significant.length) * 100) : (significant.length ? 0 : 100);

  // insights
  const insights: string[] = [];
  if (maxDD) insights.push(`The current drawdown of ${Math.abs(currentDD).toFixed(1)}% is ${Math.abs(currentDD) < mdd ? "below" : "at/above"} the historical maximum of ${mdd.toFixed(1)}%.`);
  if (avgRec > 0) insights.push(`The portfolio typically recovers from drawdowns within ${avgRec.toFixed(0)} days.`);
  if (byPosition[0] && byPosition[0].pnl < 0) insights.push(`${byPosition[0].symbol} was the largest contributor to the worst drawdown (${byPosition[0].contribPct.toFixed(0)}% of the decline).`);
  if (bySector[0] && bySector[0].pnl < 0) insights.push(`${bySector[0].sector} drove ${Math.abs(bySector[0].contribPct).toFixed(0)}% of the worst drawdown.`);
  insights.push(`There have been ${significant.length} drawdown${significant.length === 1 ? "" : "s"} >0.5% (${episodes.filter((e) => -e.ddPct >= 5).length} exceeding 5%) over the available history.`);
  if (currentDD < 0) insights.push(`A return of +${recoveryNeeded.toFixed(2)}% is required to recover the current ${Math.abs(currentDD).toFixed(1)}% drawdown.`);
  insights.push(`Downside resilience score is ${total.toFixed(0)}/100 (${label}).`);

  const summary = `The portfolio has experienced a maximum reconstructed drawdown of ${mdd.toFixed(1)}%${maxDD ? ` (peak ${maxDD.peakDate} → trough ${maxDD.troughDate})` : ""}, with ${recovered.length ? `an average recovery time of ${avgRec.toFixed(0)} days` : "no completed recoveries yet"}. The current drawdown of ${Math.abs(currentDD).toFixed(1)}% ${Math.abs(currentDD) < mdd * 0.7 ? "remains well below historical extremes, suggesting healthy downside resilience" : "is a meaningful share of the historical maximum"}. ${byPosition[0]?.pnl < 0 ? `${byPosition[0].symbol} and ${bySector[0]?.sector ?? "tech"} are the primary drivers of significant drawdowns.` : ""} Resilience score: ${total.toFixed(0)}/100 (${label}). History is limited to ~${curveRaw.length} trading days since account inception.`;

  return {
    ok: true, curve, currentDD, peakValue: runPeak, currentValue: lastV, peakDate: runPeakDate, daysSincePeak: dayDiff(runPeakDate, today), recoveryNeeded, dollarLoss: lastV - runPeak,
    maxDD, avgDD, episodes: significant, topWorst: significant.slice(0, 10), nOver5: significant.filter((e) => -e.ddPct >= 5).length, nOver10: significant.filter((e) => -e.ddPct >= 10).length,
    recovery: { avg: avgRec, median: median(recTimes), fastest: recTimes.length ? Math.min(...recTimes) : 0, slowest: recTimes.length ? Math.max(...recTimes) : 0, successRate: significant.length ? (recovered.length / significant.length) * 100 : 100, hist: recHist },
    distribution, byPosition, bySector, recoveryCurve, rolling,
    resilience: { total, label, components: { maxdd: cMax, avgdd: cAvg, recovery: cRec, frequency: cFreq, consistency: cCons } },
    recoveryScore, insights: insights.slice(0, 10), summary,
  };
}
