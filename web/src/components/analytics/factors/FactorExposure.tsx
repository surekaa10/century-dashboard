"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildFactors } from "@/lib/factors";
import { Section, StatCard } from "../ui";
import {
  ExposureTable, RiskDecomp, ReturnWaterfall, FactorEvolution, StressTable, FactorClusters, ScoreGauge,
} from "./FactorViews";

type RawFactors = Record<string, { dates: string[]; close: number[] }>;

export default function FactorExposure({ snapshot }: { snapshot: Snapshot }) {
  const [raw, setRaw] = useState<RawFactors | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/factors", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) { setRaw(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const d = useMemo(() => (raw ? buildFactors(snapshot.positions, snapshot.symbolRates, raw) : null), [raw, snapshot.positions, snapshot.symbolRates]);

  if (loading) return <div className="px-6 py-10 text-center text-slate-500">Loading factor-proxy data…</div>;
  if (!d || !d.ok) return <div className="px-6 py-10 text-center text-slate-500">Factor data unavailable (could not load factor proxies, or insufficient holding history).</div>;

  const equity = d.rows.filter((r) => r.category === "equity");
  const macro = d.rows.filter((r) => r.category === "macro");

  return (
    <div className="px-6 pb-10">
      <Section title="Factor Exposure Overview" subtitle="What is this portfolio actually betting on?">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Portfolio Beta" value={Number.isFinite(d.marketBeta) ? d.marketBeta.toFixed(2) : "n/a"} valueClass={d.marketBeta > 1.1 ? "text-rose-400" : d.marketBeta < 0.9 ? "text-emerald-400" : "text-slate-100"} />
          <StatCard label="Dominant Factor" value={d.dominantFactor} />
          <StatCard label="Factor Div. Score" value={`${d.diversificationScore.total.toFixed(0)}/100`} hint={d.diversificationScore.label} />
          <StatCard label="Largest Exposure" value={`${d.largestExposure.v >= 0 ? "+" : ""}${d.largestExposure.v.toFixed(2)}`} hint={d.largestExposure.key} />
          <StatCard label="Largest Factor Risk" value={`${d.largestRisk.v.toFixed(0)}%`} hint={d.largestRisk.key} />
          <StatCard label="Significant Factors" value={String(d.nSignificant)} />
          <StatCard label="Factor Concentration" value={`${d.factorConcentration.toFixed(0)}%`} hint={`eff. ${d.factorEffN.toFixed(1)} factors`} />
          <StatCard label="Style" value={d.style.primary} hint={`${d.style.confidence}% conf.`} />
        </div>
      </Section>

      <Section title="Executive Summary" subtitle="Plain-English: what is this portfolio betting on?">
        <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-4 text-sm leading-relaxed text-slate-200">{d.summary}</div>
      </Section>

      <Section title="Portfolio Style Classification">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div><div className="text-[10px] uppercase text-slate-500">Primary</div><div className="font-semibold text-cyan-300">{d.style.primary}</div></div>
          <div><div className="text-[10px] uppercase text-slate-500">Secondary</div><div className="font-semibold text-slate-200">{d.style.secondary}</div></div>
          <div className="flex-1"><div className="text-[10px] uppercase text-slate-500">Classification</div><div className="font-semibold text-slate-100">{d.style.label}</div></div>
          <div><div className="text-[10px] uppercase text-slate-500">Confidence</div><div className="font-mono text-lg text-emerald-400">{d.style.confidence}%</div></div>
        </div>
      </Section>

      <Section title="Equity Factor Exposure" info="factor-exposure"><ExposureTable title="Core Equity Factors (long/short ETF spreads)" rows={equity} /></Section>
      <Section title="Macro Factor Exposure" info="factor-exposure"><ExposureTable title="Macro Factors (ETF/index betas)" rows={macro} /></Section>

      <Section title="Factor Risk Decomposition"><RiskDecomp d={d} /></Section>
      <Section title="Factor Return Attribution"><ReturnWaterfall d={d} /></Section>

      <Section title="Factor Concentration" right={<span className={`rounded border px-2 py-0.5 text-xs ${d.factorConcentration > 50 ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : d.factorConcentration > 30 ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>{d.factorConcentration.toFixed(0)}% in top factor</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Factor HHI" value={d.factorHHI.toFixed(3)} />
          <StatCard label="Effective Factors" value={d.factorEffN.toFixed(1)} />
          <StatCard label="Top Factor Risk" value={`${d.factorConcentration.toFixed(0)}%`} hint={d.largestRisk.key} />
          <StatCard label="Significant Factors" value={String(d.nSignificant)} />
        </div>
        <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3 text-sm text-amber-200/90">
          ⚠ Despite {snapshot.positions.length} holdings, the top 3 factors explain {[...d.rows].sort((a, b) => b.riskContribPct - a.riskContribPct).slice(0, 3).reduce((s, r) => s + r.riskContribPct, 0).toFixed(0)}% of factor risk — the book is concentrated in a small number of factor bets.
        </div>
      </Section>

      <Section title="Factor Overlap"><FactorClusters d={d} /></Section>

      <Section title="Factor Evolution"><FactorEvolution d={d} /></Section>

      <Section title="Factor Stress Testing"><StressTable d={d} /></Section>

      <Section title="Factor Diversification Score"><ScoreGauge total={d.diversificationScore.total} label={d.diversificationScore.label} /></Section>

      <Section title="CIO Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">{d.insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">ETF-proxy factor model: per-holding betas regressed on factor-proxy returns over the available window. Style factors are long/short ETF spreads; this is a transparent proxy, not a commercial multi-factor risk model.</div>
        </div>
      </Section>
    </div>
  );
}
