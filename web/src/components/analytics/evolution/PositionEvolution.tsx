"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildEvolution, analyzePeriod, startIndexFor, PERIOD_DAYS } from "@/lib/evolution";
import { fmtCompact, fmtSigned, pnlClass } from "@/lib/format";
import { Section, StatCard } from "../ui";
import {
  ChangeLogTable, WeightHistory, ConvictionTables, NewExits, CapitalFlow,
  SectorRotation, ConcentrationEvolution, LifecycleTable,
} from "./EvolutionViews";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "Inception"];

export default function PositionEvolution({ snapshot }: { snapshot: Snapshot }) {
  const [period, setPeriod] = useState("1M");
  const data = useMemo(() => buildEvolution(snapshot.deals, snapshot.positions, snapshot.symbolRates), [snapshot.deals, snapshot.positions, snapshot.symbolRates]);
  const analysis = useMemo(() => analyzePeriod(data, period), [data, period]);
  const startIdx = useMemo(() => startIndexFor(data, period), [data, period]);
  const windowStates = useMemo(() => data.states.slice(startIdx), [data, startIdx]);

  if (!data.states.length) {
    return <div className="px-6 py-10 text-center text-slate-500">No deal history available to reconstruct position evolution.</div>;
  }

  const k = analysis.kpis;
  const days = PERIOD_DAYS[period] ?? 99999;
  const winDays = Math.min(days, data.dates.length);
  const turnoverAnnual = k.turnover * (252 / Math.max(1, winDays));
  const turnoverClass = turnoverAnnual < 30 ? "Low Turnover" : turnoverAnnual < 100 ? "Moderate Turnover" : "High Turnover";

  const insights = buildInsights(analysis, data, period);

  return (
    <div className="px-6 pb-10">
      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] text-slate-500">Reconstructed from the deal ledger · comparison window: {analysis.startDate} → {analysis.endDate}</p>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`rounded px-2 py-1 text-xs ${p === period ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>{p}</button>
          ))}
        </div>
      </div>

      <Section title="Position Evolution Overview" subtitle={`Changes vs ${period === "Inception" ? "inception" : period} ago`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <StatCard label="New Positions" value={String(k.newAdded)} valueClass="text-emerald-400" />
          <StatCard label="Fully Exited" value={String(k.exited)} valueClass="text-rose-400" />
          <StatCard label="Largest ↑ Weight" value={k.largestIncrease ? `+${k.largestIncrease.change.toFixed(1)}%` : "—"} hint={k.largestIncrease?.symbol} valueClass="text-emerald-400" />
          <StatCard label="Largest ↓ Weight" value={k.largestDecrease ? `${k.largestDecrease.change.toFixed(1)}%` : "—"} hint={k.largestDecrease?.symbol} valueClass="text-rose-400" />
          <StatCard label="Capital Added" value={`$${fmtCompact(k.netAdded)}`} valueClass="text-emerald-400" />
          <StatCard label="Capital Removed" value={`$${fmtCompact(k.netRemoved)}`} valueClass="text-rose-400" />
          <StatCard label="Turnover (ann.)" value={`${turnoverAnnual.toFixed(0)}%`} hint={turnoverClass} />
          <StatCard label="Active Changes" value={String(k.activeChanges)} />
        </div>
      </Section>

      <Section title="Portfolio Change Log"><ChangeLogTable rows={analysis.changeLog} /></Section>

      <Section title="Holding Evolution"><WeightHistory states={windowStates} /></Section>

      <Section title="Conviction Analysis"><ConvictionTables up={analysis.convictionUp} down={analysis.convictionDown} /></Section>

      <Section title="New Positions & Exits"><NewExits analysis={analysis} /></Section>

      <Section title="Capital Flow Analysis">
        <CapitalFlow bySector={analysis.capitalBySector} />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FlowList title="Top Capital Inflows" rows={analysis.capitalBySymbol.filter((r) => r.net > 0).slice(0, 8)} positive />
          <FlowList title="Top Capital Outflows" rows={[...analysis.capitalBySymbol].filter((r) => r.net < 0).sort((a, b) => a.net - b.net).slice(0, 8)} positive={false} />
        </div>
      </Section>

      <Section title="Turnover Analysis">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Period Turnover" value={`${k.turnover.toFixed(1)}%`} />
          <StatCard label="Annualized" value={`${turnoverAnnual.toFixed(0)}%`} valueClass={turnoverAnnual > 100 ? "text-rose-400" : turnoverAnnual > 30 ? "text-amber-400" : "text-emerald-400"} />
          <StatCard label="Capital Deployed" value={`$${fmtCompact(k.netAdded)}`} />
          <StatCard label="Classification" value={turnoverClass} />
        </div>
      </Section>

      <Section title="Sector Rotation"><SectorRotation states={windowStates} /></Section>

      <Section title="Concentration Evolution"><ConcentrationEvolution states={windowStates} /></Section>

      <Section title="Position Lifecycle"><LifecycleTable data={data} /></Section>

      <Section title="Portfolio Manager Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">
            {insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}
          </ul>
          <div className="mt-2 text-[10px] text-slate-600">
            Reconstructed by replaying the MT5 deal ledger (authoritative for adds/trims/exits); daily valuation uses symbol_rates. This account is young, so exit/turnover panels populate as trades close.
          </div>
        </div>
      </Section>
    </div>
  );
}

function FlowList({ title, rows, positive }: { title: string; rows: { key: string; net: number }[]; positive: boolean }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.net)), 1);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className={`mb-2 text-sm font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>{title}</div>
      {rows.length ? rows.map((r) => (
        <div key={r.key} className="mb-1.5 grid grid-cols-[80px_1fr_auto] items-center gap-2 font-mono text-xs">
          <span className="font-sans text-slate-200">{r.key}</span>
          <div className="h-2 rounded bg-white/[0.03]"><div className="h-2 rounded" style={{ width: `${(Math.abs(r.net) / max) * 100}%`, background: positive ? "#10b981" : "#f43f5e" }} /></div>
          <span className={`text-right ${pnlClass(r.net)}`}>{fmtSigned(r.net, 0)}</span>
        </div>
      )) : <div className="py-4 text-center text-sm text-slate-500">None this period</div>}
    </div>
  );
}

function buildInsights(a: ReturnType<typeof analyzePeriod>, data: ReturnType<typeof buildEvolution>, period: string): string[] {
  const out: string[] = [];
  const label = period === "Inception" ? "since inception" : `over the last ${period}`;

  if (a.kpis.largestIncrease) {
    const c = a.kpis.largestIncrease;
    out.push(`${c.symbol} has the largest conviction increase, rising from ${c.prevWeight.toFixed(1)}% to ${c.currWeight.toFixed(1)}% ${label}.`);
  }
  out.push(`The portfolio initiated ${a.kpis.newAdded} new position${a.kpis.newAdded === 1 ? "" : "s"} and exited ${a.kpis.exited} ${label}.`);

  const topSec = a.capitalBySector[0];
  const totalAdded = a.capitalBySector.reduce((s, x) => s + Math.max(0, x.net), 0) || 1;
  if (topSec && topSec.net > 0) out.push(`${topSec.key} accounts for ${((topSec.net / totalAdded) * 100).toFixed(0)}% of capital added ${label}.`);
  const outflow = [...a.capitalBySector].sort((x, y) => x.net - y.net)[0];
  if (outflow && outflow.net < 0) out.push(`${outflow.key} experienced the largest capital outflow ${label} ($${fmtCompact(Math.abs(outflow.net))}).`);

  // concentration trend over window
  const sStates = data.states.slice(startIndexFor(data, period));
  if (sStates.length >= 2) {
    const a0 = sStates[0], a1 = sStates[sStates.length - 1];
    if (a1.top5 - a0.top5 > 2) out.push(`Top 5 holdings grew from ${a0.top5.toFixed(0)}% to ${a1.top5.toFixed(0)}% of portfolio — concentration increased.`);
    else if (a0.top5 - a1.top5 > 2) out.push(`Top 5 holdings fell from ${a0.top5.toFixed(0)}% to ${a1.top5.toFixed(0)}% — the book broadened.`);
    if (a0.effN - a1.effN > 0.5) out.push(`Effective holdings fell from ${a0.effN.toFixed(1)} to ${a1.effN.toFixed(1)}, indicating rising concentration.`);
  }
  if (a.kpis.turnover < 0.01) out.push(`No positions were trimmed or sold ${label} — the book is in pure accumulation.`);

  return out.slice(0, 10);
}
