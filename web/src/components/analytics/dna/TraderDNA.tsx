"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Snapshot } from "@/lib/types";
import { buildTraderDNA } from "@/lib/traderdna";
import { fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard } from "../ui";

type Raw = Record<string, { dates: string[]; close: number[] }>;
const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const sevColor = (s: number) => (s >= 60 ? "#f43f5e" : s >= 35 ? "#fb923c" : s >= 15 ? "#fbbf24" : "#10b981");

export default function TraderDNA({ snapshot }: { snapshot: Snapshot }) {
  const [raw, setRaw] = useState<Raw | undefined>();
  const [stopPct, setStopPct] = useState(8);
  useEffect(() => { let alive = true; fetch("/api/factors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j?.SPY) setRaw(j); }).catch(() => {}); return () => { alive = false; }; }, []);

  const d = useMemo(() => buildTraderDNA(snapshot.account, snapshot.positions, snapshot.symbolRates, stopPct, raw), [snapshot.account, snapshot.positions, snapshot.symbolRates, stopPct, raw]);
  if (!d.ok) return <div className="px-6 py-10 text-center text-slate-500">Insufficient trade data to build Trader DNA.</div>;

  const color = d.dnaScore >= 75 ? "#10b981" : d.dnaScore >= 60 ? "#22d3ee" : d.dnaScore >= 45 ? "#fbbf24" : "#f43f5e";
  const arc = (v: number) => { const a = (-90 + v / 100 * 180) * Math.PI / 180; return `${(130 + 105 * Math.cos(a)).toFixed(1)},${(130 + 105 * Math.sin(a)).toFixed(1)}`; };

  return (
    <div className="px-6 pb-10">
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-3 text-xs">
        <label className="flex items-center gap-2 text-slate-400">Assumed stop (for R / risk) <input type="range" min={3} max={20} value={stopPct} onChange={(e) => setStopPct(+e.target.value)} className="accent-cyan-400" /> <span className="font-mono text-slate-200">{stopPct}%</span></label>
        <span className="text-[10px] text-slate-600">Learns from real data (lots/scaling, entry time, sizing, MFE/MAE, regime). No closed trades yet → some behaviours are marked pending, not fabricated.</span>
      </div>

      <Section title="Trader DNA Overview">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Trader DNA" value={`${d.dnaScore.toFixed(0)}`} hint={d.rating} valueClass={d.dnaScore >= 60 ? "text-emerald-400" : "text-amber-400"} />
          <StatCard label="Discipline" value={`${d.scores.discipline.toFixed(0)}`} />
          <StatCard label="Execution" value={`${d.scores.execution.toFixed(0)}`} />
          <StatCard label="Risk Mgmt" value={`${d.scores.risk.toFixed(0)}`} />
          <StatCard label="Decision Quality" value={`${d.scores.decision.toFixed(0)}`} />
          <StatCard label="Consistency" value={`${d.scores.consistency.toFixed(0)}`} />
          <StatCard label="Bias-Free" value={`${d.scores.bias.toFixed(0)}`} />
          <StatCard label="Learning" value={`${d.scores.learning.toFixed(0)}`} />
        </div>
      </Section>

      <Section title="Trader DNA Score">
        <div className="flex flex-col items-center gap-6 rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.03] to-transparent p-6 sm:flex-row sm:gap-8">
          <svg width="260" height="160" viewBox="0 0 260 160"><path d="M25,130 A105,105 0 0,1 235,130" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" strokeLinecap="round" /><path d={`M25,130 A105,105 0 0,1 ${arc(d.dnaScore)}`} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" /><text x="130" y="118" textAnchor="middle" fontSize="50" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{d.dnaScore.toFixed(0)}</text><text x="130" y="142" textAnchor="middle" fontSize="11" fill="#64748b">Trader DNA · /100</text></svg>
          <div className="flex-1">
            <div className="mb-2 text-2xl font-semibold" style={{ color }}>{d.rating}</div>
            {([["Strategy Edge", d.components.edge], ["Execution", d.components.execution], ["Discipline", d.components.discipline], ["Risk", d.components.risk], ["Consistency", d.components.consistency], ["Learning", d.components.learning]] as [string, number][]).map(([l, v]) => (
              <div key={l} className="mb-1"><div className="flex justify-between text-[10px] text-slate-500"><span>{l}</span><span className="font-mono">{v.toFixed(0)}</span></div><div className="h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded" style={{ width: `${v}%`, background: color }} /></div></div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="1 · Trading Style">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Primary Style</div>
            <div className="text-xl font-semibold text-cyan-300">{d.style.primary}</div>
            <div className="mt-1 text-sm text-slate-400">Secondary: {d.style.secondary}</div>
            <div className="mt-2 inline-block rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-sm text-emerald-400">{d.style.confidence}% confidence</div>
          </div>
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="mb-1 text-[11px] text-slate-500">Behaviour Profile</div><div className="h-[230px]"><ResponsiveContainer width="100%" height="100%"><RadarChart data={d.style.radar} outerRadius="72%"><PolarGrid stroke="rgba(255,255,255,0.08)" /><PolarAngleAxis dataKey="axis" tick={{ fill: "#94a3b8", fontSize: 10 }} /><Radar dataKey="v" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.35} isAnimationActive={false} /><Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(0)}/100`, "Score"]} /></RadarChart></ResponsiveContainer></div></div>
        </div>
      </Section>

      <Section title="2 · Strategy Leaderboard">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Strategy</th><th className="px-4 py-2 text-right">#</th><th className="px-4 py-2 text-right">Win</th><th className="px-4 py-2 text-right">Avg Return</th><th className="px-4 py-2 text-right">Expectancy</th><th className="px-4 py-2 text-right">Avg Hold</th><th className="px-4 py-2 text-right">P&L</th></tr></thead>
            <tbody className="font-mono">{d.strategies.map((s, i) => (
              <tr key={s.strategy} className={`border-t border-white/[0.04] ${i === 0 ? "bg-emerald-500/[0.04]" : i === d.strategies.length - 1 && d.strategies.length > 1 ? "bg-rose-500/[0.03]" : ""}`}><td className="px-4 py-2 text-left font-sans text-slate-200">{s.strategy}</td><td className="px-4 py-2 text-right text-slate-400">{s.n}</td><td className="px-4 py-2 text-right text-slate-300">{s.winRate.toFixed(0)}%</td><td className={`px-4 py-2 text-right ${pnlClass(s.avgReturn)}`}>{fmtPct(s.avgReturn)}</td><td className={`px-4 py-2 text-right ${pnlClass(s.expectancy)}`}>{fmtPct(s.expectancy)}</td><td className="px-4 py-2 text-right text-slate-400">{s.avgHold.toFixed(0)}d</td><td className={`px-4 py-2 text-right font-semibold ${pnlClass(s.pnl)}`}>{fmtSigned(s.pnl, 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="3 · Behavioural Biases" subtitle="Severity from evidence; some behaviours need closed trades">
        <div className="space-y-2">
          {d.biases.map((b) => (
            <div key={b.name} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.012] p-2.5">
              <span className="text-sm text-slate-200">{b.name}</span>
              {b.measurable ? <div className="h-2 rounded bg-white/[0.04]"><div className="h-2 rounded" style={{ width: `${b.severity}%`, background: sevColor(b.severity) }} /></div> : <span className="text-[11px] italic text-slate-600">pending — needs closed trades</span>}
              <span className="text-[10px] text-slate-500">{b.measurable ? `${b.severity}/100` : "n/a"}</span>
              <span className="col-span-3 -mt-1 text-[11px] text-slate-500">{b.evidence}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="4 · Execution Analysis">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Entry Efficiency" value={`${d.execution.entryEff.toFixed(0)}%`} />
          <StatCard label="Exit Efficiency" value={`${d.execution.exitEff.toFixed(0)}%`} valueClass={d.execution.exitEff < 50 ? "text-amber-400" : "text-slate-100"} hint="captured of favourable move" />
          <StatCard label="Avg MFE" value={fmtPct(d.execution.mfe)} valueClass="text-emerald-400" />
          <StatCard label="Avg MAE" value={fmtPct(d.execution.mae)} valueClass="text-rose-400" />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">Slippage / fill quality require tick-level fills — not available in the snapshot.</div>
      </Section>

      <Section title="5 · Market Regime Performance" subtitle="Regime at entry (trailing SPY trend · VIX level)">
        {d.regimes.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {d.regimes.map((r) => (
              <div key={r.regime} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-3" style={{ background: r.avgReturn >= 0 ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)" }}>
                <div className="text-sm font-semibold text-slate-200">{r.regime}</div>
                <div className="mt-1 font-mono text-xs text-slate-400">{r.n} trades · win {r.winRate.toFixed(0)}%</div>
                <div className={`font-mono text-lg ${pnlClass(r.avgReturn)}`}>{fmtPct(r.avgReturn)}</div>
              </div>
            ))}
          </div>
        ) : <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Regime data loading (market proxies) or insufficient overlap.</div>}
      </Section>

      <Section title="7 · Risk Management DNA">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Sizing Consistency" value={`${d.risk.sizingConsistency.toFixed(0)}%`} valueClass={d.risk.sizingConsistency < 60 ? "text-amber-400" : "text-emerald-400"} />
            <StatCard label="Portfolio Heat" value={`${d.risk.heat.toFixed(1)}%`} hint="risk at assumed stops" />
            <StatCard label="Largest Position" value={`${d.risk.maxWeight.toFixed(1)}%`} />
            <StatCard label="Avg Risk / Trade" value={`$${d.risk.avgRisk.toFixed(0)}`} />
          </div>
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="mb-1 text-[11px] text-slate-500">R-Multiple Distribution</div><div className="h-[170px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.risk.rHist} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}><XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={24} /><Tooltip contentStyle={TT} formatter={(v) => [v, "trades"]} /><Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>{d.risk.rHist.map((b, i) => <Cell key={i} fill={b.label.startsWith("-") || b.label.startsWith("<") ? "#f43f5e" : "#10b981"} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        </div>
      </Section>

      <Section title="8 · Decision Quality Timeline" subtitle="Scored independently of P&L — rewards process, not outcome">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={d.decisionTimeline} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}><XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={24} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={28} /><ReferenceLine y={60} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" /><Tooltip contentStyle={TT} formatter={(v, _n, it) => { const p = (it as { payload?: { symbol: string } })?.payload; return [`${Number(v).toFixed(0)} · ${p?.symbol ?? ""}`, "Decision"]; }} /><Line type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></div>
      </Section>

      <Section title="9 · Learning Engine" subtitle="Only statistically-supported patterns">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><ul className="space-y-1.5">{d.patterns.length ? d.patterns.map((p, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{p}</span></li>) : <li className="text-sm text-slate-500">Not enough trade history yet for statistically meaningful patterns.</li>}</ul></div>
      </Section>

      <Section title="10 · Personal Playbook">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
            <div className="mb-2 text-sm font-semibold text-emerald-400">Your Best Setup</div>
            <div className="space-y-1 text-sm text-slate-300"><div>Strategy: <span className="font-mono text-slate-100">{d.playbook.bestStrategy}</span></div><div>Holding: <span className="font-mono text-slate-100">{d.playbook.bestHold}</span></div><div>Position size: <span className="font-mono text-slate-100">{d.playbook.bestSize}</span></div><div>Win rate: <span className="font-mono text-emerald-400">{d.playbook.bestWin.toFixed(0)}%</span></div><div>Avg return: <span className={`font-mono ${pnlClass(d.playbook.bestReturn)}`}>{fmtPct(d.playbook.bestReturn)}</span></div></div>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4">
            <div className="mb-2 text-sm font-semibold text-rose-400">Avoid</div>
            <ul className="space-y-1 text-sm text-slate-300">{d.playbook.avoid.map((a, i) => <li key={i}>✗ {a}</li>)}</ul>
          </div>
        </div>
      </Section>

      <Section title="11 · AI Trading Coach">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><ul className="space-y-1.5">{d.coach.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Outcome-independent scoring rewards disciplined sizing, sound risk/reward and respected stops over raw P&L. Biases needing realised exits are flagged pending. Build closed-trade history (sells with reasons/stops) to unlock the full behavioural suite.</div>
        </div>
      </Section>
    </div>
  );
}
