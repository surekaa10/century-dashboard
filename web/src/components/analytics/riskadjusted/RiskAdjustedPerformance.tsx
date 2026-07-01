"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Legend,
} from "recharts";
import type { Snapshot } from "@/lib/types";
import { buildRiskAdjusted, type Benchmark } from "@/lib/riskadjusted";
import { Section } from "../ui";
import { InfoIcon } from "@/components/common/InfoIcon";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;

const BENCHMARKS: [string, string][] = [["SPY", "S&P 500"], ["QQQ", "Nasdaq 100"], ["URTH", "MSCI World"]];
const RF_CHOICES = [0, 2, 4, 5];

function fmtVal(v: number, unit: "ratio" | "pct" | "beta"): string {
  if (!Number.isFinite(v)) return "—";
  if (unit === "pct") return `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`;
  return v.toFixed(2);
}

function KpiCard({ label, glossary, value, prev, hasPrev, unit, higherBetter }: {
  label: string; glossary: string; value: number; prev: number; hasPrev: boolean; unit: "ratio" | "pct" | "beta"; higherBetter: boolean;
}) {
  const delta = value - prev;
  const good = higherBetter ? delta > 0 : delta < 0;
  const flat = !hasPrev || Math.abs(delta) < 1e-6;
  const color = flat ? "text-slate-500" : good ? "text-emerald-400" : "text-rose-400";
  const arrow = flat ? "→" : delta > 0 ? "▲" : "▼";
  return (
    <div className="flex min-w-[168px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}<InfoIcon metric={glossary} label={label} size={11} />
      </span>
      <span className="mt-1 font-mono text-xl font-semibold text-slate-100">{fmtVal(value, unit)}</span>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px]">
        {hasPrev ? (
          <>
            <span className={color}>{arrow} {fmtVal(Math.abs(delta), unit)}</span>
            <span className="text-slate-600">prev {fmtVal(prev, unit)}</span>
          </>
        ) : <span className="text-slate-600">no prior-month data</span>}
      </div>
    </div>
  );
}

function Gauge({ score, label }: { score: number; label: string }) {
  const r = 78, cx = 95, cy = 92, f = Math.max(0, Math.min(1, score / 100));
  const pt = (frac: number) => { const a = Math.PI * (1 - frac); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const [sx, sy] = pt(0), [ex, ey] = pt(f), [tx, ty] = pt(1);
  const col = score >= 85 ? "#10b981" : score >= 70 ? "#34d399" : score >= 55 ? "#fbbf24" : "#f43f5e";
  return (
    <svg width={190} height={112} className="shrink-0">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${tx} ${ty}`} fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${ex} ${ey}`} fill="none" stroke={col} strokeWidth={12} strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" className="font-mono" fontSize={30} fontWeight={700} fill="#f1f5f9">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill="#94a3b8">/ 100</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={13} fontWeight={600} fill={col}>{label}</text>
    </svg>
  );
}

export default function RiskAdjustedPerformance({ snapshot }: { snapshot: Snapshot }) {
  const [benchKey, setBenchKey] = useState("SPY");
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>();
  const [rfPct, setRfPct] = useState(4);

  useEffect(() => {
    let alive = true;
    setBenchmark(undefined);
    fetch(`/api/benchmark?symbol=${benchKey}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => { if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close, name: b.name }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [benchKey]);

  const d = useMemo(
    () => buildRiskAdjusted(snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark, { rfAnnual: rfPct / 100 }),
    [snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark, rfPct],
  );

  if (!d.ok) {
    return <div className="px-6 py-10 text-center text-slate-500">Not enough price history to compute risk-adjusted performance.</div>;
  }

  const meanBin = nearest(d.dist.bins.map((b) => b.x), d.dist.mean * 100);
  const varBin = nearest(d.dist.bins.map((b) => b.x), d.dist.var95 * 100);
  const rollData = d.rolling.dates.map((date, i) => ({ date, Sharpe: d.rolling.sharpe[i], Sortino: d.rolling.sortino[i], Beta: d.rolling.beta[i] }));

  const cmp = [
    { m: "Annualized Return", p: d.annReturn * 100, b: d.bench.annReturn * 100, unit: "%", better: "high" as const },
    { m: "Annualized Volatility", p: d.annVol * 100, b: d.bench.annVol * 100, unit: "%", better: "low" as const },
    { m: "Sharpe Ratio", p: d.sharpe, b: d.bench.sharpe, unit: "", better: "high" as const },
    { m: "Sortino Ratio", p: d.sortino, b: d.bench.sortino, unit: "", better: "high" as const },
    { m: "Jensen's Alpha", p: d.jensenAlphaAnnual * 100, b: 0, unit: "%", better: "high" as const },
    { m: "Beta", p: d.beta, b: 1, unit: "", better: "na" as const },
    { m: "Tracking Error", p: d.trackingError * 100, b: 0, unit: "%", better: "na" as const },
    { m: "Max Drawdown", p: d.portMaxDD, b: d.bench.maxDD, unit: "%", better: "high" as const },
  ];

  return (
    <div className="px-6 pb-10">
      {/* Executive header + controls */}
      <Section title="Risk-Adjusted Performance" info="risk-efficiency-score"
        subtitle="Is the portfolio being adequately compensated for the risk it is taking?"
        right={
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-500">Benchmark</span>
            <select value={benchKey} onChange={(e) => setBenchKey(e.target.value)}
              className="rounded border border-cyan-500/20 bg-black/30 px-2 py-1 text-slate-200 focus:outline-none">
              {BENCHMARKS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <span className="ml-2 text-slate-500">Risk-free</span>
            <select value={rfPct} onChange={(e) => setRfPct(Number(e.target.value))}
              className="rounded border border-cyan-500/20 bg-black/30 px-2 py-1 text-slate-200 focus:outline-none">
              {RF_CHOICES.map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
        }>
        <div className="flex flex-col gap-4 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Gauge score={d.score} label={d.scoreLabel} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Portfolio Risk Efficiency</div>
              <div className="text-sm font-semibold text-slate-200">Rating: <span className={d.score >= 70 ? "text-emerald-400" : d.score >= 55 ? "text-amber-400" : "text-rose-400"}>{d.scoreLabel}</span></div>
              <div className="mt-1 font-mono text-[11px] text-slate-500">vs {d.benchName} · rf {(d.rfAnnual * 100).toFixed(0)}% · {d.nObs} trading days</div>
            </div>
          </div>
          <p className="flex-1 text-[12.5px] leading-relaxed text-slate-300">{d.summary}</p>
        </div>
      </Section>

      {/* KPI grid */}
      <Section title="Key Metrics" subtitle="Current value, prior-month comparison and trend (green = improving)">
        <div className="flex flex-wrap gap-3">
          {d.kpis.map((k) => <KpiCard key={k.id} {...k} />)}
        </div>
      </Section>

      {/* Score breakdown */}
      <Section title="Risk-Efficiency Score Breakdown" info="risk-efficiency-score" subtitle="How each dimension contributes to the 0–100 score">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="space-y-2.5">
            {d.scoreComponents.map((c) => (
              <div key={c.label} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                <span className="text-xs text-slate-300">{c.label} <span className="text-slate-600">({(c.weight * 100).toFixed(0)}%)</span></span>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.04]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, c.score))}%`, background: c.score >= 70 ? "#10b981" : c.score >= 45 ? "#fbbf24" : "#f43f5e" }} />
                </div>
                <span className="w-9 text-right font-mono text-xs text-slate-300">{c.score.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Rolling Sharpe / Sortino */}
      <Section title="Rolling Risk-Adjusted Ratios" info="sharpe" subtitle={`Sharpe & Sortino over a ${d.rolling.window}-day rolling window`}>
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={TT} />
                <ReferenceLine y={0} stroke="#334155" />
                <ReferenceLine y={1} stroke="#334155" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Sharpe" stroke="#38bdf8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Sortino" stroke="#10b981" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* Rolling beta */}
      <Section title="Rolling Portfolio Beta" info="portfolio-beta" subtitle={`Sensitivity to ${d.benchName} over a ${d.rolling.window}-day window (1.0 = moves with the market)`}>
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollData} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={TT} />
                <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Market (1.0)", fill: "#f59e0b", fontSize: 9, position: "insideTopRight" }} />
                <Line type="monotone" dataKey="Beta" stroke="#a78bfa" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* Return distribution */}
      <Section title="Return Distribution" info="var" subtitle="Daily portfolio returns — the red tail is the worst 5% (VaR / CVaR region)">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-3 flex flex-wrap gap-4 font-mono text-[11px]">
            <span className="text-slate-400">Mean <span className="text-slate-200">{(d.dist.mean * 100).toFixed(2)}%</span></span>
            <span className="text-slate-400">Median <span className="text-slate-200">{(d.dist.median * 100).toFixed(2)}%</span></span>
            <span className="text-slate-400">Std Dev <span className="text-slate-200">{(d.dist.std * 100).toFixed(2)}%</span></span>
            <span className="text-slate-400">95% VaR <span className="text-rose-400">{(d.dist.var95 * 100).toFixed(2)}%</span></span>
            <span className="text-slate-400">CVaR <span className="text-rose-400">{(d.dist.cvar95 * 100).toFixed(2)}%</span></span>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.dist.bins} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="x" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} minTickGap={24} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={TT} formatter={(v) => [`${v} days`, "Count"]} labelFormatter={(l) => `${Number(l).toFixed(2)}% return`} />
                <ReferenceLine x={meanBin} stroke="#38bdf8" strokeDasharray="4 4" label={{ value: "Mean", fill: "#38bdf8", fontSize: 9, position: "top" }} />
                <ReferenceLine x={varBin} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: "95% VaR", fill: "#f43f5e", fontSize: 9, position: "top" }} />
                <Bar dataKey="n" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {d.dist.bins.map((b, i) => <Cell key={i} fill={b.tail ? "#f43f5e" : "#38bdf8"} fillOpacity={b.tail ? 0.85 : 0.55} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* Probability insights */}
      <Section title="Probability Insights" subtitle="Intuitive odds from the historical daily-return record">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ProbCard label="Positive Day" value={`${(d.prob.pPos * 100).toFixed(0)}%`} tone="good" />
          <ProbCard label="Negative Day" value={`${(d.prob.pNeg * 100).toFixed(0)}%`} tone="bad" />
          <ProbCard label="Loss Beyond 95% VaR" value={`${(d.prob.pBeyondVar * 100).toFixed(1)}%`} tone="warn" />
          <ProbCard label="Worst 5% Days (avg)" value={`${(d.prob.worst5Avg * 100).toFixed(1)}%`} tone="bad" />
          <ProbCard label="Best 5% Days (avg)" value={`+${(d.prob.best5Avg * 100).toFixed(1)}%`} tone="good" />
        </div>
      </Section>

      {/* Risk vs Return scatter */}
      <Section title="Risk vs Return" subtitle="Higher and to the left is more efficient. Bubble colour = Sharpe ratio.">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 8, right: 16, top: 12, bottom: 16 }}>
                <XAxis type="number" dataKey="vol" name="Volatility" unit="%" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false}
                  label={{ value: "Annualized Volatility (%)", fill: "#64748b", fontSize: 10, position: "insideBottom", offset: -6 }} />
                <YAxis type="number" dataKey="ret" name="Return" unit="%" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={44}
                  label={{ value: "Annualized Return (%)", fill: "#64748b", fontSize: 10, angle: -90, position: "insideLeft" }} />
                <ZAxis type="number" range={[220, 220]} />
                <Tooltip contentStyle={TT} cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v, n) => [`${Number(v).toFixed(1)}${n === "Volatility" || n === "Return" ? "%" : ""}`, n]} />
                {d.scatter.map((s) => (
                  <Scatter key={s.name} name={s.name} data={[s]} fill={s.kind === "portfolio" ? "#38bdf8" : s.kind === "benchmark" ? "#f59e0b" : "#a78bfa"} />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      {/* Benchmark comparison */}
      <Section title="Benchmark Comparison" subtitle={`Portfolio vs ${d.benchName} — the stronger figure is highlighted`}>
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cyan-500/10 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5 text-left">Metric</th>
                <th className="px-4 py-2.5 text-right">Portfolio</th>
                <th className="px-4 py-2.5 text-right">{d.benchName}</th>
                <th className="px-4 py-2.5 text-left">Winner</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {cmp.map((row) => {
                const pWins = row.better === "high" ? row.p > row.b : row.better === "low" ? row.p < row.b : null;
                const fmt = (v: number) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(2)}${row.unit}`;
                return (
                  <tr key={row.m} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2 text-left font-sans text-slate-300">{row.m}</td>
                    <td className={`px-4 py-2 text-right ${pWins === true ? "font-semibold text-emerald-400" : "text-slate-200"}`}>{fmt(row.p)}</td>
                    <td className={`px-4 py-2 text-right ${pWins === false ? "font-semibold text-emerald-400" : "text-slate-200"}`}>{fmt(row.b)}</td>
                    <td className="px-4 py-2 text-left text-[11px]">{pWins === null ? <span className="text-slate-600">—</span> : <span className={pWins ? "text-emerald-400" : "text-amber-400"}>{pWins ? "Portfolio" : d.benchName}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* AI insights */}
      <Section title="Executive Insights" subtitle="Observations — each supported by a calculated metric">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">
            {d.insights.map((t, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
      </Section>

      <div className="mt-4 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 text-[11px] leading-relaxed text-slate-400">
        <span className="font-semibold text-amber-400/90">Methodology:</span> portfolio daily returns are reconstructed from current signed weights × each holding&apos;s MT5 daily return; benchmark ({d.benchName}) and beta/alpha use Yahoo daily closes. Ratios assume a {(d.rfAnnual * 100).toFixed(0)}% risk-free rate and 0% minimum-acceptable-return for downside deviation. The account&apos;s track record is short ({d.nObs} trading days), so annualized figures are indicative and prior-month comparisons use a ~21-trading-day lag.
      </div>
    </div>
  );
}

function ProbCard({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "warn" }) {
  const c = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-amber-400";
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${c}`}>{value}</div>
    </div>
  );
}

function nearest(arr: number[], target: number): number {
  if (!arr.length) return 0;
  return arr.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), arr[0]);
}
