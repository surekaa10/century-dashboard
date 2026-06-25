"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { Snapshot } from "@/lib/types";
import { buildTactical, type Trade, type SleevePerf } from "@/lib/tactical";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard } from "../ui";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;

function Gauge({ v, max, label, sub, over }: { v: number; max: number; label: string; sub: string; over: boolean }) {
  const pctv = Math.max(0, Math.min(100, (v / max) * 100));
  const angle = -90 + (pctv / 100) * 180;
  const color = over ? "#f43f5e" : pctv > 75 ? "#fb923c" : pctv > 50 ? "#fbbf24" : "#10b981";
  const rad = (angle * Math.PI) / 180, nx = 100 + 80 * Math.cos(rad), ny = 100 + 80 * Math.sin(rad);
  return (
    <div className="flex items-center gap-5 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <svg width="190" height="118" viewBox="0 0 200 120"><path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round" /><path d={`M20,100 A80,80 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" /><text x="100" y="92" textAnchor="middle" fontSize="32" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}%</text></svg>
      <div><div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div><div className="font-semibold" style={{ color }}>{sub}</div><div className="mt-1 text-[10px] text-slate-500">Max {max}%</div></div>
    </div>
  );
}
function CompareCol({ title, p }: { title: string; p: SleevePerf }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">{title}</div>
      {([["Return", fmtPct(p.returnPct)], ["P&L", fmtSigned(p.pnl, 0)], ["Volatility", `${p.volAnnual.toFixed(0)}%`], ["Sharpe", p.sharpe.toFixed(2)], ["Sortino", p.sortino.toFixed(2)], ["Max DD", `${p.maxDD.toFixed(1)}%`], ["VaR 95%", `${p.var95.toFixed(1)}%`], ["Win Rate", `${p.winRate.toFixed(0)}%`], ["Avg Hold", `${p.avgHold.toFixed(0)}d`], ["Capital", `$${fmtMoney(p.capital, 0)}`]] as [string, string][]).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-white/[0.04] py-1 text-xs"><span className="text-slate-500">{k}</span><span className={`font-mono ${k === "P&L" || k === "Return" ? pnlClass(p.pnl) : "text-slate-200"}`}>{v}</span></div>
      ))}
    </div>
  );
}
function stratHeat(v: number): string { return v >= 0 ? `rgba(16,185,129,${(0.15 + Math.min(0.6, v / 20)).toFixed(2)})` : `rgba(244,63,94,${(0.15 + Math.min(0.6, -v / 20)).toFixed(2)})`; }

export default function TacticalDashboard({ snapshot }: { snapshot: Snapshot }) {
  const [maxDays, setMaxDays] = useState(25);
  const [stopPct, setStopPct] = useState(8);
  const [budget] = useState(20);

  const d = useMemo(() => buildTactical(snapshot.account, snapshot.positions, snapshot.symbolRates, maxDays, stopPct, budget), [snapshot.account, snapshot.positions, snapshot.symbolRates, maxDays, stopPct, budget]);

  const Controls = (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-3 text-xs">
      <label className="flex items-center gap-2 text-slate-400">Tactical = held ≤ <input type="range" min={5} max={45} value={maxDays} onChange={(e) => setMaxDays(+e.target.value)} className="accent-cyan-400" /> <span className="font-mono text-slate-200">{maxDays}d</span></label>
      <label className="flex items-center gap-2 text-slate-400">Assumed stop <input type="range" min={3} max={20} value={stopPct} onChange={(e) => setStopPct(+e.target.value)} className="accent-cyan-400" /> <span className="font-mono text-slate-200">{stopPct}%</span></label>
      <span className="text-[10px] text-slate-600">No sleeve tags exist in live data — sleeve is a holding-period heuristic; risk/R use an assumed stop. MFE/MAE from price history.</span>
    </div>
  );

  if (!d.ok) return <div className="px-6 pb-10">{Controls}<div className="py-10 text-center text-slate-500">No positions classified as tactical at ≤ {maxDays} days. Increase the threshold to define the sleeve.</div></div>;

  const statusColor = d.health.total >= 75 ? "#10b981" : d.health.total >= 60 ? "#22d3ee" : d.health.total >= 40 ? "#fbbf24" : "#f43f5e";
  const nearStop = (t: Trade) => t.distToStop < 4, nearTarget = (t: Trade) => t.distToTarget < 4, overHold = (t: Trade) => t.holdingDays > maxDays * 1.5;

  return (
    <div className="px-6 pb-10">
      {Controls}

      <Section title="Tactical Overview" subtitle={`Evaluating the tactical sleeve as a standalone book · ${d.trades.length} trades / ${d.coreCount} core`}>
        <div className="flex flex-wrap gap-3">
          <StatCard label="Tactical Allocation" value={`${d.alloc.toFixed(1)}%`} hint={`budget ${budget}%`} valueClass={d.risk.overBudget ? "text-rose-400" : "text-slate-100"} />
          <StatCard label="Tactical P&L" value={fmtSigned(d.tactical.pnl, 0)} valueClass={pnlClass(d.tactical.pnl)} />
          <StatCard label="Tactical Return" value={fmtPct(d.tactical.returnPct)} valueClass={pnlClass(d.tactical.returnPct)} />
          <StatCard label="Alpha vs Core" value={fmtPct(d.alpha.excess)} valueClass={pnlClass(d.alpha.excess)} />
          <StatCard label="Tactical Sharpe" value={d.tactical.sharpe.toFixed(2)} />
          <StatCard label="Win Rate" value={`${d.quality.winRate.toFixed(0)}%`} />
          <StatCard label="Avg Holding" value={`${d.tactical.avgHold.toFixed(0)}d`} />
          <StatCard label="Health Score" value={`${d.health.total.toFixed(0)}`} hint={d.health.label} />
        </div>
      </Section>

      <Section title="Executive Summary"><div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-4 text-sm leading-relaxed text-slate-200">{d.summary}</div></Section>

      <Section title="1 · Core vs Tactical"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><CompareCol title="Core Sleeve" p={d.core} /><CompareCol title="Tactical Sleeve" p={d.tactical} /></div></Section>

      <Section title="2 · Tactical Trade Scorecard">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-left">Strategy</th><th className="px-3 py-2 text-right">P&L</th><th className="px-3 py-2 text-right">Return</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2 text-right">R</th><th className="px-3 py-2 text-right">Setup</th></tr></thead>
            <tbody className="font-mono">{d.trades.map((t) => (
              <tr key={t.symbol + t.openDate} className="border-t border-white/[0.04]"><td className="px-3 py-2 text-left font-sans text-slate-200">{t.symbol}</td><td className="px-3 py-2 text-left text-slate-400">{t.strategy}</td><td className={`px-3 py-2 text-right ${pnlClass(t.pnl)}`}>{fmtSigned(t.pnl, 0)}</td><td className={`px-3 py-2 text-right ${pnlClass(t.returnPct)}`}>{fmtPct(t.returnPct)}</td><td className="px-3 py-2 text-right text-slate-400">{t.holdingDays}</td><td className={`px-3 py-2 text-right ${pnlClass(t.rMultiple)}`}>{t.rMultiple.toFixed(2)}R</td><td className="px-3 py-2 text-right text-slate-300">{t.setupScore.toFixed(0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="3 · Trade Quality">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Win Rate" value={`${d.quality.winRate.toFixed(0)}%`} /><StatCard label="Profit Factor" value={Number.isFinite(d.quality.profitFactor) ? d.quality.profitFactor.toFixed(2) : "∞"} /><StatCard label="Expectancy" value={fmtPct(d.quality.expectancy)} valueClass={pnlClass(d.quality.expectancy)} /><StatCard label="Avg R" value={`${d.quality.avgR.toFixed(2)}R`} valueClass={pnlClass(d.quality.avgR)} /><StatCard label="Avg Winner" value={fmtPct(d.quality.avgWinner)} valueClass="text-emerald-400" /><StatCard label="Avg Loser" value={fmtPct(d.quality.avgLoser)} valueClass="text-rose-400" /><StatCard label="Largest Win" value={fmtPct(d.quality.largestWin)} valueClass="text-emerald-400" /><StatCard label="Largest Loss" value={fmtPct(d.quality.largestLoss)} valueClass="text-rose-400" />
          </div>
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="mb-1 text-[11px] text-slate-500">R-Multiple Distribution</div><div className="h-[180px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.quality.rHist} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}><XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={24} /><Tooltip contentStyle={TT} formatter={(v) => [v, "trades"]} /><Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>{d.quality.rHist.map((b, i) => <Cell key={i} fill={b.label.startsWith("-") || b.label.startsWith("<") ? "#f43f5e" : "#10b981"} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        </div>
      </Section>

      <Section title="4 · Risk Budget Monitor" right={d.risk.overBudget ? <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">⚠ Over Budget</span> : undefined}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Gauge v={d.alloc} max={budget} label="Tactical Allocation" sub={d.risk.overBudget ? "Above budget" : "Within budget"} over={d.risk.overBudget} />
          <div className="grid grid-cols-2 gap-3"><StatCard label="Remaining Budget" value={`${d.risk.remaining.toFixed(1)}%`} valueClass={d.risk.remaining < 0 ? "text-rose-400" : "text-emerald-400"} /><StatCard label="Open Risk (at stop)" value={`$${fmtMoney(d.risk.openRisk, 0)}`} /><StatCard label="Tactical Leverage" value={`${d.risk.leverage.toFixed(3)}x`} /><StatCard label="Concentration" value={`${d.risk.concentration.toFixed(0)}%`} hint="largest tactical" /></div>
        </div>
      </Section>

      <Section title="5 · Idea / Strategy Performance">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Strategy</th><th className="px-4 py-2 text-right"># Trades</th><th className="px-4 py-2 text-right">Win Rate</th><th className="px-4 py-2 text-right">Avg Return</th><th className="px-4 py-2 text-right">Avg Hold</th><th className="px-4 py-2 text-right">P&L</th></tr></thead>
            <tbody className="font-mono">{d.strategies.map((s) => (
              <tr key={s.strategy} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{s.strategy}</td><td className="px-4 py-2 text-right text-slate-400">{s.n}</td><td className="px-4 py-2 text-right text-slate-300">{s.winRate.toFixed(0)}%</td><td className="px-4 py-2 text-right" style={{ background: stratHeat(s.avgReturn) }}>{fmtPct(s.avgReturn)}</td><td className="px-4 py-2 text-right text-slate-400">{s.avgHold.toFixed(0)}d</td><td className={`px-4 py-2 text-right font-semibold ${pnlClass(s.pnl)}`}>{fmtSigned(s.pnl, 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="6 · Entry & Exit Quality" subtitle="MFE/MAE from price history; exit efficiency = captured ÷ max favourable">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-right">Captured</th><th className="px-4 py-2 text-right">MFE</th><th className="px-4 py-2 text-right">MAE</th><th className="px-4 py-2 text-right">Exit Eff.</th></tr></thead>
            <tbody className="font-mono">{d.trades.map((t) => (
              <tr key={t.symbol + t.openDate} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{t.symbol}</td><td className={`px-4 py-2 text-right ${pnlClass(t.returnPct)}`}>{fmtPct(t.returnPct)}</td><td className="px-4 py-2 text-right text-emerald-400">{fmtPct(t.mfePct)}</td><td className="px-4 py-2 text-right text-rose-400">{fmtPct(t.maePct)}</td><td className={`px-4 py-2 text-right ${t.exitEff < 50 ? "text-amber-400" : "text-slate-300"}`}>{t.exitEff.toFixed(0)}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="7 · Capital Efficiency" subtitle="Return per $ risked">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EffList title="Most Efficient" trades={d.efficiency.best} />
          <EffList title="Least Efficient" trades={d.efficiency.worst} />
        </div>
      </Section>

      <Section title="8 · Contribution to Total Portfolio">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ContribCard label="Capital" v={d.alloc} note="of portfolio capital" />
          <ContribCard label="Gains" v={d.allocPnlShare} note="of portfolio P&L" highlight={d.allocPnlShare > d.alloc} />
          <ContribCard label="Risk" v={d.allocRiskShare} note="of portfolio risk (indicative)" highlight={d.allocRiskShare < d.alloc} />
        </div>
      </Section>

      <Section title="9 · Open Trade Monitor">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-3 py-2 text-left">Symbol</th><th className="px-3 py-2 text-right">Unreal. P&L</th><th className="px-3 py-2 text-right">→ Target</th><th className="px-3 py-2 text-right">→ Stop</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2 text-right">R</th><th className="px-3 py-2 text-left">Flags</th></tr></thead>
            <tbody className="font-mono">{d.trades.map((t) => (
              <tr key={t.symbol + t.openDate} className="border-t border-white/[0.04]"><td className="px-3 py-2 text-left font-sans text-slate-200">{t.symbol}</td><td className={`px-3 py-2 text-right ${pnlClass(t.pnl)}`}>{fmtSigned(t.pnl, 0)}</td><td className="px-3 py-2 text-right text-slate-400">{t.distToTarget.toFixed(1)}%</td><td className={`px-3 py-2 text-right ${nearStop(t) ? "text-rose-400" : "text-slate-400"}`}>{t.distToStop.toFixed(1)}%</td><td className="px-3 py-2 text-right text-slate-400">{t.holdingDays}</td><td className={`px-3 py-2 text-right ${pnlClass(t.rMultiple)}`}>{t.rMultiple.toFixed(2)}</td>
                <td className="px-3 py-2 text-left text-[10px]">{nearStop(t) && <span className="mr-1 rounded bg-rose-500/15 px-1 text-rose-400">near stop</span>}{nearTarget(t) && <span className="mr-1 rounded bg-emerald-500/15 px-1 text-emerald-400">near target</span>}{overHold(t) && <span className="rounded bg-amber-500/15 px-1 text-amber-400">over hold</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="10 · Tactical Risk Analysis">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Tactical VaR 95%" value={`${d.risk.var95.toFixed(1)}%`} /><StatCard label="CVaR (ES)" value={`${d.risk.cvar.toFixed(1)}%`} /><StatCard label="Drawdown" value={`${d.risk.drawdown.toFixed(1)}%`} /><StatCard label="Corr w/ Core" value={d.risk.corr.toFixed(2)} valueClass={d.risk.corr < 0.5 ? "text-emerald-400" : "text-amber-400"} /><StatCard label="Concentration" value={`${d.risk.concentration.toFixed(0)}%`} /><StatCard label="Beta to Core" value={d.risk.beta.toFixed(2)} />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">{d.risk.corr < 0.5 ? "Tactical risk is largely diversifying vs the core book." : "Tactical risk is amplifying existing core exposure (high correlation)."}</div>
      </Section>

      <Section title="11 · Alpha Generation">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Excess vs Core" value={fmtPct(d.alpha.excess)} valueClass={pnlClass(d.alpha.excess)} /><StatCard label="Information Ratio" value={d.alpha.infoRatio.toFixed(2)} /><StatCard label="Alpha (ann.)" value={fmtPct(d.alpha.alpha)} valueClass={pnlClass(d.alpha.alpha)} /><StatCard label="Beta" value={d.alpha.beta.toFixed(2)} /><StatCard label="Hit Rate" value={`${d.alpha.hitRate.toFixed(0)}%`} /><StatCard label="Capture" value={`${d.alpha.capture.toFixed(0)}%`} />
          </div>
          <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4"><div className="mb-1 text-[11px] text-slate-500">Rolling Alpha vs Core (cumulative excess %)</div><div className="h-[180px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.alpha.rolling} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}><XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" /><Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(2)}%`, "Excess"]} /><Bar dataKey="v" radius={[3, 3, 0, 0]} isAnimationActive={false}>{d.alpha.rolling.map((r, i) => <Cell key={i} fill={r.v >= 0 ? "#10b981" : "#f43f5e"} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        </div>
      </Section>

      <Section title="13 · Tactical Health Score">
        <div className="flex items-center gap-6 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
          <svg width="180" height="110" viewBox="0 0 200 120"><path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round" /><path d={`M20,100 A80,80 0 0,1 ${(100 + 80 * Math.cos((-90 + d.health.total / 100 * 180) * Math.PI / 180)).toFixed(1)},${(100 + 80 * Math.sin((-90 + d.health.total / 100 * 180) * Math.PI / 180)).toFixed(1)}`} fill="none" stroke={statusColor} strokeWidth="14" strokeLinecap="round" /><text x="100" y="92" textAnchor="middle" fontSize="34" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{d.health.total.toFixed(0)}</text></svg>
          <div className="flex-1"><div className="mb-2 text-lg font-semibold" style={{ color: statusColor }}>{d.health.label}</div>{([["Return", d.health.components.ret], ["Execution", d.health.components.exec], ["Risk Mgmt", d.health.components.risk], ["Capital Eff.", d.health.components.capital], ["Alpha", d.health.components.alpha], ["Discipline", d.health.components.discipline]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="mb-1"><div className="flex justify-between text-[10px] text-slate-500"><span>{l}</span><span className="font-mono">{v.toFixed(0)}</span></div><div className="h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded bg-cyan-500/60" style={{ width: `${v}%` }} /></div></div>
          ))}</div>
        </div>
      </Section>

      <Section title="12 · AI Trade Coach">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">{d.insights.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>)}</ul>
          <div className="mt-2 text-[10px] text-slate-600">Sleeve split, stop (and thus R-multiple / open risk / discipline) are derived assumptions — no trade-plan metadata exists in the live feed. MFE/MAE/efficiency and sleeve performance use real symbol_rates history. No closed trades yet, so quality stats are on open positions.</div>
        </div>
      </Section>
    </div>
  );
}

function EffList({ title, trades }: { title: string; trades: Trade[] }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">{title}</div>
      {trades.map((t) => (
        <div key={t.symbol + t.openDate} className="flex justify-between border-b border-white/[0.04] py-1 font-mono text-xs">
          <span className="font-sans text-slate-300">{t.symbol} <span className="text-slate-600">{t.strategy}</span></span>
          <span className={pnlClass(t.pnl)}>{(t.pnl / (t.risk || 1)).toFixed(2)}× risk · {fmtSigned(t.pnl, 0)}</span>
        </div>
      ))}
    </div>
  );
}
function ContribCard({ label, v, note, highlight }: { label: string; v: number; note: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white/[0.012] p-4 text-center ${highlight ? "border-emerald-500/30" : "border-cyan-500/10"}`}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`my-1 font-mono text-3xl font-semibold ${highlight ? "text-emerald-400" : "text-slate-100"}`}>{v.toFixed(0)}%</div>
      <div className="text-[11px] text-slate-500">{note}</div>
    </div>
  );
}
