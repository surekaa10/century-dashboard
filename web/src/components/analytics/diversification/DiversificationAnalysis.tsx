"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildDiversification } from "@/lib/diversification";
import type { Benchmark } from "@/lib/analytics";
import { Section, StatCard, Sparkline } from "../ui";
import {
  ScoreGauge, CorrelationHeatmap, Extremes, ClusterTable, FactorTable, StressTest, DivHistory,
} from "./DiversificationViews";

function corrClass(c: number): { t: string; cls: string } {
  if (c < 0.2) return { t: "Excellent", cls: "text-emerald-400" };
  if (c < 0.4) return { t: "Good", cls: "text-emerald-400" };
  if (c < 0.6) return { t: "Moderate", cls: "text-amber-400" };
  return { t: "Poor", cls: "text-rose-400" };
}
function drClass(d: number): string {
  if (d > 2) return "Excellent";
  if (d >= 1.5) return "Strong";
  if (d >= 1.2) return "Moderate";
  return "Poor";
}

function KpiCard({ label, value, series, color, dlt }: { label: string; value: string; series: number[]; color: string; dlt?: { d: number; m: number } }) {
  return (
    <div className="flex min-w-[170px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 font-mono text-xl font-semibold text-slate-100">{value}</span>
      <div className="mt-2 flex items-end justify-between">
        {dlt ? <span className="text-[10px] font-mono text-slate-500">{dlt.m >= 0 ? "+" : ""}{dlt.m.toFixed(2)} <span className="text-slate-600">≈1mo</span></span> : <span />}
        <Sparkline data={series} color={color} width={66} />
      </div>
    </div>
  );
}

export default function DiversificationAnalysis({ snapshot }: { snapshot: Snapshot }) {
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/benchmark", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const d = useMemo(() => buildDiversification(snapshot.positions, snapshot.symbolRates, benchmark), [snapshot.positions, snapshot.symbolRates, benchmark]);

  if (!snapshot.positions.length || d.correlation.symbols.length < 2) {
    return <div className="px-6 py-10 text-center text-slate-500">Not enough price history to assess diversification.</div>;
  }

  const h = d.history;
  const mo = (s: number[]) => (s.length >= 2 ? { d: s[s.length - 1] - s[s.length - 2], m: s[s.length - 1] - s[0] } : undefined);
  const cc = corrClass(d.avgCorr);
  const concLabel = d.hhi < 0.1 ? "Highly Diversified" : d.hhi < 0.18 ? "Moderately Concentrated" : "Highly Concentrated";
  const insights = buildInsights(d);

  return (
    <div className="px-6 pb-10">
      <Section title="Diversification Overview" subtitle="Owning many names is not the same as being diversified">
        <div className="flex flex-wrap gap-3">
          <KpiCard label="Diversification Score" value={`${d.score.total.toFixed(0)}/100`} series={h.score} color="#22d3ee" dlt={mo(h.score)} />
          <KpiCard label="Effective # of Bets" value={d.effectiveBets.toFixed(1)} series={h.effBets} color="#a78bfa" dlt={mo(h.effBets)} />
          <KpiCard label="Diversification Ratio" value={d.diversificationRatio.toFixed(2)} series={h.divRatio} color="#10b981" dlt={mo(h.divRatio)} />
          <KpiCard label="Avg Correlation" value={d.avgCorr.toFixed(2)} series={h.avgCorr} color="#f43f5e" dlt={mo(h.avgCorr)} />
          <KpiCard label="Corr. Concentration" value={`${d.corrConcentration.toFixed(0)}%`} series={[]} color="#fb923c" />
          <KpiCard label="Factor Concentration" value={`${d.factorConcentration.toFixed(0)}%`} series={[]} color="#fbbf24" />
          <KpiCard label="Portfolio HHI" value={d.hhi.toFixed(3)} series={[]} color="#38bdf8" />
          <KpiCard label="Eff. Risk Contributors" value={d.effectiveRiskContributors.toFixed(1)} series={[]} color="#34d399" />
        </div>
      </Section>

      <Section title="Diversification Score"><ScoreGauge score={d.score} /></Section>

      <Section title="Correlation Analysis" info="correlation-matrix" right={<span className={`rounded border border-white/10 px-2 py-0.5 text-xs ${cc.cls}`}>{cc.t} · ρ̄ {d.avgCorr.toFixed(2)}</span>}>
        <Extremes data={d} />
        <div className="mt-4"><CorrelationHeatmap data={d} /></div>
        <div className="mt-4"><ClusterTable data={d} /></div>
      </Section>

      <Section title="Effective Number of Bets" info="effective-bets" subtitle="Correlation-adjusted — not a simple position count">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="text-[10px] uppercase text-slate-500">Actual Holdings</div><div className="font-mono text-2xl text-slate-100">{d.nHoldings}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Effective Bets</div><div className="font-mono text-2xl text-cyan-300">{d.effectiveBets.toFixed(1)}</div></div>
            <div><div className="text-[10px] uppercase text-slate-500">Difference</div><div className="font-mono text-2xl text-rose-400">−{(d.nHoldings - d.effectiveBets).toFixed(1)}</div></div>
          </div>
          <div className="mt-3 text-sm text-slate-300">Although the portfolio contains <span className="font-mono">{d.nHoldings}</span> positions, it behaves like only <span className="font-mono text-cyan-300">{d.effectiveBets.toFixed(1)}</span> independent bets.</div>
        </div>
      </Section>

      <Section title="Diversification Ratio" info="diversification-ratio" right={<span className="rounded border border-white/10 px-2 py-0.5 text-xs text-slate-300">{drClass(d.diversificationRatio)}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Current" value={d.diversificationRatio.toFixed(2)} />
          <StatCard label="Window Start" value={(h.divRatio[0] ?? d.diversificationRatio).toFixed(2)} />
          <StatCard label="Weighted Avg Vol / Port Vol" value={drClass(d.diversificationRatio)} />
          <StatCard label="Benefit" value={`${((1 - 1 / Math.max(d.diversificationRatio, 1e-6)) * 100).toFixed(0)}%`} hint="risk reduced vs undiversified" />
        </div>
      </Section>

      <Section title="Factor Overlap Analysis"><FactorTable data={d} /></Section>

      <Section title="Concentration Analysis" info="hhi" right={<span className={`rounded border px-2 py-0.5 text-xs ${d.hhi < 0.1 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : d.hhi < 0.18 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`}>{concLabel}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="HHI" value={d.hhi.toFixed(3)} />
          <StatCard label="Effective Holdings" value={d.effectiveRiskContributors.toFixed(1)} />
          <StatCard label="Top 5 Weight" value={`${d.top5.toFixed(0)}%`} />
          <StatCard label="Top 10 Weight" value={`${d.top10.toFixed(0)}%`} />
          <StatCard label="Largest Position" value={`${d.largestPos.w.toFixed(1)}%`} hint={d.largestPos.sym} />
          <StatCard label="Largest Risk" value={`${d.largestRisk.pct.toFixed(1)}%`} hint={d.largestRisk.sym} />
        </div>
      </Section>

      <Section title="Diversification History" subtitle="Is diversification improving or deteriorating?"><DivHistory data={d} /></Section>

      <Section title="Stress Diversification Test"><StressTest data={d} /></Section>

      <Section title="Portfolio Manager Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">{insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Correlation/eigenvalue analysis over the holdings&apos; available daily history (~{d.history.dates.length}+ pts). Factor figures are data-driven proxies, not a full factor-risk model.</div>
        </div>
      </Section>
    </div>
  );
}

function buildInsights(d: ReturnType<typeof buildDiversification>): string[] {
  const out: string[] = [];
  out.push(`Although the portfolio contains ${d.nHoldings} holdings, the analysis suggests only ${d.effectiveBets.toFixed(1)} independent bets.`);
  if (d.largestRisk.pct > d.largestPos.w + 2) out.push(`${d.largestRisk.sym} contributes ${d.largestRisk.pct.toFixed(0)}% of risk despite a ${d.largestPos.sym === d.largestRisk.sym ? d.largestPos.w.toFixed(0) : "smaller"}% capital weight.`);
  if (d.clusters[0]) out.push(`The ${d.clusters[0].members.slice(0, 3).join("/")} cluster (internal ρ ${d.clusters[0].internalCorr.toFixed(2)}) contributes ${d.clusters[0].riskContribPct.toFixed(0)}% of total risk — the largest concentration.`);
  out.push(`Average pairwise correlation is ${d.avgCorr.toFixed(2)} (${corrClass(d.avgCorr).t.toLowerCase()} diversification); the top principal component explains ${d.corrConcentration.toFixed(0)}% of variance.`);
  out.push(`${d.factorConcentration.toFixed(0)}% of capital shares the dominant ${d.factors.dominantSector} exposure — factor overlap ${d.factorConcentration > 25 ? "remains elevated despite the number of holdings" : "is moderate"}.`);
  if (d.history.score.length >= 3) {
    const s = d.history.score;
    if (s[s.length - 1] < s[0] - 3) out.push(`Diversification has deteriorated (score ${s[0]} → ${s[s.length - 1]}) over the window.`);
    else if (s[s.length - 1] > s[0] + 3) out.push(`Diversification has improved (score ${s[0]} → ${s[s.length - 1]}) over the window.`);
  }
  if (d.stress.collapsePct > 30) out.push(`Under stress, average correlation rises to ${d.stress.stressCorr.toFixed(2)} and ${d.stress.collapsePct.toFixed(0)}% of the diversification benefit is lost.`);
  return out.slice(0, 10);
}
