"use client";

import { useMemo, useState } from "react";
import { Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Snapshot } from "@/lib/types";
import { buildDecisionQuality, QUAD_INSIGHT } from "@/lib/decisionquality";
import { fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard } from "../ui";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
// Q1 good/good=green · Q2 good-decision/bad-outcome=orange · Q3 bad-decision/good-outcome=amber · Q4 bad/bad=red
const QUAD_COLOR: Record<number, string> = { 1: "#10b981", 2: "#fb923c", 3: "#fbbf24", 4: "#f43f5e" };
const sevColor = (s: number) => (s >= 65 ? "#f43f5e" : s >= 45 ? "#fb923c" : s >= 20 ? "#fbbf24" : "#10b981");

interface ScatterDatum { x: number; y: number; z: number; name: string; strategy: string; ret: number; hold: number; r: number; weight: number; q: number; status: string }

function TipRow({ label, value, valueColor = "#FFFFFF" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 28, marginTop: 5 }}>
      <span style={{ color: "#D1D5DB", fontSize: 11 }}>{label}</span>
      <span style={{ color: valueColor, fontSize: 12, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
function MatrixTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterDatum }> }) {
  if (!active || !payload || !payload.length) return null;
  const t = payload[0].payload;
  return (
    <div style={{ background: "#111827", border: "1px solid #3B82F6", borderRadius: 8, padding: "12px 15px", boxShadow: "0 10px 30px rgba(0,0,0,0.55), 0 0 14px rgba(59,130,246,0.30)", minWidth: 210, opacity: 0.98 }}>
      <div style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 7 }}>{t.name} · {t.strategy}</div>
      <TipRow label="Decision Score" value={`${t.x} / 100`} />
      <TipRow label="Outcome Score" value={`${t.y} / 100`} />
      <TipRow label="Position Size" value={`${t.weight.toFixed(1)}%`} />
      <TipRow label="Return" value={`${t.ret >= 0 ? "+" : ""}${t.ret.toFixed(1)}%`} valueColor={t.ret >= 0 ? "#34D399" : "#FB7185"} />
      <TipRow label="Holding Period" value={`${t.hold} days`} />
      <TipRow label="R Multiple" value={`${t.r.toFixed(2)}R`} valueColor={t.r >= 0 ? "#34D399" : "#FB7185"} />
      <TipRow label="Status" value={t.status} valueColor={QUAD_COLOR[t.q]} />
    </div>
  );
}

export default function DecisionQuality({ snapshot }: { snapshot: Snapshot }) {
  const [stopPct, setStopPct] = useState(8);
  const d = useMemo(() => buildDecisionQuality(snapshot.account, snapshot.positions, snapshot.symbolRates, stopPct), [snapshot.account, snapshot.positions, snapshot.symbolRates, stopPct]);
  if (!d.ok) return <div className="px-2 py-10 text-center text-slate-500">Insufficient trade data for decision-quality analysis.</div>;

  const color = d.decisionScore >= 80 ? "#10b981" : d.decisionScore >= 70 ? "#22d3ee" : d.decisionScore >= 60 ? "#fbbf24" : "#f43f5e";
  const arc = (v: number) => { const a = (-90 + v / 100 * 180) * Math.PI / 180; return `${(100 + 80 * Math.cos(a)).toFixed(1)},${(100 + 80 * Math.sin(a)).toFixed(1)}`; };
  const scatter: ScatterDatum[] = d.trades.map((t) => ({ x: +t.decision.toFixed(0), y: +t.outcome.toFixed(0), z: t.weight + 2, name: t.symbol, strategy: t.strategy, ret: t.returnPct, hold: t.holdingDays, r: t.r, weight: t.weight, q: t.quadrant, status: t.quadLabel }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-3 text-xs">
        <label className="flex items-center gap-2 text-slate-400">Assumed stop <input type="range" min={3} max={20} value={stopPct} onChange={(e) => setStopPct(+e.target.value)} className="accent-cyan-400" /> <span className="font-mono text-slate-200">{stopPct}%</span></label>
        <span className="text-[10px] text-slate-600">Scores process, not P&L. Stop/target/thesis are absent in live data → those components use proxies; entry/size/MFE-MAE/exit are real.</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <StatCard label="Decision Quality" value={`${d.decisionScore.toFixed(0)}`} hint={d.rating} valueClass={color === "#10b981" ? "text-emerald-400" : color === "#f43f5e" ? "text-rose-400" : "text-slate-100"} />
        <StatCard label="Outcome Quality" value={`${d.outcomeScore.toFixed(0)}`} />
        <StatCard label="Process Adherence" value={`${d.processAdherence.toFixed(0)}%`} />
        <StatCard label="Discipline" value={`${d.discipline.toFixed(0)}`} />
        <StatCard label="Risk Mgmt" value={`${d.riskMgmt.toFixed(0)}`} />
        <StatCard label="Skill vs Luck" value={`${d.skillPct.toFixed(0)}/${d.luckPct.toFixed(0)}`} hint="skill / luck" />
        <StatCard label="Improvement" value={`${d.improvement >= 0 ? "+" : ""}${d.improvement.toFixed(0)}`} valueClass={pnlClass(d.improvement)} hint="recent vs early" />
        <StatCard label="Rule Violations" value={`${d.violationCount}`} valueClass={d.violationCount ? "text-rose-400" : "text-emerald-400"} />
      </div>

      <Section title="Decision Score">
        <div className="flex items-center gap-6 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
          <svg width="200" height="120" viewBox="0 0 200 120"><path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round" /><path d={`M20,100 A80,80 0 0,1 ${arc(d.decisionScore)}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" /><text x="100" y="92" textAnchor="middle" fontSize="36" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{d.decisionScore.toFixed(0)}</text></svg>
          <div className="flex-1">
            <div className="mb-2 text-lg font-semibold" style={{ color }}>{d.rating}</div>
            {([["Plan (20%)", d.componentAvg.plan], ["Entry (15%)", d.componentAvg.entry], ["Size (15%)", d.componentAvg.size], ["Stop (15%)", d.componentAvg.stop], ["Risk/Reward (15%)", d.componentAvg.rr], ["Exit (10%)", d.componentAvg.exit], ["Thesis (10%)", d.componentAvg.thesis]] as [string, number][]).map(([l, v]) => (
              <div key={l} className="mb-1"><div className="flex justify-between text-[10px] text-slate-500"><span>{l}</span><span className="font-mono">{v.toFixed(0)}</span></div><div className="h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded" style={{ width: `${v}%`, background: v >= 60 ? "#10b981" : v >= 40 ? "#fbbf24" : "#f43f5e" }} /></div></div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="1 · Decision vs Outcome Matrix" subtitle="x = decision quality · y = outcome · bubble = weight">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 lg:col-span-2">
            <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
              <XAxis type="number" dataKey="x" name="Decision" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Decision →", position: "insideBottom", offset: -6, fill: "#64748b", fontSize: 10 }} />
              <YAxis type="number" dataKey="y" name="Outcome" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Outcome →", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <ReferenceLine x={65} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" /><ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
              <Tooltip content={<MatrixTip />} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={scatter} isAnimationActive={false}>{scatter.map((s, i) => <Cell key={i} fill={QUAD_COLOR[s.q]} fillOpacity={0.7} />)}</Scatter>
            </ScatterChart></ResponsiveContainer></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([[1, "Q1", d.quadrants.q1], [3, "Q3", d.quadrants.q3], [2, "Q2", d.quadrants.q2], [4, "Q4", d.quadrants.q4]] as [number, string, number][]).map(([qn, , n]) => (
              <div key={qn} className="rounded-lg border p-2.5" style={{ borderColor: `${QUAD_COLOR[qn]}55`, background: `${QUAD_COLOR[qn]}11` }}>
                <div className="font-mono text-2xl font-semibold" style={{ color: QUAD_COLOR[qn] }}>{n}</div>
                <div className="text-[10px] font-semibold text-slate-300">{["", "Good/Good", "Good/Bad", "Bad/Good", "Bad/Bad"][qn]}</div>
                <div className="mt-0.5 text-[9px] leading-tight text-slate-500">{QUAD_INSIGHT[qn]}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="4 · Luck vs Skill">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-2 flex h-6 w-full overflow-hidden rounded">
            <div style={{ width: `${d.skillPct}%`, background: "#10b981" }} className="flex items-center justify-center text-[10px] font-semibold text-white">Skill {d.skillPct.toFixed(0)}%</div>
            <div style={{ width: `${d.luckPct}%`, background: "#fb923c" }} className="flex items-center justify-center text-[10px] font-semibold text-white">Luck {d.luckPct.toFixed(0)}%</div>
          </div>
          <div className="text-[11px] text-slate-500">Decision–outcome alignment {d.alignment.toFixed(2)} · {d.alignment < 0.2 ? "results are largely luck-driven over this small sample" : "outcomes are tracking decision quality (skill signal)"}. {d.quadrants.q3 > 0 && `${d.quadrants.q3} lucky win(s) and `}{d.quadrants.q2} sound-but-unlucky loss(es).</div>
        </div>
      </Section>

      <Section title="5 · Rule Violation Tracker">
        <div className="space-y-2">
          {d.violations.map((v) => (
            <div key={v.name} className="grid grid-cols-[180px_1fr_auto] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.012] p-2.5">
              <span className="text-sm text-slate-200">{v.name}</span>
              {v.measurable ? <div className="h-2 rounded bg-white/[0.04]"><div className="h-2 rounded" style={{ width: `${Math.min(100, (v.count / d.trades.length) * 100)}%`, background: sevColor(v.severity) }} /></div> : <span className="text-[11px] italic text-slate-600">pending — needs closed trades</span>}
              <span className="font-mono text-[11px] text-slate-400">{v.measurable ? `${v.count}× · sev ${v.severity}` : "n/a"}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="8 · Decision Quality Timeline" subtitle="Decision (cyan) vs Outcome (amber) per trade, in entry order">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={d.timeline} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={24} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={28} /><ReferenceLine y={65} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          <Tooltip contentStyle={TT} formatter={(v, n) => [Number(v).toFixed(0), String(n)]} />
          <Line type="monotone" dataKey="decision" name="Decision" stroke="#22d3ee" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} /><Line type="monotone" dataKey="outcome" name="Outcome" stroke="#fb923c" strokeWidth={1.2} dot={false} isAnimationActive={false} />
        </LineChart></ResponsiveContainer></div></div>
      </Section>

      <Section title="9 · Monthly Report Card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ReportCol title="Continue" color="#10b981" items={d.report.continue} />
          <ReportCol title="Stop" color="#f43f5e" items={d.report.stop} />
          <ReportCol title="Improve Next" color="#fbbf24" items={d.report.improve} />
        </div>
      </Section>

      <Section title="7 · AI Performance Coach">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><ul className="space-y-1.5">{d.coach.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Process-first scoring: a rule-breaking winner scores low (Q3), a plan-following loser scores high (Q2). Components needing trade plans (stop/target/thesis) use proxies until closed-trade metadata exists.</div>
        </div>
      </Section>
    </div>
  );
}
function ReportCol({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div className="rounded-lg border bg-white/[0.012] p-4" style={{ borderColor: `${color}33` }}>
      <div className="mb-2 text-sm font-semibold" style={{ color }}>{title}</div>
      <ul className="space-y-1 text-sm text-slate-300">{items.map((it, i) => <li key={i}>• {it}</li>)}</ul>
    </div>
  );
}
