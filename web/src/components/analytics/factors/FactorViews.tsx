"use client";

import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FactorData, FactorRow } from "@/lib/factors";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const PALETTE = ["#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24", "#f43f5e"];

function expColor(v: number): string { return v >= 0 ? "text-emerald-400" : "text-rose-400"; }
function trendArrow(t: number): string { return t > 0.05 ? "↑" : t < -0.05 ? "↓" : "→"; }

export function ExposureTable({ title, rows }: { title: string; rows: FactorRow[] }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.exposure)), 1);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 text-left">Factor</th><th className="px-4 py-2 text-right">Exposure</th>
            <th className="px-3 py-2">&nbsp;</th><th className="px-4 py-2 text-right">Risk %</th>
            <th className="px-4 py-2 text-right">Return %</th><th className="px-4 py-2 text-center">Trend</th>
          </tr></thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 text-left font-sans text-slate-200">{r.label}{r.significant && <span className="ml-2 text-[9px] text-cyan-400">●</span>}</td>
                <td className={`px-4 py-2 text-right font-semibold ${expColor(r.exposure)}`}>{r.exposure >= 0 ? "+" : ""}{r.exposure.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <div className="relative h-2 w-24 rounded bg-white/[0.03]">
                    <div className="absolute top-0 h-2 rounded" style={{ left: r.exposure >= 0 ? "50%" : `${50 - (Math.abs(r.exposure) / maxAbs) * 50}%`, width: `${(Math.abs(r.exposure) / maxAbs) * 50}%`, background: r.exposure >= 0 ? "#10b981" : "#f43f5e" }} />
                    <div className="absolute left-1/2 top-0 h-2 w-px bg-white/20" />
                  </div>
                </td>
                <td className="px-4 py-2 text-right text-slate-300">{r.riskContribPct.toFixed(1)}%</td>
                <td className={`px-4 py-2 text-right ${expColor(r.returnContribPct)}`}>{r.returnContribPct >= 0 ? "+" : ""}{r.returnContribPct.toFixed(2)}%</td>
                <td className="px-4 py-2 text-center text-slate-400">{trendArrow(r.trend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RiskDecomp({ d }: { d: FactorData }) {
  const data = [
    { name: "Market", v: +d.riskDecomp.market.toFixed(1), c: "#38bdf8" },
    { name: "Style Factors", v: +d.riskDecomp.style.toFixed(1), c: "#a78bfa" },
    { name: "Stock-Specific", v: +d.riskDecomp.specific.toFixed(1), c: "#10b981" },
  ];
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Factor Risk Decomposition</div>
      <div className="mb-3 text-[11px] text-slate-500">Share of portfolio variance (sector effects fall within style/specific)</div>
      <div className="flex h-6 w-full overflow-hidden rounded">
        {data.map((s) => <div key={s.name} style={{ width: `${s.v}%`, background: s.c }} title={`${s.name}: ${s.v}%`} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {data.map((s) => <span key={s.name} className="flex items-center gap-1.5 text-slate-300"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.c }} />{s.name} <span className="font-mono text-slate-100">{s.v}%</span></span>)}
      </div>
    </div>
  );
}

export function ReturnWaterfall({ d }: { d: FactorData }) {
  let run = 0;
  const wf = d.returnAttr.map((s) => {
    if (s.name === "Total") return { name: s.name, base: 0, delta: Math.abs(s.v), v: s.v, total: true };
    const start = run; run += s.v;
    return { name: s.name, base: Math.min(start, run), delta: Math.abs(s.v), v: s.v, total: false };
  });
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Factor Return Attribution</div>
      <div className="mb-2 text-[11px] text-slate-500">Exposure × factor return; residual = alpha</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={wf} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={44} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Tooltip contentStyle={TT} formatter={(_v, _n, item) => { const p = (item as { payload?: { v: number } } | undefined)?.payload; return [p ? `${p.v >= 0 ? "+" : ""}${p.v}%` : "", "Contribution"]; }} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {wf.map((s, i) => <Cell key={i} fill={s.total ? "#38bdf8" : s.v >= 0 ? "#10b981" : "#f43f5e"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function FactorEvolution({ d }: { d: FactorData }) {
  const rows = d.evolution.dates.map((dt, i) => { const r: { date: string; [k: string]: number | string } = { date: dt }; for (const k of d.evolution.keys) r[k] = d.evolution.series[k][i]; return r; });
  if (rows.length < 2) return <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Insufficient history for factor evolution.</div>;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Factor Exposure Evolution</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip contentStyle={TT} formatter={(v, n) => [Number(v).toFixed(2), String(n)]} />
            {d.evolution.keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StressTable({ d }: { d: FactorData }) {
  const max = Math.max(...d.stress.map((s) => Math.abs(s.impactPct)), 1);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Factor Stress Testing</div>
      <div className="space-y-2">
        {d.stress.map((s) => (
          <div key={s.scenario} className="grid grid-cols-[180px_1fr_64px] items-center gap-3 text-sm">
            <span className="text-slate-300">{s.scenario}</span>
            <div className="relative h-3 rounded bg-white/[0.03]">
              <div className="absolute top-0 h-3 rounded" style={{ left: s.impactPct >= 0 ? "50%" : `${50 - (Math.abs(s.impactPct) / max) * 50}%`, width: `${(Math.abs(s.impactPct) / max) * 50}%`, background: s.impactPct >= 0 ? "#10b981" : "#f43f5e" }} />
              <div className="absolute left-1/2 top-0 h-3 w-px bg-white/20" />
            </div>
            <span className={`text-right font-mono ${s.impactPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{s.impactPct >= 0 ? "+" : ""}{s.impactPct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FactorClusters({ d }: { d: FactorData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Factor Overlap — holdings sharing a dominant factor</div>
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Dominant Factor</th><th className="px-4 py-2 text-left">Holdings</th><th className="px-4 py-2 text-right">Combined Weight</th></tr></thead>
        <tbody className="font-mono">
          {d.clusters.map((c) => (
            <tr key={c.dominant} className="border-t border-white/[0.04]">
              <td className="px-4 py-2 text-left font-sans text-amber-300">{c.dominant}</td>
              <td className="px-4 py-2 text-left text-slate-300">{c.members.join(" · ")}</td>
              <td className="px-4 py-2 text-right text-slate-200">{c.weight.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreGauge({ total, label }: { total: number; label: string }) {
  const v = Math.max(0, Math.min(100, total));
  const angle = -90 + (v / 100) * 180;
  const color = v >= 75 ? "#10b981" : v >= 60 ? "#22d3ee" : v >= 40 ? "#fbbf24" : "#f43f5e";
  const rad = (angle * Math.PI) / 180;
  const nx = 100 + 80 * Math.cos(rad), ny = 100 + 80 * Math.sin(rad);
  return (
    <div className="flex items-center gap-6 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
        <path d={`M20,100 A80,80 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
        <text x="100" y="92" textAnchor="middle" fontSize="34" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}</text>
        <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#64748b">out of 100</text>
      </svg>
      <div><div className="text-[11px] uppercase tracking-wider text-slate-500">Factor Diversification</div><div className="text-lg font-semibold" style={{ color }}>{label}</div></div>
    </div>
  );
}
