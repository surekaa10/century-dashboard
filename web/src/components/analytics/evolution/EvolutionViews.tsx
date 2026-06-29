"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DayState, ChangeRow, PeriodAnalysis, EvolutionData } from "@/lib/evolution";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const PALETTE = ["#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24", "#f43f5e", "#22d3ee", "#c084fc", "#94a3b8", "#34d399"];

const actionColor: Record<ChangeRow["action"], string> = {
  "New Position": "bg-emerald-500/15 text-emerald-400",
  Added: "bg-cyan-500/15 text-cyan-300",
  Trimmed: "bg-amber-500/15 text-amber-400",
  "Fully Exited": "bg-rose-500/15 text-rose-400",
  Unchanged: "bg-white/5 text-slate-500",
};

// "2026-06-25" → "25 Jun"
function fmtDay(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// ── 2. Change log ──────────────────────────────────────────────────────────────

export function ChangeLogTable({ rows }: { rows: ChangeRow[] }) {
  const [q, setQ] = useState("");
  const view = rows.filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase()) || r.sector.toLowerCase().includes(q.toLowerCase()));
  const csv = () => {
    const head = "Symbol,Sector,Action,Last Trade,Side,Prev Weight,Curr Weight,Change,Capital Change";
    const body = view.map((r) => [r.symbol, `"${r.sector}"`, `"${r.action}"`, r.lastTradeDate || "", r.lastTradeSide || "", r.prevWeight.toFixed(2), r.currWeight.toFixed(2), r.change.toFixed(2), r.capitalChange.toFixed(0)].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([head + "\n" + body], { type: "text/csv" }));
    a.download = "portfolio_change_log.csv";
    a.click();
  };
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">Portfolio Change Log</span>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40 rounded border border-cyan-500/15 bg-black/20 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40" />
          <button onClick={csv} className="rounded border border-cyan-500/20 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10">↓ CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-left">Action</th>
            <th className="px-4 py-2 text-left">Last Trade</th>
            <th className="px-4 py-2 text-right">Prev</th><th className="px-4 py-2 text-right">Current</th>
            <th className="px-4 py-2 text-right">Change</th><th className="px-4 py-2 text-right">Capital Δ</th>
          </tr></thead>
          <tbody className="font-mono">
            {view.map((r) => (
              <tr key={r.symbol} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 text-left font-sans font-medium text-slate-200">{r.symbol}<span className="ml-2 text-[10px] text-slate-600">{r.sector}</span></td>
                <td className="px-4 py-2 text-left"><span className={`rounded px-2 py-0.5 text-xs ${actionColor[r.action]}`}>{r.action}</span></td>
                <td className="px-4 py-2 text-left text-slate-400">
                  {r.lastTradeDate ? (
                    <>
                      {fmtDay(r.lastTradeDate)}
                      <span className={`ml-1.5 text-[10px] font-semibold ${r.lastTradeSide === "sell" ? "text-rose-400" : "text-emerald-400"}`}>
                        {r.lastTradeSide === "sell" ? "SELL" : "BUY"}
                      </span>
                    </>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-2 text-right text-slate-400">{r.prevWeight.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right text-slate-300">{r.currWeight.toFixed(1)}%</td>
                <td className={`px-4 py-2 text-right font-semibold ${pnlClass(r.change)}`}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</td>
                <td className={`px-4 py-2 text-right ${pnlClass(r.capitalChange)}`}>{fmtSigned(r.capitalChange, 0)}</td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No changes in this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 3. Weight history ──────────────────────────────────────────────────────────

export function WeightHistory({ states }: { states: DayState[] }) {
  const [topN, setTopN] = useState(10);
  const { keys, rows } = useMemo(() => {
    const last = states[states.length - 1];
    const keys = Object.entries(last?.weights ?? {}).sort((a, b) => b[1] - a[1]).slice(0, topN).map((x) => x[0]);
    const rows = states.map((s) => {
      const row: { date: string; [k: string]: number | string } = { date: s.date.slice(5) };
      for (const k of keys) row[k] = +(s.weights[k] ?? 0).toFixed(2);
      return row;
    });
    return { keys, rows };
  }, [states, topN]);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Holding Weight Evolution</div>
        <div className="flex gap-1">
          {[10, 20].map((n) => (
            <button key={n} onClick={() => setTopN(n)} className={`rounded px-2 py-0.5 text-xs ${topN === n ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>Top {n}</button>
          ))}
        </div>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n)]} />
            {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 4. Conviction tables ──────────────────────────────────────────────────────────

function ConvTable({ title, rows, accent }: { title: string; rows: ChangeRow[]; accent: string }) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className={`mb-2 text-sm font-semibold ${accent}`}>{title}</div>
      <table className="w-full text-sm font-mono">
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-white/[0.04]">
              <td className="py-1.5 text-left font-sans text-slate-200">{r.symbol}</td>
              <td className="py-1.5 text-right text-slate-400">{r.prevWeight.toFixed(1)}% → {r.currWeight.toFixed(1)}%</td>
              <td className={`py-1.5 pl-3 text-right font-semibold ${pnlClass(r.change)}`}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%</td>
              <td className={`py-1.5 pl-3 text-right ${pnlClass(r.capitalChange)}`}>{fmtSigned(r.capitalChange, 0)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="py-4 text-center text-slate-500">None</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ConvictionTables({ up, down }: { up: ChangeRow[]; down: ChangeRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ConvTable title="Largest Weight Increases (growing conviction)" rows={up} accent="text-emerald-400" />
      <ConvTable title="Largest Weight Reductions (declining conviction)" rows={down} accent="text-rose-400" />
    </div>
  );
}

// ── 5. New positions & exits ──────────────────────────────────────────────────────

export function NewExits({ analysis }: { analysis: PeriodAnalysis }) {
  const { newPositions, exits } = analysis;
  const avgHold = exits.length ? exits.reduce((s, e) => s + e.holdingDays, 0) / exits.length : 0;
  const avgRet = exits.length ? exits.reduce((s, e) => s + e.finalReturn, 0) / exits.length : 0;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-2 text-sm font-semibold text-emerald-400">New Positions <span className="text-slate-500">({newPositions.length})</span></div>
        <table className="w-full text-sm font-mono">
          <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left">Sym</th><th className="text-right">Entry</th><th className="text-right">Init Wt</th><th className="text-right">Curr Wt</th><th className="text-right">P&L</th></tr></thead>
          <tbody>
            {newPositions.map((p) => (
              <tr key={p.symbol} className="border-t border-white/[0.04]">
                <td className="py-1.5 text-left font-sans text-slate-200">{p.symbol}</td>
                <td className="py-1.5 text-right text-slate-400">{p.entryDate.slice(5)}</td>
                <td className="py-1.5 text-right text-slate-400">{p.initialWeight.toFixed(1)}%</td>
                <td className="py-1.5 text-right text-slate-300">{p.currentWeight.toFixed(1)}%</td>
                <td className={`py-1.5 text-right ${pnlClass(p.pnl)}`}>{fmtSigned(p.pnl, 0)}</td>
              </tr>
            ))}
            {newPositions.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">None this period</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-400">Fully Exited <span className="text-slate-500">({exits.length})</span></span>
          {exits.length > 0 && <span className="text-[10px] text-slate-500">avg hold {avgHold.toFixed(0)}d · avg ret {fmtPct(avgRet)}</span>}
        </div>
        <table className="w-full text-sm font-mono">
          <thead><tr className="text-[10px] uppercase text-slate-500"><th className="text-left">Sym</th><th className="text-right">Exit</th><th className="text-right">Return</th><th className="text-right">Hold</th><th className="text-right">Realized</th></tr></thead>
          <tbody>
            {exits.map((e) => (
              <tr key={e.symbol} className="border-t border-white/[0.04]">
                <td className="py-1.5 text-left font-sans text-slate-200">{e.symbol}</td>
                <td className="py-1.5 text-right text-slate-400">{e.exitDate.slice(5)}</td>
                <td className={`py-1.5 text-right ${pnlClass(e.finalReturn)}`}>{fmtPct(e.finalReturn)}</td>
                <td className="py-1.5 text-right text-slate-400">{e.holdingDays}d</td>
                <td className={`py-1.5 text-right ${pnlClass(e.realizedPnl)}`}>{fmtSigned(e.realizedPnl, 0)}</td>
              </tr>
            ))}
            {exits.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No exits this period</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 6. Capital flow ───────────────────────────────────────────────────────────────

export function CapitalFlow({ bySector }: { bySector: { key: string; added: number; removed: number; net: number }[] }) {
  // waterfall by sector net
  const wf = useMemo(() => {
    let run = 0;
    const steps = bySector.map((s) => {
      const start = run;
      run += s.net;
      return { name: s.key, base: Math.min(start, run), delta: Math.abs(s.net), net: s.net };
    });
    steps.push({ name: "Net", base: 0, delta: Math.abs(run), net: run });
    return steps;
  }, [bySector]);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Capital Flow by Sector</div>
      <div className="mb-2 text-[11px] text-slate-500">Net capital added (green) / removed (red) — waterfall to net flow</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={wf} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={TT} formatter={(_v, _n, item) => { const p = (item as { payload?: { net: number } } | undefined)?.payload; return [p ? fmtSigned(p.net, 0) : "", "Net"]; }} />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {wf.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#10b981" : "#f43f5e"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 8. Sector rotation ──────────────────────────────────────────────────────────────

export function SectorRotation({ states }: { states: DayState[] }) {
  const { keys, rows } = useMemo(() => {
    const ks = new Set<string>();
    for (const s of states) for (const k of Object.keys(s.sectorWeights)) ks.add(k);
    const keys = [...ks];
    const rows = states.map((s) => {
      const row: { date: string; [k: string]: number | string } = { date: s.date.slice(5) };
      for (const k of keys) row[k] = +(s.sectorWeights[k] ?? 0).toFixed(2);
      return row;
    });
    return { keys, rows };
  }, [states]);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Sector Rotation</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} stackOffset="expand">
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n)]} />
            {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.55} isAnimationActive={false} />)}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 9. Concentration evolution ────────────────────────────────────────────────────

export function ConcentrationEvolution({ states }: { states: DayState[] }) {
  const rows = states.map((s) => ({ date: s.date.slice(5), top5: +s.top5.toFixed(1), top10: +s.top10.toFixed(1), effN: +s.effN.toFixed(1) }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-1 text-[11px] text-slate-500">Top 5 / Top 10 Weight %</div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
              <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n) === "top5" ? "Top 5" : "Top 10"]} />
              <Line type="monotone" dataKey="top5" stroke="#f43f5e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="top10" stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-1 text-[11px] text-slate-500">Effective Number of Holdings</div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={TT} formatter={(v) => [Number(v).toFixed(1), "Eff. N"]} />
              <Line type="monotone" dataKey="effN" stroke="#38bdf8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── 10. Lifecycle ──────────────────────────────────────────────────────────────────

export function LifecycleTable({ data }: { data: EvolutionData }) {
  const rows = useMemo(() => {
    return data.symbols.map((s) => {
      let peak = 0, sum = 0, cnt = 0;
      for (const st of data.states) {
        const w = st.weights[s.symbol];
        if (w !== undefined && w > 0) { peak = Math.max(peak, w); sum += w; cnt++; }
      }
      const curr = data.states[data.states.length - 1]?.weights[s.symbol] ?? 0;
      const holdEnd = s.exited ? s.exitDate : data.dates[data.dates.length - 1];
      const hold = Math.round((new Date(holdEnd).getTime() - new Date(s.firstBuy).getTime()) / 86400000);
      return {
        symbol: s.symbol, sector: s.sector, entry: s.firstBuy, hold,
        avgW: cnt ? sum / cnt : 0, peakW: peak, currW: curr,
        unrealized: data.currentPnlPctBySym[s.symbol] ?? 0, exited: s.exited,
      };
    }).sort((a, b) => b.currW - a.currW);
  }, [data]);

  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Position Lifecycle</div>
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
          <th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-left">Entry</th>
          <th className="px-4 py-2 text-right">Hold (d)</th><th className="px-4 py-2 text-right">Avg Wt</th>
          <th className="px-4 py-2 text-right">Peak Wt</th><th className="px-4 py-2 text-right">Curr Wt</th>
          <th className="px-4 py-2 text-right">Unreal. Ret</th><th className="px-4 py-2 text-left">Status</th>
        </tr></thead>
        <tbody className="font-mono">
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-white/[0.04]">
              <td className="px-4 py-2 text-left font-sans text-slate-200">{r.symbol}<span className="ml-2 text-[10px] text-slate-600">{r.sector}</span></td>
              <td className="px-4 py-2 text-left text-slate-400">{r.entry.slice(5)}</td>
              <td className="px-4 py-2 text-right text-slate-400">{r.hold}</td>
              <td className="px-4 py-2 text-right text-slate-400">{r.avgW.toFixed(1)}%</td>
              <td className="px-4 py-2 text-right text-slate-300">{r.peakW.toFixed(1)}%</td>
              <td className="px-4 py-2 text-right text-slate-200">{r.currW.toFixed(1)}%</td>
              <td className={`px-4 py-2 text-right ${pnlClass(r.unrealized)}`}>{fmtPct(r.unrealized)}</td>
              <td className="px-4 py-2 text-left">{r.exited ? <span className="text-rose-400">Exited</span> : <span className="text-emerald-400">Open</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
