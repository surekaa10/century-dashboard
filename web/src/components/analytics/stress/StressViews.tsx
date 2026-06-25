"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StressData, StressModel, Shocks } from "@/lib/stress";
import { applyShocks } from "@/lib/stress";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const ZERO: Shocks = { mkt: 0, bonds: 0, vix: 0, oil: 0, gold: 0, dxy: 0, growth: 0, momentum: 0 };

const sevColor: Record<string, string> = { Severe: "bg-rose-500/20 text-rose-400", High: "bg-rose-500/15 text-rose-300", Moderate: "bg-amber-500/15 text-amber-400", Mild: "bg-emerald-500/15 text-emerald-400" };
function heat(v: number): string { if (v >= 0) return `rgba(16,185,129,${(0.15 + Math.min(0.7, v / 15)).toFixed(2)})`; return `rgba(244,63,94,${(0.15 + Math.min(0.7, -v / 25)).toFixed(2)})`; }

// ── Historical scenarios ─────────────────────────────────────────────────────────

export function HistoricalTable({ d }: { d: StressData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
          <th className="px-4 py-2 text-left">Scenario</th><th className="px-4 py-2 text-right">Est. Return</th><th className="px-4 py-2 text-right">Est. Loss</th>
          <th className="px-4 py-2 text-left">Worst Position</th><th className="px-4 py-2 text-left">Worst Sector</th><th className="px-4 py-2 text-center">Severity</th>
        </tr></thead>
        <tbody className="font-mono">
          {d.historical.map((s) => (
            <tr key={s.name} className="border-t border-white/[0.04]">
              <td className="px-4 py-2 text-left font-sans text-slate-200">{s.name}</td>
              <td className={`px-4 py-2 text-right font-semibold ${pnlClass(s.portRet)}`}>{fmtPct(s.portRet * 100)}</td>
              <td className={`px-4 py-2 text-right ${pnlClass(s.loss)}`}>{fmtSigned(s.loss, 0)}</td>
              <td className="px-4 py-2 text-left text-rose-400/80">{s.worstPos}</td>
              <td className="px-4 py-2 text-left text-rose-400/80">{s.worstSector}</td>
              <td className="px-4 py-2 text-center"><span className={`rounded px-2 py-0.5 text-xs ${sevColor[s.severity]}`}>{s.severity}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScenarioRanking({ d }: { d: StressData }) {
  const data = d.historical.map((s) => ({ name: s.name.replace(/\s\d{4}.*/, ""), v: +(s.portRet * 100).toFixed(1) }));
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Top Historical Threats</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 40, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={130} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Impact"]} />
            <Bar dataKey="v" radius={[0, 3, 3, 0]} isAnimationActive={false}>{data.map((x, i) => <Cell key={i} fill={x.v < -15 ? "#f43f5e" : x.v < -7 ? "#fb923c" : "#fbbf24"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Replay engine (stylized crisis path) ─────────────────────────────────────────────

export function ReplayEngine({ d }: { d: StressData }) {
  const [sel, setSel] = useState(d.historical[0]?.name ?? "");
  const sc = d.historical.find((s) => s.name === sel) ?? d.historical[0];
  const rec = d.recovery.find((r) => r.name === sel);
  const path = useMemo(() => {
    if (!sc) return [];
    const trough = sc.portRet; // negative
    const pts: { t: string; v: number }[] = [];
    const downDays = 22, upDays = 40;
    for (let i = 0; i <= downDays; i++) pts.push({ t: `D${i}`, v: +(100 * (1 + trough * (i / downDays))).toFixed(1) });
    for (let i = 1; i <= upDays; i++) pts.push({ t: `D${downDays + i}`, v: +(100 * (1 + trough * (1 - i / upDays))).toFixed(1) });
    return pts;
  }, [sc]);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Historical Replay <span className="text-[11px] text-slate-500">(stylized path · factor-based trough)</span></div>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-cyan-500/20 bg-black/30 px-2 py-1 text-xs text-slate-200">
          {d.historical.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={path} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs><linearGradient id="cr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25} /><stop offset="100%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="t" tick={{ fill: "#64748b", fontSize: 8 }} minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} domain={["auto", 100]} tickFormatter={(v) => `${v}`} />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v).toFixed(1)}`, "Index (start=100)"]} />
            <Area type="monotone" dataKey="v" stroke="#f43f5e" strokeWidth={2} fill="url(#cr)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5 text-center text-xs">
        <Stat label="Max Drawdown" v={fmtPct((sc?.portRet ?? 0) * 100)} cls="text-rose-400" />
        <Stat label="Recovery Needed" v={fmtPct((rec?.recoveryNeeded ?? 0) * 100)} cls="text-amber-400" />
        <Stat label="Recovery Time" v={`${rec?.months ?? 0} mo`} />
        <Stat label="Worst Day (obs.)" v={fmtPct(d.worstObserved.worstDay * 100)} cls="text-rose-400" />
        <Stat label="Worst Week (obs.)" v={fmtPct(d.worstObserved.worstWeek * 100)} cls="text-rose-400" />
      </div>
    </div>
  );
}
function Stat({ label, v, cls = "text-slate-200" }: { label: string; v: string; cls?: string }) {
  return <div className="rounded bg-white/[0.02] p-2"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className={`font-mono ${cls}`}>{v}</div></div>;
}

// ── Position & sector stress (worst scenario) ──────────────────────────────────────────

export function PositionStress({ d }: { d: StressData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Top Loss Contributors <span className="text-slate-500">· {d.worst?.name}</span></div>
      <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-left">Sector</th><th className="px-4 py-2 text-right">Stress Return</th><th className="px-4 py-2 text-right">Stress Loss</th><th className="px-4 py-2 text-right">Contribution</th></tr></thead>
        <tbody className="font-mono">{d.worstPositions.map((p) => (
          <tr key={p.symbol} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{p.symbol}</td><td className="px-4 py-2 text-left text-slate-400">{p.sector}</td><td className={`px-4 py-2 text-right ${pnlClass(p.ret)}`}>{fmtPct(p.ret * 100)}</td><td className={`px-4 py-2 text-right ${pnlClass(p.loss)}`}>{fmtSigned(p.loss, 0)}</td><td className="px-4 py-2 text-right text-rose-300">{Math.abs(p.contribPct).toFixed(1)}%</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function SectorStressHeatmap({ d }: { d: StressData }) {
  const short = (n: string) => n.replace(/\s\d{4}.*/, "").replace("Crisis", "").slice(0, 10);
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Sector Stress Heatmap <span className="text-[11px] text-slate-500">(estimated sector return %)</span></div>
      <table className="border-collapse text-[10px]">
        <thead><tr><th className="p-1 text-left text-slate-500">Sector</th>{d.scenarioNames.map((s) => <th key={s} className="p-1 text-slate-500" style={{ writingMode: "vertical-rl" }}>{short(s)}</th>)}</tr></thead>
        <tbody className="font-mono">{d.sectorByScenario.map((row) => (
          <tr key={row.sector}><td className="whitespace-nowrap p-1 text-right font-sans text-slate-300">{row.sector}</td>{d.scenarioNames.map((s) => <td key={s} title={`${row.sector} · ${s}: ${row.values[s].toFixed(1)}%`} className="h-7 w-12 text-center text-slate-100" style={{ background: heat(row.values[s]) }}>{row.values[s].toFixed(0)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── Custom scenario builder ───────────────────────────────────────────────────────────

const FIELDS: { key: string; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "sp", label: "S&P 500", min: -40, max: 20, step: 1, unit: "%" },
  { key: "nasdaq", label: "Nasdaq", min: -40, max: 20, step: 1, unit: "%" },
  { key: "vix", label: "VIX", min: -50, max: 200, step: 5, unit: "%" },
  { key: "oil", label: "Oil", min: -60, max: 60, step: 5, unit: "%" },
  { key: "gold", label: "Gold", min: -30, max: 30, step: 1, unit: "%" },
  { key: "dxy", label: "DXY", min: -15, max: 15, step: 1, unit: "%" },
  { key: "rates", label: "Rates", min: -150, max: 200, step: 25, unit: "bp" },
];

export function CustomBuilder({ model }: { model: StressModel }) {
  const [v, setV] = useState<Record<string, number>>({ sp: -10, nasdaq: -15, vix: 40, oil: 0, gold: 0, dxy: 0, rates: 0 });
  const shocks: Shocks = { ...ZERO, mkt: v.sp / 100, growth: (v.nasdaq - v.sp) / 100, vix: v.vix / 100, oil: v.oil / 100, gold: v.gold / 100, dxy: v.dxy / 100, bonds: -(v.rates / 100) * 0.1 };
  const out = useMemo(() => applyShocks(model, shocks), [model, v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Custom Scenario Builder</div>
        {FIELDS.map((f) => (
          <div key={f.key} className="mb-2.5">
            <div className="mb-1 flex justify-between text-[11px]"><span className="text-slate-400">{f.label}</span><span className="font-mono text-slate-200">{v[f.key] >= 0 ? "+" : ""}{v[f.key]}{f.unit}</span></div>
            <input type="range" min={f.min} max={f.max} step={f.step} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: +e.target.value })} className="w-full accent-cyan-400" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Estimated Impact</div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="rounded bg-white/[0.02] p-3"><div className="text-[10px] uppercase text-slate-500">Portfolio Impact</div><div className={`font-mono text-2xl ${pnlClass(out.portRet)}`}>{fmtPct(out.portRet * 100)}</div></div>
          <div className="rounded bg-white/[0.02] p-3"><div className="text-[10px] uppercase text-slate-500">P&L</div><div className={`font-mono text-2xl ${pnlClass(out.loss)}`}>{fmtSigned(out.loss, 0)}</div></div>
        </div>
        <div className="text-[11px] uppercase text-slate-500">Worst positions</div>
        <div className="mt-1 space-y-1 font-mono text-xs">
          {[...out.positions].sort((a, b) => a.loss - b.loss).slice(0, 5).map((p) => (
            <div key={p.symbol} className="flex justify-between"><span className="font-sans text-slate-300">{p.symbol}</span><span className={pnlClass(p.ret)}>{fmtPct(p.ret * 100)} · {fmtSigned(p.loss, 0)}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Factor shock ────────────────────────────────────────────────────────────────────────

const FFIELDS: { key: keyof Shocks; label: string; min: number; max: number }[] = [
  { key: "mkt", label: "Market Beta", min: -30, max: 15 }, { key: "growth", label: "Growth Factor", min: -30, max: 15 },
  { key: "momentum", label: "Momentum", min: -30, max: 15 }, { key: "vix", label: "Volatility (VIX)", min: -50, max: 150 }, { key: "bonds", label: "Bonds (Rates)", min: -20, max: 20 },
];
export function FactorShock({ model }: { model: StressModel }) {
  const [v, setV] = useState<Record<string, number>>({ mkt: 0, growth: -20, momentum: -15, vix: 0, bonds: 0 });
  const shocks: Shocks = { ...ZERO, mkt: v.mkt / 100, growth: v.growth / 100, momentum: v.momentum / 100, vix: v.vix / 100, bonds: v.bonds / 100 };
  const out = useMemo(() => applyShocks(model, shocks), [model, v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-3 text-sm font-semibold text-slate-200">Factor Shock</div>
        {FFIELDS.map((f) => (
          <div key={f.key} className="mb-2.5">
            <div className="mb-1 flex justify-between text-[11px]"><span className="text-slate-400">{f.label}</span><span className="font-mono text-slate-200">{v[f.key] >= 0 ? "+" : ""}{v[f.key]}%</span></div>
            <input type="range" min={f.min} max={f.max} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: +e.target.value })} className="w-full accent-cyan-400" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 flex flex-col justify-center">
        <div className="text-[10px] uppercase text-slate-500">Estimated Portfolio Impact</div>
        <div className={`font-mono text-4xl font-semibold ${pnlClass(out.portRet)}`}>{fmtPct(out.portRet * 100)}</div>
        <div className={`mt-1 font-mono text-lg ${pnlClass(out.loss)}`}>{fmtSigned(out.loss, 0)}</div>
      </div>
    </div>
  );
}

// ── Monte Carlo ──────────────────────────────────────────────────────────────────────────

export function MonteCarlo({ d }: { d: StressData }) {
  const mc = d.monteCarlo;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Monte-Carlo Stress Simulation <span className="text-[11px] text-slate-500">(8,000 sims · {mc.horizonDays}-day · stressed vol)</span></div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mc.hist} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
            <XAxis dataKey="x" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(v) => `${v}%`} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={32} />
            <ReferenceLine x={+(mc.var95 * 100).toFixed(1)} stroke="#fbbf24" strokeDasharray="3 3" />
            <ReferenceLine x={+(mc.var99 * 100).toFixed(1)} stroke="#f43f5e" strokeDasharray="3 3" />
            <Tooltip contentStyle={TT} formatter={(v) => [v, "sims"]} labelFormatter={(l) => `${l}% return`} />
            <Bar dataKey="n" isAnimationActive={false}>{mc.hist.map((b, i) => <Cell key={i} fill={b.x < mc.var99 * 100 ? "#f43f5e" : b.x < mc.var95 * 100 ? "#fb923c" : "#38bdf8"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 text-center text-xs">
        <Stat label="Mean" v={fmtPct(mc.mean * 100)} />
        <Stat label="95% Stress VaR" v={fmtPct(mc.var95 * 100)} cls="text-amber-400" />
        <Stat label="99% Stress VaR" v={fmtPct(mc.var99 * 100)} cls="text-rose-400" />
        <Stat label="Expected Shortfall" v={fmtPct(mc.es * 100)} cls="text-rose-400" />
      </div>
    </div>
  );
}

// ── Recovery + vulnerability + resilience gauge ──────────────────────────────────────────

export function RecoveryTable({ d }: { d: StressData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="px-4 py-2 text-left">Scenario</th><th className="px-4 py-2 text-right">Max Drawdown</th><th className="px-4 py-2 text-right">Recovery Needed</th><th className="px-4 py-2 text-right">Recovery Time</th></tr></thead>
        <tbody className="font-mono">{d.recovery.map((r) => (
          <tr key={r.name} className="border-t border-white/[0.04]"><td className="px-4 py-2 text-left font-sans text-slate-200">{r.name}</td><td className={`px-4 py-2 text-right ${pnlClass(r.dd)}`}>{fmtPct(r.dd * 100)}</td><td className="px-4 py-2 text-right text-amber-400">{fmtPct(r.recoveryNeeded * 100)}</td><td className="px-4 py-2 text-right text-slate-300">{r.months} mo</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function VulnerabilityMap({ d }: { d: StressData }) {
  const sectors = [...new Set(d.vulnerability.flatMap((r) => r.sectors.map((s) => s.sector)))].slice(0, 8);
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Vulnerability Map <span className="text-[11px] text-slate-500">(estimated % impact)</span></div>
      <table className="border-collapse text-[10px]">
        <thead><tr><th className="p-1 text-left text-slate-500">Shock</th><th className="p-1 text-slate-400">Portfolio</th>{sectors.map((s) => <th key={s} className="p-1 text-slate-500" style={{ writingMode: "vertical-rl" }}>{s}</th>)}</tr></thead>
        <tbody className="font-mono">{d.vulnerability.map((row) => (
          <tr key={row.factor}><td className="whitespace-nowrap p-1 text-right font-sans text-slate-300">{row.factor}</td>
            <td className="h-7 w-14 text-center font-semibold text-slate-100" style={{ background: heat(row.portfolio) }}>{row.portfolio.toFixed(1)}</td>
            {sectors.map((s) => { const v = row.sectors.find((x) => x.sector === s)?.v ?? 0; return <td key={s} title={`${row.factor} · ${s}: ${v.toFixed(1)}%`} className="h-7 w-12 text-center text-slate-100" style={{ background: heat(v) }}>{v.toFixed(0)}</td>; })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function ResilienceGauge({ total, label }: { total: number; label: string }) {
  const v = Math.max(0, Math.min(100, total));
  const angle = -90 + (v / 100) * 180;
  const color = v >= 75 ? "#10b981" : v >= 60 ? "#22d3ee" : v >= 40 ? "#fbbf24" : "#f43f5e";
  const rad = (angle * Math.PI) / 180; const nx = 100 + 80 * Math.cos(rad), ny = 100 + 80 * Math.sin(rad);
  return (
    <div className="flex items-center gap-6 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round" />
        <path d={`M20,100 A80,80 0 0,1 ${nx.toFixed(1)},${ny.toFixed(1)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
        <text x="100" y="92" textAnchor="middle" fontSize="34" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{v.toFixed(0)}</text>
        <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#64748b">resilience</text>
      </svg>
      <div><div className="text-[11px] uppercase tracking-wider text-slate-500">Portfolio Resilience</div><div className="text-lg font-semibold" style={{ color }}>{label}</div></div>
    </div>
  );
}
