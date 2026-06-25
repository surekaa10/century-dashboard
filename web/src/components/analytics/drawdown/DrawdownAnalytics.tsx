"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { buildDrawdown } from "@/lib/drawdown";
import { fmtPct } from "@/lib/format";
import { Section, StatCard, Sparkline } from "../ui";
import {
  DrawdownHistory, CurrentDD, MaxDD, WorstTable, Timeline, RecoveryAnalysis,
  Distribution, ByPosition, RollingDD, RecoveryCurve, ResilienceGauge,
} from "./DrawdownViews";

function Kpi({ label, value, series, color, cls = "text-slate-100" }: { label: string; value: string; series: number[]; color: string; cls?: string }) {
  return (
    <div className="flex min-w-[170px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`mt-1 font-mono text-xl font-semibold ${cls}`}>{value}</span>
      <div className="mt-2 flex justify-end"><Sparkline data={series} color={color} width={70} /></div>
    </div>
  );
}

export default function DrawdownAnalytics({ snapshot }: { snapshot: Snapshot }) {
  const d = useMemo(() => buildDrawdown(snapshot.account, snapshot.positions, snapshot.symbolRates), [snapshot.account, snapshot.positions, snapshot.symbolRates]);

  if (!d.ok) return <div className="px-6 py-10 text-center text-slate-500">Insufficient price history to reconstruct the equity curve for drawdown analysis.</div>;

  const uw = d.rolling.map((r) => r.dd);
  const ddColor = (v: number) => (v < -10 ? "text-rose-400" : v < -5 ? "text-amber-400" : "text-emerald-400");

  return (
    <div className="px-6 pb-10">
      <Section title="Drawdown Overview" subtitle="Capital decline from peak — what investors actually feel">
        <div className="flex flex-wrap gap-3">
          <Kpi label="Current Drawdown" value={fmtPct(d.currentDD)} series={uw} color="#f43f5e" cls={ddColor(d.currentDD)} />
          <Kpi label="Maximum Drawdown" value={d.maxDD ? fmtPct(d.maxDD.ddPct) : "—"} series={uw} color="#fb7185" cls="text-rose-400" />
          <Kpi label="Average Drawdown" value={fmtPct(d.avgDD)} series={uw} color="#fb923c" cls="text-amber-400" />
          <Kpi label="Avg Recovery" value={`${d.recovery.avg.toFixed(0)}d`} series={d.recovery.hist.map((h) => h.n)} color="#10b981" />
          <Kpi label="Longest Recovery" value={`${d.recovery.slowest}d`} series={d.recovery.hist.map((h) => h.n)} color="#a78bfa" />
          <Kpi label="Drawdowns >5%" value={String(d.nOver5)} series={[]} color="#fb923c" />
          <Kpi label="Drawdowns >10%" value={String(d.nOver10)} series={[]} color="#f43f5e" cls={d.nOver10 > 0 ? "text-rose-400" : "text-slate-100"} />
          <Kpi label="Recovery Score" value={`${d.recoveryScore}`} series={[]} color="#22d3ee" />
        </div>
      </Section>

      <Section title="Executive Summary">
        <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-4 text-sm leading-relaxed text-slate-200">{d.summary}</div>
      </Section>

      <Section title="Drawdown History"><DrawdownHistory curve={d.curve} /></Section>

      <Section title="Current & Maximum Drawdown">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><CurrentDD d={d} /><MaxDD d={d} /></div>
      </Section>

      <Section title="Top 10 Worst Drawdowns"><WorstTable d={d} /></Section>

      <Section title="Drawdown Timeline"><Timeline d={d} /></Section>

      <Section title="Recovery Analysis"><RecoveryAnalysis d={d} /></Section>

      <Section title="Drawdown Distribution"><Distribution d={d} /></Section>

      <Section title="Drawdown by Position"><ByPosition d={d} /></Section>

      <Section title="Rolling Drawdown Comparison"><RollingDD d={d} /></Section>

      <Section title="Recovery Probability"><RecoveryCurve d={d} /></Section>

      <Section title="Portfolio Resilience Score"><ResilienceGauge d={d} /></Section>

      <Section title="Drawdown Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">{d.insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Equity curve reconstructed as balance + credit + floating P&L of current holdings valued at historical symbol_rates, from inception (~{d.curve.length} trading days). Drawdowns from closed positions aren&apos;t captured.</div>
        </div>
      </Section>
    </div>
  );
}
