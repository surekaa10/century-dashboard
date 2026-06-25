"use client";

import { useMemo, useState } from "react";
import { Area, Bar, BarChart, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DrawdownData, Episode, EquityPt } from "@/lib/drawdown";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const PERIODS = ["1M", "3M", "6M", "1Y", "Inception"];
const PD: Record<string, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, Inception: 99999 };
function sevColor(ddPct: number): string { const d = -ddPct; return d >= 15 ? "#f43f5e" : d >= 10 ? "#fb7185" : d >= 5 ? "#fb923c" : d >= 2 ? "#fbbf24" : "#22d3ee"; }

// ── 1. Drawdown history (equity + underwater) ────────────────────────────────────

export function DrawdownHistory({ curve }: { curve: EquityPt[] }) {
  const [p, setP] = useState("Inception");
  const data = useMemo(() => {
    const days = PD[p] ?? 99999;
    if (days >= 99999) return curve;
    const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const k = cutoff.toISOString().slice(0, 10);
    const f = curve.filter((x) => x.date >= k);
    return f.length > 1 ? f : curve;
  }, [curve, p]);
  const rows = data.map((x) => ({ date: x.date.slice(5), equity: +x.value.toFixed(0), dd: +x.dd.toFixed(2) }));
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Equity & Drawdown</div>
        <div className="flex gap-1">{PERIODS.map((x) => <button key={x} onClick={() => setP(x)} className={`rounded px-2 py-0.5 text-xs ${x === p ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>{x}</button>)}</div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <defs><linearGradient id="ddg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.05} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0.4} /></linearGradient></defs>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={30} axisLine={false} tickLine={false} />
            <YAxis yAxisId="eq" orientation="left" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} domain={["auto", "auto"]} />
            <YAxis yAxisId="dd" orientation="right" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} domain={["auto", 0]} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [String(n) === "equity" ? `$${fmtMoney(Number(v), 0)}` : `${Number(v).toFixed(2)}%`, String(n) === "equity" ? "Equity" : "Drawdown"]} />
            <Area yAxisId="dd" type="monotone" dataKey="dd" stroke="#f43f5e" strokeWidth={1} fill="url(#ddg)" isAnimationActive={false} />
            <Line yAxisId="eq" type="monotone" dataKey="equity" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 2/3. Current + Max DD cards ───────────────────────────────────────────────────

function KV({ label, value, cls = "text-slate-200" }: { label: string; value: string; cls?: string }) {
  return <div className="flex justify-between border-b border-white/[0.04] py-1.5"><span className="text-xs text-slate-500">{label}</span><span className={`font-mono text-xs ${cls}`}>{value}</span></div>;
}

export function CurrentDD({ d }: { d: DrawdownData }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Current Drawdown</div>
      <div className={`mb-2 font-mono text-3xl font-semibold ${d.currentDD < -5 ? "text-rose-400" : d.currentDD < -2 ? "text-amber-400" : "text-emerald-400"}`}>{fmtPct(d.currentDD)}</div>
      <KV label="Peak Value" value={`$${fmtMoney(d.peakValue, 0)}`} />
      <KV label="Current Value" value={`$${fmtMoney(d.currentValue, 0)}`} />
      <KV label="Dollar Loss" value={fmtSigned(d.dollarLoss, 0)} cls={pnlClass(d.dollarLoss)} />
      <KV label="Peak Date" value={d.peakDate} />
      <KV label="Days Since Peak" value={`${d.daysSincePeak}`} />
      <KV label="Recovery Needed" value={`+${d.recoveryNeeded.toFixed(2)}%`} cls="text-amber-400" />
    </div>
  );
}

export function MaxDD({ d }: { d: DrawdownData }) {
  const m = d.maxDD;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Maximum Drawdown</div>
      {m ? <>
        <div className="mb-2 font-mono text-3xl font-semibold text-rose-400">{fmtPct(m.ddPct)}</div>
        <KV label="Dollar Loss" value={fmtSigned(m.ddDollar, 0)} cls="text-rose-400" />
        <KV label="Peak Date" value={m.peakDate} />
        <KV label="Bottom Date" value={m.troughDate} />
        <KV label="Recovery Date" value={m.recoveryDate ?? "ongoing"} cls={m.recoveryDate ? "text-emerald-400" : "text-amber-400"} />
        <KV label="Peak → Trough" value={`${m.durationDays} d`} />
        <KV label="Recovery Time" value={`${m.recoveryDays} d${m.ongoing ? " (ongoing)" : ""}`} />
      </> : <div className="text-sm text-slate-500">No significant drawdown recorded.</div>}
    </div>
  );
}

// ── 4. Top 10 worst table ──────────────────────────────────────────────────────────

export function WorstTable({ d }: { d: DrawdownData }) {
  const csv = () => {
    const head = "Rank,Peak,Bottom,Recovery,Duration,RecoveryDays,Drawdown%,Drawdown$";
    const body = d.topWorst.map((e, i) => [i + 1, e.peakDate, e.troughDate, e.recoveryDate ?? "ongoing", e.durationDays, e.recoveryDays, e.ddPct.toFixed(2), e.ddDollar.toFixed(0)].join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([head + "\n" + body], { type: "text/csv" })); a.download = "drawdowns.csv"; a.click();
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3"><span className="text-sm font-semibold text-slate-200">Top 10 Worst Drawdowns</span><button onClick={csv} className="rounded border border-cyan-500/20 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10">↓ CSV</button></div>
      <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-3 py-2 text-right">#</th><th className="px-3 py-2 text-left">Peak</th><th className="px-3 py-2 text-left">Bottom</th><th className="px-3 py-2 text-left">Recovery</th><th className="px-3 py-2 text-right">Dur.</th><th className="px-3 py-2 text-right">Rec.</th><th className="px-3 py-2 text-right">DD %</th><th className="px-3 py-2 text-right">DD $</th></tr></thead>
        <tbody className="font-mono">{d.topWorst.map((e, i) => (
          <tr key={i} className={`border-t border-white/[0.04] ${i < 3 ? "bg-rose-500/[0.04]" : ""}`}>
            <td className="px-3 py-2 text-right text-slate-500">{i + 1}</td><td className="px-3 py-2 text-left text-slate-400">{e.peakDate}</td><td className="px-3 py-2 text-left text-slate-300">{e.troughDate}</td>
            <td className="px-3 py-2 text-left text-slate-400">{e.recoveryDate ?? <span className="text-amber-400">ongoing</span>}</td><td className="px-3 py-2 text-right text-slate-400">{e.durationDays}d</td><td className="px-3 py-2 text-right text-slate-400">{e.recoveryDays}d</td>
            <td className="px-3 py-2 text-right font-semibold text-rose-400">{e.ddPct.toFixed(2)}%</td><td className="px-3 py-2 text-right text-rose-300">{fmtMoney(e.ddDollar, 0)}</td>
          </tr>
        ))}{d.topWorst.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No drawdowns &gt;0.5%</td></tr>}</tbody>
      </table>
    </div>
  );
}

// ── 5. Timeline ────────────────────────────────────────────────────────────────────

export function Timeline({ d }: { d: DrawdownData }) {
  if (!d.curve.length || !d.topWorst.length) return null;
  const t0 = new Date(d.curve[0].date).getTime(), t1 = new Date(d.curve[d.curve.length - 1].date).getTime(); const span = t1 - t0 || 1;
  const pos = (date: string) => ((new Date(date).getTime() - t0) / span) * 100;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">Drawdown Timeline</div>
      <div className="space-y-2">{d.topWorst.map((e, i) => {
        const a = pos(e.peakDate), b = pos(e.recoveryDate ?? d.curve[d.curve.length - 1].date);
        return (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="w-14 text-right font-mono text-rose-400">{e.ddPct.toFixed(1)}%</span>
            <div className="relative h-3 flex-1 rounded bg-white/[0.03]">
              <div className="absolute h-3 rounded" style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%`, background: sevColor(e.ddPct), opacity: 0.8 }} title={`${e.peakDate} → ${e.troughDate} → ${e.recoveryDate ?? "ongoing"}`} />
              <div className="absolute top-0 h-3 w-0.5 bg-white/70" style={{ left: `${pos(e.troughDate)}%` }} />
            </div>
            <span className="w-20 font-mono text-slate-500">{e.peakDate.slice(5)}</span>
          </div>
        );
      })}</div>
      <div className="mt-2 text-[10px] text-slate-600">Bar = peak→recovery · white tick = trough · colour = severity</div>
    </div>
  );
}

// ── 6/7. Recovery + distribution ─────────────────────────────────────────────────────

export function RecoveryAnalysis({ d }: { d: DrawdownData }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Recovery Statistics</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([["Average", `${d.recovery.avg.toFixed(0)}d`], ["Median", `${d.recovery.median.toFixed(0)}d`], ["Fastest", `${d.recovery.fastest}d`], ["Slowest", `${d.recovery.slowest}d`], ["Success Rate", `${d.recovery.successRate.toFixed(0)}%`], ["Recovery Score", `${d.recoveryScore}`]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="rounded bg-white/[0.02] p-2"><div className="text-[10px] uppercase text-slate-500">{l}</div><div className="font-mono text-base text-slate-100">{v}</div></div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-1 text-[11px] text-slate-500">Recovery Duration Distribution</div>
        <div className="h-[180px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.recovery.hist} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}><XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={24} /><Tooltip contentStyle={TT} formatter={(v) => [v, "events"]} /><Bar dataKey="n" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
      </div>
    </div>
  );
}

export function Distribution({ d }: { d: DrawdownData }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-1 text-[11px] text-slate-500">Drawdown Frequency by Severity</div>
        <div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.distribution} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}><XAxis dataKey="bucket" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={24} /><Tooltip contentStyle={TT} formatter={(v) => [v, "events"]} /><Bar dataKey="n" fill="#fb923c" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Severity</th><th className="px-4 py-2 text-right">Events</th><th className="px-4 py-2 text-right">Avg Duration</th><th className="px-4 py-2 text-right">Avg Recovery</th></tr></thead>
          <tbody className="font-mono">{d.distribution.map((b) => <tr key={b.bucket} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left text-slate-300">{b.bucket}</td><td className="px-4 py-2 text-right text-slate-200">{b.n}</td><td className="px-4 py-2 text-right text-slate-400">{b.avgDuration.toFixed(0)}d</td><td className="px-4 py-2 text-right text-slate-400">{b.avgRecovery.toFixed(0)}d</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 8. By position ───────────────────────────────────────────────────────────────────

export function ByPosition({ d }: { d: DrawdownData }) {
  if (!d.maxDD) return null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Loss Contributors · worst drawdown</div>
        <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-left">Sector</th><th className="px-4 py-2 text-right">P&L</th><th className="px-4 py-2 text-right">Contribution</th></tr></thead>
          <tbody className="font-mono">{d.byPosition.map((p) => <tr key={p.symbol} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{p.symbol}</td><td className="px-4 py-2 text-left text-slate-400">{p.sector}</td><td className={`px-4 py-2 text-right ${pnlClass(p.pnl)}`}>{fmtSigned(p.pnl, 0)}</td><td className="px-4 py-2 text-right text-rose-300">{Math.abs(p.contribPct).toFixed(0)}%</td></tr>)}</tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Sector Contribution · worst drawdown</div>
        <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Sector</th><th className="px-4 py-2 text-right">P&L</th><th className="px-4 py-2 text-right">Contribution</th></tr></thead>
          <tbody className="font-mono">{d.bySector.map((s) => <tr key={s.sector} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left text-slate-200">{s.sector}</td><td className={`px-4 py-2 text-right ${pnlClass(s.pnl)}`}>{fmtSigned(s.pnl, 0)}</td><td className="px-4 py-2 text-right text-rose-300">{Math.abs(s.contribPct).toFixed(0)}%</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 9/10. Rolling + recovery curve ──────────────────────────────────────────────────────

export function RollingDD({ d }: { d: DrawdownData }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Rolling Drawdown (underwater)</div>
      <div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={d.rolling} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}><XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={30} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} domain={["auto", 0]} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} /><Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(2)}%`, "Drawdown"]} /><Bar dataKey="dd" fill="#f43f5e" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
    </div>
  );
}

export function RecoveryCurve({ d }: { d: DrawdownData }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Recovery Probability Curve</div>
      <div className="mb-2 text-[11px] text-slate-500">Larger losses require disproportionately larger gains to break even</div>
      <div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={d.recoveryCurve} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}><XAxis dataKey="loss" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} /><YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} /><Tooltip contentStyle={TT} formatter={(v) => [`+${Number(v).toFixed(1)}%`, "Recovery Needed"]} labelFormatter={(l) => `Loss ${l}%`} /><Line type="monotone" dataKey="needed" stroke="#fbbf24" strokeWidth={2} dot isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
    </div>
  );
}

// ── 11. Resilience gauge ──────────────────────────────────────────────────────────────────

export function ResilienceGauge({ d }: { d: DrawdownData }) {
  const v = Math.max(0, Math.min(100, d.resilience.total)); const angle = -90 + (v / 100) * 180;
  const color = v >= 75 ? "#10b981" : v >= 60 ? "#22d3ee" : v >= 40 ? "#fbbf24" : "#f43f5e";
  const rad = (angle * Math.PI) / 180; const nx = 100 + 80 * Math.cos(rad), ny = 100 + 80 * Math.sin(rad);
  return (
    <div className="flex items-center gap-6 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <svg width="200" height="120" viewBox="0 0 200 120"><path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" /><path d={`M20,100 A80,80 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" /><text x="100" y="92" textAnchor="middle" fontSize="34" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}</text><text x="100" y="110" textAnchor="middle" fontSize="10" fill="#64748b">resilience</text></svg>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Downside Resilience</div>
        <div className="mb-2 text-lg font-semibold" style={{ color }}>{d.resilience.label}</div>
        {([["Max DD", d.resilience.components.maxdd], ["Avg DD", d.resilience.components.avgdd], ["Recovery", d.resilience.components.recovery], ["Frequency", d.resilience.components.frequency], ["Consistency", d.resilience.components.consistency]] as [string, number][]).map(([l, val]) => (
          <div key={l} className="mb-1"><div className="flex justify-between text-[10px] text-slate-500"><span>{l}</span><span className="font-mono">{val.toFixed(0)}</span></div><div className="h-1.5 w-full rounded bg-white/[0.04]"><div className="h-1.5 rounded bg-cyan-500/60" style={{ width: `${val}%` }} /></div></div>
        ))}
      </div>
    </div>
  );
}
