"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import type { Benchmark } from "@/lib/analytics";
import { buildAnalytics } from "@/lib/analytics";
import { buildRisk } from "@/lib/risk";
import { buildDiversification } from "@/lib/diversification";
import { buildDrawdown } from "@/lib/drawdown";
import { buildContribution, sectorAttribution, leadership, contributionConcentration } from "@/lib/attribution";
import { buildFactors } from "@/lib/factors";
import { buildStress } from "@/lib/stress";
import { analyzePeriod, buildEvolution, startIndexFor } from "@/lib/evolution";
import { buildScorecard } from "@/lib/scorecard";
import { buildIntelligence } from "@/lib/intelligence";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

type Raw = Record<string, { dates: string[]; close: number[] }>;

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2"><div className="text-sm font-semibold text-slate-200">{title}</div>{sub && <div className="text-[11px] text-slate-500">{sub}</div>}</div>
      {children}
    </div>
  );
}
function Bars({ rows, color }: { rows: { label: string; v: number; sub: string }[]; color: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  return (
    <div className="space-y-1.5 font-mono text-xs">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
          <span className="font-sans text-slate-200">{r.label}</span>
          <div className="h-2 rounded bg-white/[0.03]"><div className="h-2 rounded" style={{ width: `${(Math.abs(r.v) / max) * 100}%`, background: color(r.v) }} /></div>
          <span className="text-right text-slate-400">{r.sub}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="py-2 text-center text-slate-500">—</div>}
    </div>
  );
}
const GR = "#10b981", RD = "#f43f5e";

export default function PMDashboard({ snapshot }: { snapshot: Snapshot }) {
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>();
  const [raw, setRaw] = useState<Raw | undefined>();
  useEffect(() => {
    let alive = true;
    fetch("/api/benchmark", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close }); }).catch(() => {});
    fetch("/api/factors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j?.SPY) setRaw(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const acct = snapshot.account;
  const positions = snapshot.positions;
  const rates = snapshot.symbolRates;

  const data = useMemo(() => {
    if (!acct) return null;
    const ana = buildAnalytics(positions, rates, benchmark);
    const risk = buildRisk(positions, rates);
    const div = buildDiversification(positions, rates, benchmark);
    const dd = buildDrawdown(acct, positions, rates);
    const contrib = buildContribution(positions, rates);
    const sectors = sectorAttribution(contrib.perPosition);
    const lead = leadership(contrib.perPosition);
    const conc = contributionConcentration(contrib.perPosition);
    const evo = buildEvolution(snapshot.deals, positions, rates);
    const analysis = analyzePeriod(evo, "1M");
    const concStart = evo.states.length ? evo.states[startIndexFor(evo, "1M")] : null;
    const score = buildScorecard(acct, positions, rates, benchmark);
    const factors = raw ? buildFactors(positions, rates, raw) : null;
    const stress = raw ? buildStress(positions, rates, raw, acct.equity) : null;
    const intel = buildIntelligence(acct, positions, rates, benchmark, raw);
    return { ana, risk, div, dd, contrib, sectors, lead, conc, concStart, analysis, score, factors, stress, intel };
  }, [acct, positions, rates, benchmark, raw, snapshot.deals]);

  if (!acct || !data) return <div className="px-6 py-10 text-center text-slate-500">Loading portfolio command center…</div>;
  const { ana, risk, div, dd, contrib, sectors, lead, conc, concStart, analysis, score, factors, stress, intel } = data;

  const status = intel.status === "healthy" ? { dot: "🟢", t: "Healthy", c: "text-emerald-400" } : intel.status === "watchlist" ? { dot: "🟡", t: "Monitor Closely", c: "text-amber-400" } : { dot: "🔴", t: "Action Required", c: "text-rose-400" };
  const gross = risk.gross || 1, eq = acct.equity || 1;
  const netPct = (ana.netExposure / eq) * 100, grossX = gross / eq;
  const byContrib = [...contrib.perPosition].sort((a, b) => b.contribUsd - a.contribUsd);
  const winners = byContrib.slice(0, 10).filter((p) => p.contribUsd > 0);
  const losers = [...contrib.perPosition].sort((a, b) => a.contribUsd - b.contribUsd).slice(0, 10).filter((p) => p.contribUsd < 0);
  const byRisk = [...risk.rows].sort((a, b) => b.riskContribPct - a.riskContribPct).slice(0, 10);
  const recs = (score.ok ? score.recommendations : []).slice(0, 5);

  // Q10 priority queue
  const bySym = new Map<string, { weight: number; risk: number; pnl: number; vol: number }>();
  for (const e of ana.positions) { const x = bySym.get(e.symbol) ?? { weight: 0, risk: 0, pnl: 0, vol: e.volAnnual }; x.weight += e.weight; x.pnl = e.pnlPct; x.vol = e.volAnnual; bySym.set(e.symbol, x); }
  for (const r of risk.rows) { const x = bySym.get(r.symbol); if (x) x.risk += r.riskContribPct; }
  const queue = [...bySym.entries()].map(([symbol, x]) => {
    const reasons: { r: string; sev: "High" | "Medium"; act: string; w: number }[] = [];
    if (x.risk > x.weight * 1.4 && x.risk > 8) reasons.push({ r: "Risk contribution exceeds weight", sev: "High", act: "Review position size", w: x.risk });
    if (x.pnl < -8) reasons.push({ r: "Large unrealized loss", sev: "High", act: "Review thesis", w: -x.pnl });
    if (x.weight > 10) reasons.push({ r: "Concentration risk", sev: x.weight > 14 ? "High" : "Medium", act: "Trim toward <10%", w: x.weight });
    if (x.vol > 50) reasons.push({ r: "High volatility", sev: "Medium", act: "Monitor", w: x.vol / 5 });
    const top = reasons.sort((a, b) => b.w - a.w)[0];
    return { symbol, top, score: reasons.reduce((s, r) => s + r.w, 0), risk: x.risk, weight: x.weight };
  }).filter((q) => q.top).sort((a, b) => b.score - a.score).slice(0, 8);

  const vulns = stress?.vulnerability ? [...stress.vulnerability].sort((a, b) => a.portfolio - b.portfolio).slice(0, 5) : [];
  const topFactors = factors?.ok ? [...factors.rows].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure)).slice(0, 6) : [];
  const cashAlloc = (acct.freeMargin / eq) * 100;

  return (
    <div className="px-6 pb-10">
      {/* Executive summary */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.03] to-transparent p-4">
        <div className="flex items-center gap-3"><span className="text-2xl">{status.dot}</span><div><div className={`text-lg font-semibold ${status.c}`}>{status.t}</div><div className="text-[11px] text-slate-500">{new Date().toLocaleString()} · auto-refresh</div></div></div>
        <div className="flex flex-wrap gap-2">
          <Kpi label="Health" v={`${intel.healthScore.toFixed(0)}`} />
          <Kpi label="Daily Ret" v={fmtPct((dd.currentValue && dd.curve.length > 1 ? (dd.curve[dd.curve.length - 1].value / dd.curve[dd.curve.length - 2].value - 1) * 100 : 0))} />
          <Kpi label="Curr DD" v={fmtPct(dd.currentDD)} cls={dd.currentDD < -5 ? "text-rose-400" : "text-slate-100"} />
          <Kpi label="VaR 95%" v={`$${(risk.var95 / 1000).toFixed(1)}k`} />
          <Kpi label="Beta" v={factors?.ok ? factors.marketBeta.toFixed(2) : "—"} />
          <Kpi label="Gross" v={`${grossX.toFixed(2)}x`} />
          <Kpi label="Net" v={`${netPct.toFixed(0)}%`} />
        </div>
      </div>

      {/* CIO brief */}
      <div className="mt-4 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.03] p-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70">Today&apos;s CIO Brief</div>
        <p className="text-sm leading-relaxed text-slate-200">{intel.brief}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="1 · What Made Money" sub={`Top contributors · ${sectors[0]?.sector ?? "—"} leads`}>
          <Bars rows={winners.map((p) => ({ label: p.symbol, v: p.contribUsd, sub: `${p.contribPct.toFixed(2)}% · ${fmtSigned(p.contribUsd, 0)}` }))} color={() => GR} />
        </Card>
        <Card title="2 · What Lost Money" sub={`Largest detractor sector: ${[...sectors].sort((a, b) => a.contribUsd - b.contribUsd)[0]?.sector ?? "—"}`}>
          <Bars rows={losers.map((p) => ({ label: p.symbol, v: p.contribUsd, sub: `${p.contribPct.toFixed(2)}% · ${fmtSigned(p.contribUsd, 0)}` }))} color={() => RD} />
        </Card>

        <Card title="3 · What Generated Risk" sub="Flag = risk contribution > weight">
          <div className="space-y-1 font-mono text-xs">
            {byRisk.map((r) => (
              <div key={r.symbol + r.marketValue} className="flex items-center justify-between">
                <span className="font-sans text-slate-200">{r.symbol} {r.riskContribPct > r.weight + 2 && <span className="text-rose-400">⚑</span>}</span>
                <span className="text-slate-400">risk <span className="text-rose-300">{r.riskContribPct.toFixed(0)}%</span> · wt {r.weight.toFixed(0)}% · CVaR ${fmtMoney(r.componentVar, 0)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="4 · What's Driving Returns">
          <div className="space-y-1 text-xs text-slate-300">
            <Row k="Largest + driver" v={`${byContrib[0]?.symbol ?? "—"} ${fmtSigned(byContrib[0]?.contribUsd ?? 0, 0)}`} />
            <Row k="Largest − driver" v={`${byContrib[byContrib.length - 1]?.symbol ?? "—"} ${fmtSigned(byContrib[byContrib.length - 1]?.contribUsd ?? 0, 0)}`} />
            <Row k="Top sector" v={`${sectors[0]?.sector ?? "—"} (${sectors[0]?.contribPct.toFixed(2) ?? 0}%)`} />
            <Row k="Worst sector" v={`${[...sectors].sort((a, b) => a.contribUsd - b.contribUsd)[0]?.sector ?? "—"}`} />
            {factors?.ok && <Row k="Largest factor" v={`${factors.dominantFactor} (β ${factors.largestExposure.v.toFixed(2)})`} />}
            <Row k="Top-5 share of gains" v={`${conc.top5.toFixed(0)}%`} />
          </div>
        </Card>

        <Card title="5 · Factor Exposure" sub={factors?.ok ? `Highest: ${factors.largestExposure.key}` : "loading factor proxies…"}>
          {factors?.ok ? <div className="space-y-1 font-mono text-xs">{topFactors.map((f) => (
            <div key={f.key} className="flex items-center justify-between"><span className="font-sans text-slate-300">{f.label}</span><span className={pnlClass(f.exposure)}>{f.exposure >= 0 ? "+" : ""}{f.exposure.toFixed(2)} · risk {f.riskContribPct.toFixed(0)}% {f.trend > 0.05 ? "↑" : f.trend < -0.05 ? "↓" : "→"}</span></div>
          ))}</div> : <div className="text-xs text-slate-500">Fetching factor-proxy data…</div>}
        </Card>
        <Card title="6 · Concentration vs History">
          <div className="space-y-1 text-xs text-slate-300">
            <Row k="HHI" v={concStart ? `${concStart.hhi.toFixed(3)} → ${ana.hhi.toFixed(3)}` : ana.hhi.toFixed(3)} cls={trendCls(concStart?.hhi ?? ana.hhi, ana.hhi, true)} />
            <Row k="Largest position" v={`${ana.largestWeightPct.toFixed(1)}%`} />
            <Row k="Top 5" v={concStart ? `${concStart.top5.toFixed(0)}% → ${ana.top5Pct.toFixed(0)}%` : `${ana.top5Pct.toFixed(0)}%`} cls={trendCls(concStart?.top5 ?? ana.top5Pct, ana.top5Pct, true)} />
            <Row k="Effective holdings" v={concStart ? `${concStart.effN.toFixed(1)} → ${ana.effectiveN.toFixed(1)}` : ana.effectiveN.toFixed(1)} cls={trendCls(concStart?.effN ?? ana.effectiveN, ana.effectiveN, false)} />
            <Row k="Effective bets" v={`${div.effectiveBets.toFixed(1)}`} />
          </div>
        </Card>

        <Card title="7 · Diversification">
          <div className="space-y-1 text-xs text-slate-300">
            <Row k="Diversification score" v={`${div.score.total.toFixed(0)}/100`} />
            <Row k="Avg correlation" v={div.history.avgCorr.length >= 2 ? `${div.history.avgCorr[0].toFixed(2)} → ${div.avgCorr.toFixed(2)}` : div.avgCorr.toFixed(2)} cls={trendCls(div.history.avgCorr[0] ?? div.avgCorr, div.avgCorr, true)} />
            <Row k="Diversification ratio" v={div.diversificationRatio.toFixed(2)} />
            <Row k="Effective bets" v={`${div.effectiveBets.toFixed(1)} of ${positions.length}`} />
          </div>
        </Card>
        <Card title="8 · What Would Hurt Me Most" sub="Top vulnerabilities (factor-based)">
          {vulns.length ? <Bars rows={vulns.map((v) => ({ label: v.factor.split(" ")[0], v: v.portfolio, sub: `${v.portfolio.toFixed(1)}%` }))} color={(v) => (v >= 0 ? GR : RD)} /> : <div className="text-xs text-slate-500">Fetching scenario data…</div>}
        </Card>

        <Card title="9 · Changes Since Last Month">
          <div className="space-y-1 text-xs text-slate-300">
            <Row k="New / exited" v={`${analysis.kpis.newAdded} new · ${analysis.kpis.exited} exited`} />
            <Row k="Largest ↑ weight" v={analysis.kpis.largestIncrease ? `${analysis.kpis.largestIncrease.symbol} +${analysis.kpis.largestIncrease.change.toFixed(1)}%` : "—"} />
            <Row k="Largest ↓ weight" v={analysis.kpis.largestDecrease ? `${analysis.kpis.largestDecrease.symbol} ${analysis.kpis.largestDecrease.change.toFixed(1)}%` : "—"} />
            <Row k="Capital added" v={`$${(analysis.kpis.netAdded / 1000).toFixed(0)}k`} />
            <Row k="Sector inflow" v={analysis.capitalBySector[0]?.key ?? "—"} />
          </div>
        </Card>
        <Card title="10 · Positions Needing Attention" sub="Priority queue">
          <div className="space-y-1.5">
            {queue.map((q, i) => (
              <div key={q.symbol} className="flex items-center justify-between text-xs">
                <span className="text-slate-300"><span className="text-slate-600">{i + 1}.</span> <span className="font-sans font-medium text-slate-100">{q.symbol}</span> — {q.top!.r}</span>
                <span className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[9px] ${q.top!.sev === "High" ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"}`}>{q.top!.sev}</span><span className="text-cyan-400/70">{q.top!.act}</span></span>
              </div>
            ))}
            {queue.length === 0 && <div className="text-xs text-slate-500">No positions flagged for review.</div>}
          </div>
        </Card>
      </div>

      {/* Snapshot + actions */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Portfolio Snapshot">
          <div className="grid grid-cols-2 gap-x-6 text-xs text-slate-300 sm:grid-cols-3">
            <Row k="Holdings" v={`${new Set(positions.map((p) => p.symbol)).size}`} />
            <Row k="Winners" v={`${lead.winners}`} cls="text-emerald-400" />
            <Row k="Losers" v={`${lead.losers}`} cls="text-rose-400" />
            <Row k="Win rate" v={`${lead.winRate.toFixed(0)}%`} />
            <Row k="Largest pos" v={`${ana.largestWeightPct.toFixed(1)}%`} />
            <Row k="Cash / free margin" v={`${cashAlloc.toFixed(0)}%`} />
            <Row k="Net exposure" v={`${netPct.toFixed(0)}%`} />
            <Row k="Gross exposure" v={`${grossX.toFixed(2)}x`} />
            <Row k="Leverage" v={`1:${acct.leverage}`} />
          </div>
        </Card>
        <Card title="Executive Action Panel" sub="Top recommended actions">
          <div className="space-y-1.5">
            {recs.map((r, i) => <div key={i} className="flex items-start gap-2 text-xs"><span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">+{r.impact}</span><span className="text-slate-300">{r.text}</span></div>)}
            {recs.length === 0 && <div className="text-xs text-emerald-300">No material weaknesses — portfolio scores well across pillars.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, v, cls = "text-slate-100" }: { label: string; v: string; cls?: string }) { return <div className="rounded-lg bg-white/[0.02] px-3 py-1.5 text-center"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className={`font-mono text-base font-semibold ${cls}`}>{v}</div></div>; }
function Row({ k, v, cls = "text-slate-200" }: { k: string; v: string; cls?: string }) { return <div className="flex justify-between border-b border-white/[0.04] py-1"><span className="text-slate-500">{k}</span><span className={`font-mono ${cls}`}>{v}</span></div>; }
function trendCls(start: number, now: number, higherBad: boolean): string { const up = now > start + 0.01; const down = now < start - 0.01; if (!up && !down) return "text-slate-200"; return (higherBad ? up : down) ? "text-rose-400" : "text-emerald-400"; }
