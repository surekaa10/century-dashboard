"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { buildRisk, type RiskData } from "@/lib/risk";
import { fmtMoney, fmtCompact, pnlClass } from "@/lib/format";
import { Section, Sparkline } from "../ui";
import {
  RiskPositionTable, TopRiskContributors, RiskTreemap, RiskVsWeight,
  SectorRiskSection, RollingRisk, MarginalVarTable,
} from "./RiskViews";

function deltas(s: number[]) {
  const n = s.length;
  if (n < 2) return { d: 0, w: 0, m: 0, has: false };
  return { d: s[n - 1] - s[n - 2], w: s[n - 1] - s[Math.max(0, n - 6)], m: s[n - 1] - s[Math.max(0, n - 22)], has: true };
}

function RiskKpi({
  label, value, series, color, dlt, kind, invert = false,
}: {
  label: string; value: string; series: number[]; color: string;
  dlt?: { d: number; w: number; m: number; has: boolean }; kind?: "$" | "pts" | "x"; invert?: boolean;
}) {
  const fmt = (v: number) =>
    kind === "$" ? `${v >= 0 ? "+" : "−"}$${fmtCompact(Math.abs(v))}` : kind === "x" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}x` : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  const cls = (v: number) => pnlClass(invert ? -v : v);
  return (
    <div className="flex min-w-[180px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 font-mono text-xl font-semibold text-slate-100">{value}</span>
      <div className="mt-2 flex items-end justify-between">
        {dlt?.has ? (
          <div className="flex flex-col gap-0.5 text-[10px] font-mono">
            <span className={cls(dlt.d)}>{fmt(dlt.d)} <span className="text-slate-600">1d</span></span>
            <span className={cls(dlt.m)}>{fmt(dlt.m)} <span className="text-slate-600">≈1mo</span></span>
          </div>
        ) : <span />}
        <Sparkline data={series} color={color} width={70} />
      </div>
    </div>
  );
}

export default function RiskAttribution({ snapshot }: { snapshot: Snapshot }) {
  const r = useMemo(() => buildRisk(snapshot.positions, snapshot.symbolRates), [snapshot.positions, snapshot.symbolRates]);

  if (!snapshot.positions.length || r.rows.length === 0) {
    return <div className="px-6 py-10 text-center text-slate-500">Not enough price history to compute risk attribution.</div>;
  }

  const h = r.history;
  const dVol = deltas(h.volPct);
  const dVar = deltas(h.var95);
  const dDiv = deltas(h.divRatio);
  const dEff = deltas(h.effN);
  const var99Series = h.var95.map((v) => v * (2.326 / 1.645));
  const esSeries = h.var95.map((v) => v * (2.0626 / 1.645));

  const divCat =
    r.diversificationRatio >= 1.6 ? { t: "Excellent", c: "text-emerald-400", b: "border-emerald-500/30 bg-emerald-500/10" }
    : r.diversificationRatio >= 1.3 ? { t: "Good", c: "text-emerald-400", b: "border-emerald-500/30 bg-emerald-500/10" }
    : r.diversificationRatio >= 1.1 ? { t: "Moderate", c: "text-amber-400", b: "border-amber-500/30 bg-amber-500/10" }
    : { t: "Poor", c: "text-rose-400", b: "border-rose-500/30 bg-rose-500/10" };

  const warnings = buildWarnings(r);
  const insights = buildInsights(r);

  return (
    <div className="px-6 pb-10">
      <Section title="Risk Attribution Overview" subtitle="What is generating portfolio risk — risk allocation, not capital allocation">
        <div className="flex flex-wrap gap-3">
          <RiskKpi label="Portfolio Volatility" value={`${r.portfolioVolPct.toFixed(1)}%`} series={h.volPct} color="#fb923c" dlt={dVol} kind="pts" invert />
          <RiskKpi label="Daily VaR 95%" value={`$${fmtCompact(r.var95)}`} series={h.var95} color="#f43f5e" dlt={dVar} kind="$" invert />
          <RiskKpi label="Daily VaR 99%" value={`$${fmtCompact(r.var99)}`} series={var99Series} color="#f43f5e" dlt={{ ...dVar, d: dVar.d * 1.414, m: dVar.m * 1.414, w: dVar.w }} kind="$" invert />
          <RiskKpi label="Expected Shortfall" value={`$${fmtCompact(r.es95)}`} series={esSeries} color="#fb7185" kind="$" />
          <RiskKpi label="Diversification Ratio" value={r.diversificationRatio.toFixed(2)} series={h.divRatio} color="#10b981" dlt={dDiv} kind="x" />
          <RiskKpi label="Eff. # Risk Contributors" value={r.effectiveRiskContributors.toFixed(1)} series={h.effN} color="#38bdf8" dlt={dEff} kind="pts" />
          <RiskKpi label="Largest Risk Contributor" value={`${r.largestRiskContribPct.toFixed(1)}%`} series={[]} color="#f43f5e" />
          <RiskKpi label="Risk Concentration (HHI)" value={r.riskConcentrationIndex.toFixed(3)} series={[]} color="#fbbf24" />
        </div>
      </Section>

      <Section title="Position Risk Contribution" info="risk-contribution" subtitle="Risk contribution can diverge sharply from capital weight">
        <RiskPositionTable rows={r.rows} />
        <div className="mt-4"><TopRiskContributors rows={r.rows} /></div>
      </Section>

      <Section title="Risk Contribution Treemap">
        <RiskTreemap rows={r.rows} />
      </Section>

      <Section title="Risk Contribution vs Weight">
        <RiskVsWeight rows={r.rows} />
      </Section>

      <Section title="Sector Risk Attribution">
        <SectorRiskSection sectors={r.sectors} />
      </Section>

      <Section title="Diversification Analysis" right={<span className={`rounded border px-2 py-0.5 text-xs ${divCat.b} ${divCat.c}`}>{divCat.t}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["Diversification Ratio", r.diversificationRatio.toFixed(2)], ["Avg Pairwise Corr", r.avgPairwiseCorr.toFixed(2)], ["Eff. # Risk Contributors", r.effectiveRiskContributors.toFixed(1)], ["Risk Concentration Index", r.riskConcentrationIndex.toFixed(3)]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-100">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Risk Contribution History" subtitle="How portfolio risk leadership has evolved">
        <RollingRisk history={r.history} />
      </Section>

      <Section title="Marginal VaR Analysis" info="marginal-var" subtitle="Impact of changing position size on portfolio VaR">
        <MarginalVarTable rows={r.rows} />
      </Section>

      <Section title="Risk Warning Engine">
        <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-4">
          {warnings.length ? (
            <ul className="space-y-1.5">
              {warnings.map((w, i) => <li key={i} className="flex gap-2 text-sm text-amber-200/90"><span className="text-amber-400">⚠</span><span>{w}</span></li>)}
            </ul>
          ) : <div className="text-sm text-slate-400">No elevated risk concentrations detected.</div>}
        </div>
      </Section>

      <Section title="Risk Insights">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">
            {insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}
          </ul>
          <div className="mt-2 text-[10px] text-slate-600">
            Parametric (variance–covariance) risk over {r.history.dates.length + 1 || 0}+ trading days from holdings&apos; return history. VaR/ES assume normality; longer-horizon and closed-position risk are not captured.
          </div>
        </div>
      </Section>
    </div>
  );
}

function buildWarnings(r: RiskData): string[] {
  const out: string[] = [];
  const byRisk = [...r.rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
  const top3 = byRisk.slice(0, 3).reduce((s, x) => s + x.riskContribPct, 0);
  if (top3 > 40) out.push(`Three positions contribute ${top3.toFixed(0)}% of total portfolio risk.`);
  if (r.largestRiskContribPct > 20) out.push(`${byRisk[0].symbol} alone contributes ${r.largestRiskContribPct.toFixed(0)}% of portfolio risk.`);
  const topSec = r.sectors[0];
  if (topSec && topSec.riskContribPct > 40) out.push(`${topSec.sector} contributes ${topSec.riskContribPct.toFixed(0)}% of total portfolio VaR.`);
  if (r.avgPairwiseCorr > 0.5) out.push(`Holdings are highly correlated (avg ρ = ${r.avgPairwiseCorr.toFixed(2)}) — diversification benefit is limited.`);
  if (r.history.divRatio.length >= 3) {
    const dv = r.history.divRatio;
    const chg = ((dv[dv.length - 1] - dv[0]) / (dv[0] || 1)) * 100;
    if (chg < -8) out.push(`Portfolio diversification has deteriorated by ${Math.abs(chg).toFixed(0)}% over the available window.`);
  }
  if (r.history.var95.length >= 4) {
    const v = r.history.var95;
    const now = v[v.length - 1];
    const pct = Math.round((v.filter((x) => x <= now).length / v.length) * 100);
    if (pct >= 80) out.push(`Current portfolio VaR is in the ${pct}th percentile of the available window.`);
  }
  return out;
}

function buildInsights(r: RiskData): string[] {
  const out: string[] = [];
  const hidden = r.rows.filter((x) => x.riskContribPct > x.weight + 1).sort((a, b) => (b.riskContribPct - b.weight) - (a.riskContribPct - a.weight));
  if (hidden[0]) out.push(`Although ${hidden[0].symbol} represents only ${hidden[0].weight.toFixed(1)}% of capital, it contributes ${hidden[0].riskContribPct.toFixed(1)}% of portfolio risk.`);
  const top5 = [...r.rows].sort((a, b) => b.riskContribPct - a.riskContribPct).slice(0, 5).reduce((s, x) => s + x.riskContribPct, 0);
  out.push(`Top 5 positions account for ${top5.toFixed(0)}% of total portfolio risk.`);
  const top5w = [...r.rows].sort((a, b) => b.weight - a.weight).slice(0, 5).reduce((s, x) => s + x.weight, 0);
  if (top5 > top5w + 5) out.push(`Risk is more concentrated than capital allocation (top-5 risk ${top5.toFixed(0)}% vs weight ${top5w.toFixed(0)}%).`);
  const topSec = r.sectors[0];
  if (topSec) out.push(`${topSec.sector} exposure is responsible for ${topSec.riskContribPct.toFixed(0)}% of total portfolio volatility while holding ${topSec.weight.toFixed(0)}% of capital.`);
  out.push(`Effective number of risk contributors is ${r.effectiveRiskContributors.toFixed(1)} across ${r.rows.length} positions; diversification ratio ${r.diversificationRatio.toFixed(2)}.`);
  if (r.history.effN.length >= 3) {
    const e = r.history.effN;
    if (e[e.length - 1] < e[0] - 0.5) out.push(`The effective number of risk contributors has declined from ${e[0].toFixed(1)} to ${e[e.length - 1].toFixed(1)} over the window.`);
  }
  if (r.avgPairwiseCorr > 0.4) out.push(`Risk is concentrated in correlated holdings (average pairwise correlation ${r.avgPairwiseCorr.toFixed(2)}).`);
  return out.slice(0, 10);
}
