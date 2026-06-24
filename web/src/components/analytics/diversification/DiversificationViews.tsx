"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DivData } from "@/lib/diversification";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;

function divColor(r: number): string {
  // dark green strong+ , white neutral, dark red negative
  if (r >= 0) return `rgba(16,185,129,${(0.12 + 0.7 * Math.min(1, r)).toFixed(2)})`;
  return `rgba(244,63,94,${(0.12 + 0.7 * Math.min(1, -r)).toFixed(2)})`;
}

// ── Score gauge ─────────────────────────────────────────────────────────────────

export function ScoreGauge({ score }: { score: DivData["score"] }) {
  const v = Math.max(0, Math.min(100, score.total));
  const angle = -90 + (v / 100) * 180;
  const color = v >= 75 ? "#10b981" : v >= 60 ? "#22d3ee" : v >= 40 ? "#fbbf24" : "#f43f5e";
  const r = 80, cx = 100, cy = 100;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad), ny = cy + r * Math.sin(rad);
  return (
    <div className="rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Diversification Score</div>
      <div className="flex items-center gap-6">
        <svg width="200" height="120" viewBox="0 0 200 120">
          <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
          <path d={`M20,100 A80,80 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
          <text x="100" y="92" textAnchor="middle" fontSize="34" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}</text>
          <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#64748b">out of 100</text>
        </svg>
        <div className="flex-1">
          <div className="mb-2 font-semibold" style={{ color }}>{score.label}</div>
          {([["Correlation", score.components.correlation, 0.30], ["Effective Bets", score.components.bets, 0.20], ["Div. Ratio", score.components.ratio, 0.20], ["Concentration", score.components.concentration, 0.15], ["Factor Overlap", score.components.factor, 0.15]] as [string, number, number][]).map(([l, val, wt]) => (
            <div key={l} className="mb-1">
              <div className="flex justify-between text-[10px] text-slate-500"><span>{l} <span className="text-slate-600">({(wt * 100).toFixed(0)}%)</span></span><span className="font-mono text-slate-400">{val.toFixed(0)}</span></div>
              <div className="h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded bg-cyan-500/60" style={{ width: `${val}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Correlation heatmap ─────────────────────────────────────────────────────────

export function CorrelationHeatmap({ data }: { data: DivData }) {
  const [n, setN] = useState<number>(Math.min(20, data.correlation.symbols.length));
  const syms = data.correlation.symbols.slice(0, n);
  const matrix = data.correlation.matrix.slice(0, n).map((row) => row.slice(0, n));
  if (syms.length < 2) return <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Not enough history for a correlation heatmap.</div>;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Correlation Heatmap <span className="text-[11px] text-slate-500">(clustered order)</span></div>
        <div className="flex gap-1">
          {[10, 20, data.correlation.symbols.length].filter((x, i, a) => a.indexOf(x) === i).map((x) => (
            <button key={x} onClick={() => setN(x)} className={`rounded px-2 py-0.5 text-xs ${n === x ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>{x >= data.correlation.symbols.length ? "All" : `Top ${x}`}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[9px]">
          <thead><tr><th className="p-1" />{syms.map((s) => <th key={s} className="p-1 text-slate-500" style={{ writingMode: "vertical-rl" }}>{s}</th>)}</tr></thead>
          <tbody className="font-mono">
            {syms.map((s, i) => (
              <tr key={s}>
                <td className="whitespace-nowrap p-1 text-right text-slate-400">{s}</td>
                {syms.map((t, j) => <td key={t} title={`${s}/${t}: ${matrix[i][j].toFixed(2)}`} className="h-5 w-5 text-center text-slate-200" style={{ background: divColor(matrix[i][j]) }}>{matrix[i][j].toFixed(1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Extremes ──────────────────────────────────────────────────────────────────────

export function Extremes({ data }: { data: DivData }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Highest Correlated Pair</div>
        {data.highestPair ? <div className="mt-1 font-mono text-lg text-rose-300">{data.highestPair.a} – {data.highestPair.b} <span className="font-semibold">{data.highestPair.r.toFixed(2)}</span></div> : "—"}
        <div className="mt-1 text-[11px] text-slate-500">Effectively the same trade — limited diversification benefit.</div>
      </div>
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Lowest Correlated Pair</div>
        {data.lowestPair ? <div className="mt-1 font-mono text-lg text-emerald-300">{data.lowestPair.a} – {data.lowestPair.b} <span className="font-semibold">{data.lowestPair.r.toFixed(2)}</span></div> : "—"}
        <div className="mt-1 text-[11px] text-slate-500">Genuine diversifier — offsetting behaviour.</div>
      </div>
    </div>
  );
}

// ── Clusters ────────────────────────────────────────────────────────────────────────

export function ClusterTable({ data }: { data: DivData }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Correlation Clusters <span className="text-[11px] text-slate-500">(ρ &gt; 0.6 — &quot;same trade&quot;)</span></div>
      {data.clusters.length ? (
        <div className="space-y-2">
          {data.clusters.map((c, i) => (
            <div key={i} className="rounded border border-amber-500/15 bg-amber-500/[0.03] p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-amber-200">{c.members.join(" · ")}</span>
                <span className="text-[11px] text-slate-400">internal ρ {c.internalCorr.toFixed(2)}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Weight {c.weight.toFixed(1)}% · Risk contribution {c.riskContribPct.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      ) : <div className="text-sm text-slate-400">No tight correlation clusters detected (no pair above ρ = 0.6).</div>}
    </div>
  );
}

// ── Factor overlap ──────────────────────────────────────────────────────────────────

export function FactorTable({ data }: { data: DivData }) {
  const f = data.factors;
  const tilt = (v: number) => (v > 0.2 ? "Overweight" : v < -0.2 ? "Underweight" : "Neutral");
  const rows: [string, string, string][] = [
    ["Market Beta (vs SPY)", Number.isFinite(f.marketBeta) ? f.marketBeta.toFixed(2) : "n/a", "Sensitivity to the broad equity market"],
    ["Momentum tilt", f.momentumTilt.toFixed(2), tilt(f.momentumTilt)],
    ["Volatility tilt", f.volTilt.toFixed(2), tilt(f.volTilt)],
    ["Size tilt", f.sizeTilt.toFixed(2), tilt(f.sizeTilt)],
    ["Gold / commodity", `${f.goldShare.toFixed(1)}%`, "capital weight"],
    ["USD / FX index", `${f.usdShare.toFixed(1)}%`, "capital weight"],
  ];
  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 text-sm ${f.dominantShare > 25 ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-200" : "border-cyan-500/15 bg-white/[0.012] text-slate-300"}`}>
        {f.dominantShare > 25 ? "⚠ " : ""}Hidden overlap: <span className="font-mono">{f.dominantShare.toFixed(0)}%</span> of capital shares the dominant <span className="font-semibold">{f.dominantSector}</span> exposure — these names tend to move on the same driver despite appearing as separate positions.
      </div>
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Factor (proxy)</th><th className="px-4 py-2 text-right">Exposure</th><th className="px-4 py-2 text-left">Note</th></tr></thead>
          <tbody className="font-mono">
            {rows.map(([l, v, n]) => (
              <tr key={l} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{l}</td><td className="px-4 py-2 text-right text-slate-300">{v}</td><td className="px-4 py-2 text-left text-slate-500">{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-slate-600">Factor proxies derived from the holdings&apos; own price history + classification — descriptive tilts, not a full Barra/Axioma factor-risk model (which needs a factor-return dataset).</div>
    </div>
  );
}

// ── Stress test ────────────────────────────────────────────────────────────────────

export function StressTest({ data }: { data: DivData }) {
  const s = data.stress;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">Stress Diversification Test <span className="text-[11px] text-slate-500">(down-market days)</span></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><div className="text-[10px] uppercase text-slate-500">Normal Correlation</div><div className="font-mono text-lg text-emerald-400">{s.normalCorr.toFixed(2)}</div></div>
        <div><div className="text-[10px] uppercase text-slate-500">Stress Correlation</div><div className="font-mono text-lg text-rose-400">{s.stressCorr.toFixed(2)}</div></div>
        <div><div className="text-[10px] uppercase text-slate-500">Div. Ratio (normal → stress)</div><div className="font-mono text-lg text-slate-200">{s.normalDR.toFixed(2)} → {s.stressDR.toFixed(2)}</div></div>
        <div><div className="text-[10px] uppercase text-slate-500">Diversification Lost</div><div className={`font-mono text-lg ${s.collapsePct > 40 ? "text-rose-400" : s.collapsePct > 20 ? "text-amber-400" : "text-emerald-400"}`}>{s.collapsePct.toFixed(0)}%</div></div>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        {s.collapsePct > 40 ? "Diversification largely collapses in stress — holdings move together when it matters most." : "Diversification holds up reasonably under stress."}
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────────────

export function DivHistory({ data }: { data: DivData }) {
  const rows = data.history.dates.map((d, i) => ({ date: d, avgCorr: data.history.avgCorr[i], divRatio: data.history.divRatio[i], effBets: data.history.effBets[i], score: data.history.score[i] }));
  if (rows.length < 2) return <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Insufficient history for diversification trends.</div>;
  const charts: [string, string, string][] = [["score", "#22d3ee", "Diversification Score"], ["avgCorr", "#f43f5e", "Avg Correlation"], ["divRatio", "#10b981", "Diversification Ratio"], ["effBets", "#a78bfa", "Effective Bets"]];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {charts.map(([key, color, title]) => (
        <div key={key} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-1 text-[11px] text-slate-500">{title}</div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={24} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} domain={["auto", "auto"]} />
                <Tooltip contentStyle={TT} formatter={(v) => [Number(v).toFixed(2), title]} />
                <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
