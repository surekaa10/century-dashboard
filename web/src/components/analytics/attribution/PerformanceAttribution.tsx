"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import {
  buildContribution, sectorAttribution, contributionConcentration, leadership,
  periodReturn, cumReturnSeries,
} from "@/lib/attribution";
import { fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard, Sparkline } from "../ui";
import {
  PositionAttributionTable, ContributorsDetractors, SectorAttributionSection,
  TimeAttribution, CumulativeDecomposition,
} from "./AttributionViews";

const PERIODS = [
  { key: "daily", label: "Daily", lb: 2 },
  { key: "weekly", label: "Weekly", lb: 6 },
  { key: "monthly", label: "Monthly", lb: 22 },
  { key: "quarterly", label: "Quarterly", lb: 64 },
  { key: "ytd", label: "YTD", lb: 0 },
  { key: "inception", label: "Since Inception", lb: 0 },
] as const;

export default function PerformanceAttribution({ snapshot }: { snapshot: Snapshot }) {
  const data = useMemo(() => buildContribution(snapshot.positions, snapshot.symbolRates), [snapshot.positions, snapshot.symbolRates]);
  const sectors = useMemo(() => sectorAttribution(data.perPosition), [data]);
  const conc = useMemo(() => contributionConcentration(data.perPosition), [data]);
  const lead = useMemo(() => leadership(data.perPosition), [data]);
  const cumSeries = useMemo(() => cumReturnSeries(data), [data]);

  if (!snapshot.positions.length || data.dates.length < 2) {
    return <div className="px-6 py-10 text-center text-slate-500">Not enough price history to compute attribution.</div>;
  }

  const top5Risk = conc.top5 > 70;
  const insights = buildInsights(data, sectors, conc, lead);

  return (
    <div className="px-6 pb-10">
      {/* Performance Summary KPI cards */}
      <Section title="Performance Summary" subtitle="Reconstructed portfolio return by horizon (price-based)">
        <div className="flex flex-wrap gap-3">
          {PERIODS.map((p) => {
            const r = periodReturn(data, p.key);
            const change = r.ret - r.prevRet;
            const spark = p.lb > 0 ? cumSeries.slice(Math.max(0, cumSeries.length - p.lb)) : cumSeries;
            return (
              <div key={p.key} className="flex min-w-[170px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{p.label}</span>
                <span className={`mt-1 font-mono text-xl font-semibold ${pnlClass(r.ret)}`}>{fmtPct(r.ret)}</span>
                <span className={`text-[11px] ${pnlClass(r.contrib)}`}>{fmtSigned(r.contrib, 0)}</span>
                <div className="mt-2 flex items-end justify-between">
                  <span className={`text-[10px] font-mono ${pnlClass(change)}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)} <span className="text-slate-600">vs prev</span>
                  </span>
                  <Sparkline data={spark} color={r.ret >= 0 ? "#10b981" : "#f43f5e"} width={70} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 1. Position Attribution */}
      <Section title="Position Attribution" subtitle="Contribution = weight × return">
        <PositionAttributionTable rows={data.perPosition} />
        <div className="mt-4">
          <ContributorsDetractors rows={data.perPosition} />
        </div>
      </Section>

      {/* 2. Sector Attribution */}
      <Section title="Sector Attribution">
        <SectorAttributionSection sectors={sectors} />
      </Section>

      {/* 3. Time Attribution */}
      <Section title="Time Attribution" subtitle="How performance evolved across horizons">
        <TimeAttribution data={data} />
      </Section>

      {/* 4. Cumulative Decomposition */}
      <Section title="Cumulative Performance Decomposition">
        <CumulativeDecomposition data={data} />
      </Section>

      {/* 5. Contribution Concentration */}
      <Section title="Contribution Concentration" right={top5Risk ? <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">⚠ Top 5 &gt; 70%</span> : undefined}>
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([["Top 1", conc.top1], ["Top 3", conc.top3], ["Top 5", conc.top5], ["Top 10", conc.top10]] as [string, number][]).map(([l, v]) => (
              <div key={l}>
                <div className="flex justify-between text-[11px]"><span className="text-slate-500">{l}</span><span className="font-mono text-slate-300">{v.toFixed(0)}%</span></div>
                <div className="mt-1 h-2 w-full rounded bg-white/[0.04]">
                  <div className="h-2 rounded" style={{ width: `${Math.min(100, v)}%`, background: v > 70 ? "#f43f5e" : v > 50 ? "#fbbf24" : "#10b981" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-sm text-slate-300">
            Top 3 positions generated <span className="font-mono text-slate-100">{conc.top3.toFixed(0)}%</span> of total portfolio gains.
          </div>
        </div>
      </Section>

      {/* 6. Performance Leadership */}
      <Section title="Performance Leadership">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <StatCard label="Winning Positions" value={String(lead.winners)} valueClass="text-emerald-400" />
          <StatCard label="Losing Positions" value={String(lead.losers)} valueClass="text-rose-400" />
          <StatCard label="Win Rate" value={`${lead.winRate.toFixed(0)}%`} />
          <StatCard label="Avg Winner" value={fmtPct(lead.avgWinnerRet)} valueClass="text-emerald-400" />
          <StatCard label="Avg Loser" value={fmtPct(lead.avgLoserRet)} valueClass="text-rose-400" />
          <StatCard label="Profit Factor" value={Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞"} />
          <StatCard label="Best Position" value={lead.best?.symbol ?? "—"} hint={lead.best ? fmtPct(lead.best.returnPct) : ""} valueClass="text-emerald-400" />
          <StatCard label="Worst Position" value={lead.worst?.symbol ?? "—"} hint={lead.worst ? fmtPct(lead.worst.returnPct) : ""} valueClass="text-rose-400" />
        </div>
      </Section>

      {/* 7. AI insights */}
      <Section title="Performance Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">
            {insights.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>
            ))}
          </ul>
          <div className="mt-2 text-[10px] text-slate-600">
            Attribution reconstructs current holdings at historical prices over {data.dates.length} trading days; closed/trimmed positions and realized P&L are not included.
          </div>
        </div>
      </Section>
    </div>
  );
}

function buildInsights(
  data: ReturnType<typeof buildContribution>,
  sectors: ReturnType<typeof sectorAttribution>,
  conc: ReturnType<typeof contributionConcentration>,
  lead: ReturnType<typeof leadership>,
): string[] {
  const out: string[] = [];
  const byUsd = [...data.perPosition].sort((a, b) => b.contribUsd - a.contribUsd);
  const totalGains = conc.totalGains || 1;

  if (byUsd[0] && byUsd[0].contribUsd > 0) {
    const t = byUsd[0];
    out.push(`${t.symbol} contributed ${t.contribPct.toFixed(2)}% and accounted for ${((t.contribUsd / totalGains) * 100).toFixed(0)}% of portfolio gains.`);
  }
  const worst = byUsd[byUsd.length - 1];
  if (worst && worst.contribUsd < 0) {
    out.push(`${worst.symbol} reduced performance by ${Math.abs(worst.contribPct).toFixed(2)}% and was the largest detractor.`);
  }
  out.push(`Top 5 contributors generated ${conc.top5.toFixed(0)}% of total portfolio gains${conc.top5 > 70 ? " — gains are highly concentrated." : "."}`);

  const secSorted = [...sectors].sort((a, b) => b.contribUsd - a.contribUsd);
  if (secSorted[0] && secSorted[0].contribUsd > 0) {
    const s = secSorted[0];
    out.push(`${s.sector} generated ${((s.contribUsd / totalGains) * 100).toFixed(0)}% of gains while representing ${s.weight.toFixed(0)}% of capital.`);
  }
  const secWorst = secSorted[secSorted.length - 1];
  if (secWorst && secWorst.contribUsd < 0) {
    out.push(`${secWorst.sector} was the largest sector detractor, reducing returns by ${Math.abs(secWorst.contribPct).toFixed(2)}%.`);
  }
  out.push(`Win rate ${lead.winRate.toFixed(0)}% (${lead.winners}W / ${lead.losers}L) with a profit factor of ${Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞"}; average winner ${fmtPct(lead.avgWinnerRet)} vs average loser ${fmtPct(lead.avgLoserRet)}.`);

  const incep = (data.portfolioCum[data.portfolioCum.length - 1] / (data.baseValue || 1)) * 100;
  out.push(`Reconstructed portfolio return since inception is ${fmtPct(incep)} on a ${data.baseValue >= 1000 ? "$" + (data.baseValue / 1000).toFixed(0) + "k" : "$" + data.baseValue.toFixed(0)} base.`);

  if (lead.best) out.push(`${lead.best.symbol} is the strongest performer at ${fmtPct(lead.best.returnPct)}; ${lead.worst?.symbol ?? "—"} is the weakest at ${fmtPct(lead.worst?.returnPct ?? 0)}.`);

  return out.slice(0, 10);
}
