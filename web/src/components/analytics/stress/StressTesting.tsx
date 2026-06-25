"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildStress } from "@/lib/stress";
import { fmtCompact, fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard } from "../ui";
import {
  HistoricalTable, ScenarioRanking, ReplayEngine, PositionStress, SectorStressHeatmap,
  CustomBuilder, FactorShock, MonteCarlo, RecoveryTable, VulnerabilityMap, ResilienceGauge,
} from "./StressViews";

type RawFactors = Record<string, { dates: string[]; close: number[] }>;

export default function StressTesting({ snapshot }: { snapshot: Snapshot }) {
  const [raw, setRaw] = useState<RawFactors | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/factors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive) { setRaw(j); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const equity = snapshot.account?.equity ?? 0;
  const d = useMemo(() => (raw ? buildStress(snapshot.positions, snapshot.symbolRates, raw, equity) : null), [raw, snapshot.positions, snapshot.symbolRates, equity]);

  if (loading) return <div className="px-6 py-10 text-center text-slate-500">Loading market factor data for stress testing…</div>;
  if (!d || !d.ok) return <div className="px-6 py-10 text-center text-slate-500">Stress data unavailable (could not load factor proxies, or insufficient holding history).</div>;

  const worst = d.worst;
  return (
    <div className="px-6 pb-10">
      <Section title="Stress Test Overview" subtitle="If markets break tomorrow — where do we get hurt, by how much, and why?">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Worst Scenario" value={worst ? worst.name.replace(/\s\d{4}.*/, "") : "—"} hint={worst ? fmtPct(worst.portRet * 100) : ""} valueClass="text-rose-400" />
          <StatCard label="Expected Loss %" value={worst ? fmtPct(worst.portRet * 100) : "—"} valueClass="text-rose-400" />
          <StatCard label="Expected Loss $" value={worst ? `$${fmtCompact(Math.abs(worst.loss))}` : "—"} valueClass="text-rose-400" />
          <StatCard label="Stress VaR (95%)" info="stress-var" value={fmtPct(d.monteCarlo.var95 * 100)} valueClass="text-amber-400" />
          <StatCard label="Tail Risk Score" info="tail-risk" value={d.tailRiskScore.toFixed(0)} valueClass={d.tailRiskScore > 50 ? "text-rose-400" : "text-emerald-400"} />
          <StatCard label="Resilience Score" value={`${d.resilience.total.toFixed(0)}/100`} hint={d.resilience.label} />
          <StatCard label="Most Vulnerable Sector" value={d.worstSectors[0]?.sector ?? "—"} />
          <StatCard label="Most Vulnerable Position" value={worst?.worstPos ?? "—"} />
        </div>
      </Section>

      <Section title="Executive Summary">
        <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-4 text-sm leading-relaxed text-slate-200">{d.summary}</div>
      </Section>

      <Section title="Historical Scenario Analysis" info="historical-scenarios" subtitle="Predicted impact = portfolio factor betas × each crisis's characteristic shocks">
        <HistoricalTable d={d} />
        <div className="mt-4"><ScenarioRanking d={d} /></div>
      </Section>

      <Section title="Historical Replay Engine"><ReplayEngine d={d} /></Section>

      <Section title="Position-Level Stress Test"><PositionStress d={d} /></Section>

      <Section title="Sector Stress Analysis"><SectorStressHeatmap d={d} /></Section>

      <Section title="Custom Scenario Builder" subtitle="Combine simultaneous market & macro shocks"><CustomBuilder model={d.model} /></Section>

      <Section title="Factor Shock Analysis" subtitle="Shock underlying factors rather than prices"><FactorShock model={d.model} /></Section>

      <Section title="Monte-Carlo Stress Simulation"><MonteCarlo d={d} /></Section>

      <Section title="Recovery Analysis"><RecoveryTable d={d} /></Section>

      <Section title="Portfolio Resilience Score"><ResilienceGauge total={d.resilience.total} label={d.resilience.label} /></Section>

      <Section title="Vulnerability Map"><VulnerabilityMap d={d} /></Section>

      <Section title="AI Risk Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">{d.insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Historical/crisis impacts are FACTOR-BASED PREDICTED estimates (holdings postdate these events): portfolio factor betas × characteristic shock vectors. Worst day/week are from the portfolio&apos;s own observed history. Not an actual price replay.</div>
        </div>
      </Section>
    </div>
  );
}
