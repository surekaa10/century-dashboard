"use client";

import { Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoreCard, Pillar } from "@/lib/scorecard";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;

function scoreColor(pct: number): string { return pct >= 90 ? "#059669" : pct >= 80 ? "#10b981" : pct >= 70 ? "#84cc16" : pct >= 60 ? "#fbbf24" : pct >= 50 ? "#fb923c" : "#f43f5e"; }

export function HealthGauge({ d }: { d: ScoreCard }) {
  const v = Math.max(0, Math.min(100, d.total));
  const angle = -90 + (v / 100) * 180;
  const color = scoreColor(v);
  const rad = (angle * Math.PI) / 180; const nx = 130 + 105 * Math.cos(rad), ny = 130 + 105 * Math.sin(rad);
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.03] to-transparent p-6 sm:flex-row sm:gap-8">
      <svg width="260" height="160" viewBox="0 0 260 160">
        <path d="M25,130 A105,105 0 0,1 235,130" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" strokeLinecap="round" />
        <path d={`M25,130 A105,105 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />
        <text x="130" y="118" textAnchor="middle" fontSize="52" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}</text>
        <text x="130" y="142" textAnchor="middle" fontSize="12" fill="#64748b">Portfolio Health · / 100</text>
      </svg>
      <div className="flex-1 text-center sm:text-left">
        <div className="text-lg" style={{ color }}>{"★".repeat(d.rating)}<span className="text-slate-700">{"★".repeat(5 - d.rating)}</span></div>
        <div className="text-2xl font-semibold" style={{ color }}>{d.classification}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat label="Percentile" v={`${d.percentile}th`} />
          <Stat label="Best" v={d.best.toFixed(0)} />
          <Stat label="Worst" v={d.worst.toFixed(0)} />
          <Stat label="Pillars" v={`${d.pillars.length}×25`} />
        </div>
      </div>
    </div>
  );
}
function Stat({ label, v }: { label: string; v: string }) { return <div className="rounded bg-white/[0.02] p-2"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="font-mono text-slate-100">{v}</div></div>; }

export function PillarCards({ pillars }: { pillars: Pillar[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {pillars.map((p) => {
        const pct = (p.score / p.max) * 100; const color = scoreColor(pct);
        return (
          <div key={p.key} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-200">{p.label}</span>
              <span className="font-mono text-lg font-semibold" style={{ color }}>{p.score.toFixed(1)}<span className="text-xs text-slate-600">/{p.max}</span></span>
            </div>
            <div className="my-2 h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded" style={{ width: `${pct}%`, background: color }} /></div>
            <div className="mb-2 text-[11px]" style={{ color }}>{p.classification}</div>
            <div className="space-y-1">
              {p.metrics.map((m) => <div key={m.label} className="flex justify-between text-[11px]"><span className="text-slate-500">{m.label}</span><span className="font-mono text-slate-300">{m.value}</span></div>)}
            </div>
            <div className="mt-2 text-[10px] leading-snug text-slate-500">{p.insight}</div>
          </div>
        );
      })}
    </div>
  );
}

export function PillarRadar({ d }: { d: ScoreCard }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Pillar Profile</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={d.radar} outerRadius="72%">
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis dataKey="pillar" tick={{ fill: "#94a3b8", fontSize: 11 }} />
            <Radar dataKey="score" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.35} isAnimationActive={false} />
            <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(0)}/100`, "Score"]} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ScoreHistory({ d }: { d: ScoreCard }) {
  const rows = d.history.dates.map((dt, i) => ({ date: dt, Total: d.history.total[i], Return: d.history.return[i], Risk: d.history.risk[i], Diversification: d.history.div[i] }));
  if (rows.length < 2) return <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Insufficient history for a score trend.</div>;
  const lines: [string, string][] = [["Total", "#22d3ee"], ["Return", "#10b981"], ["Risk", "#f43f5e"], ["Diversification", "#a78bfa"]];
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Score Evolution</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [Number(v).toFixed(0), String(n)]} />
            {lines.map(([k, c]) => <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={k === "Total" ? 2 : 1.2} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-[10px] text-slate-600">Total + pillar scores over the available window (Concentration held ~constant; weights change slowly).</div>
    </div>
  );
}

export function StrengthsWeaknesses({ d }: { d: ScoreCard }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
        <div className="mb-2 text-sm font-semibold text-emerald-400">Top Strengths</div>
        <div className="space-y-1.5">{d.strengths.map((s, i) => <div key={i} className="flex items-center justify-between text-sm"><span className="text-slate-200">✓ {s.label}</span><span className="font-mono text-[11px] text-slate-500">{s.detail}</span></div>)}</div>
      </div>
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-4">
        <div className="mb-2 text-sm font-semibold text-rose-400">Top Weaknesses</div>
        <div className="space-y-1.5">{d.weaknesses.map((s, i) => <div key={i} className="flex items-center justify-between text-sm"><span className="text-slate-200">✗ {s.label}</span><span className="font-mono text-[11px] text-slate-500">{s.detail}</span></div>)}</div>
      </div>
    </div>
  );
}

export function Recommendations({ d }: { d: ScoreCard }) {
  if (!d.recommendations.length) return <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-4 text-sm text-emerald-300">No material weaknesses detected — the portfolio scores well across all pillars.</div>;
  return (
    <div className="space-y-2">
      {d.recommendations.map((r, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-3">
          <span className="rounded bg-cyan-500/15 px-2 py-1 font-mono text-xs text-cyan-300">+{r.impact} pts</span>
          <span className="text-sm text-slate-300">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export function BenchmarkTable({ d }: { d: ScoreCard }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Portfolio</th><th className="px-4 py-2 text-right">Health</th><th className="px-4 py-2 text-right">Sharpe</th><th className="px-4 py-2 text-right">Max DD</th><th className="px-4 py-2 text-right">Div. Ratio</th><th className="px-4 py-2 text-right">Top 5</th></tr></thead>
        <tbody className="font-mono">{d.benchmark.map((b, i) => (
          <tr key={b.name} className={`border-t border-white/[0.04] ${i === 0 ? "bg-cyan-500/[0.04]" : ""}`}>
            <td className="px-4 py-2 text-left font-sans text-slate-200">{b.name}{i === 0 && <span className="ml-2 text-[10px] text-cyan-400">current</span>}</td>
            <td className="px-4 py-2 text-right font-semibold" style={{ color: scoreColor(b.health) }}>{b.health.toFixed(0)}</td>
            <td className="px-4 py-2 text-right text-slate-300">{b.sharpe.toFixed(2)}</td>
            <td className="px-4 py-2 text-right text-rose-400">{b.maxDD.toFixed(1)}%</td>
            <td className="px-4 py-2 text-right text-slate-300">{b.divRatio.toFixed(2)}</td>
            <td className="px-4 py-2 text-right text-slate-400">{b.top5.toFixed(0)}%</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
