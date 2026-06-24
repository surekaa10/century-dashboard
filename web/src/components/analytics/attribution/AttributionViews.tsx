"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import type { ContributionData, PosContrib, SectorAttr } from "@/lib/attribution";
import { groupCumulative, periodReturn } from "@/lib/attribution";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const GREEN = "#10b981";
const RED = "#f43f5e";
const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const PALETTE = ["#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24", "#f43f5e", "#22d3ee", "#c084fc", "#94a3b8"];

// ── 1. Position Attribution table ───────────────────────────────────────────────

type Key = "symbol" | "sector" | "weight" | "returnPct" | "contribPct" | "contribUsd" | "marketValue";

export function PositionAttributionTable({ rows }: { rows: PosContrib[] }) {
  const [sortKey, setSortKey] = useState<Key>("contribUsd");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");

  const view = useMemo(() => {
    const f = rows.filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase()) || r.sector.toLowerCase().includes(q.toLowerCase()));
    return [...f].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
  }, [rows, q, sortKey, asc]);

  const ranked = [...rows].sort((a, b) => b.contribUsd - a.contribUsd);
  const rankOf = (s: string) => ranked.findIndex((r) => r.symbol === s) + 1;

  const cols: { k: Key; label: string; num: boolean }[] = [
    { k: "symbol", label: "Symbol", num: false },
    { k: "sector", label: "Sector", num: false },
    { k: "weight", label: "Weight %", num: true },
    { k: "returnPct", label: "Return %", num: true },
    { k: "contribPct", label: "Contrib %", num: true },
    { k: "contribUsd", label: "Contrib $", num: true },
    { k: "marketValue", label: "Market Value", num: true },
  ];

  const csv = () => {
    const head = ["Rank", ...cols.map((c) => c.label)].join(",");
    const body = view.map((r) => [rankOf(r.symbol), r.symbol, `"${r.sector}"`, r.weight.toFixed(2), r.returnPct.toFixed(2), r.contribPct.toFixed(3), r.contribUsd.toFixed(2), r.marketValue.toFixed(2)].join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "position_attribution.csv";
    a.click();
  };

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">Position Attribution</span>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="w-40 rounded border border-cyan-500/15 bg-black/20 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40" />
          <button onClick={csv} className="rounded border border-cyan-500/20 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10">↓ CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-right">#</th>
              {cols.map((c) => (
                <th key={c.k} onClick={() => (c.k === sortKey ? setAsc(!asc) : (setSortKey(c.k), setAsc(false)))}
                  className={`cursor-pointer select-none px-3 py-2 ${c.num ? "text-right" : "text-left"} hover:text-slate-300`}>
                  {c.label}{sortKey === c.k ? (asc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {view.map((r) => (
              <tr key={r.symbol} className="border-t border-white/[0.04]">
                <td className="px-3 py-2 text-right text-slate-500">{rankOf(r.symbol)}</td>
                <td className="px-3 py-2 text-left font-sans font-medium text-slate-200">{r.symbol}</td>
                <td className="px-3 py-2 text-left text-slate-400">{r.sector}</td>
                <td className="px-3 py-2 text-right text-slate-300">{r.weight.toFixed(2)}%</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.returnPct)}`}>{fmtPct(r.returnPct)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.contribPct)}`}>{r.contribPct.toFixed(3)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${pnlClass(r.contribUsd)}`}>{fmtSigned(r.contribUsd, 0)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtMoney(r.marketValue, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Contributors & Detractors ─────────────────────────────────────────────────

function BarPanel({ title, items, accent }: { title: string; items: PosContrib[]; accent: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.contribUsd)), 1);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className={`mb-2 text-sm font-semibold ${accent}`}>{title}</div>
      <table className="w-full text-sm">
        <tbody className="font-mono">
          {items.map((r) => (
            <tr key={r.symbol} className="border-t border-white/[0.04]">
              <td className="py-1.5 pr-2 text-left font-sans text-slate-200">{r.symbol}</td>
              <td className="w-1/2 px-2">
                <div className="h-2 w-full rounded bg-white/[0.03]">
                  <div className="h-2 rounded" style={{ width: `${(Math.abs(r.contribUsd) / max) * 100}%`, background: r.contribUsd >= 0 ? GREEN : RED }} />
                </div>
              </td>
              <td className={`py-1.5 pl-2 text-right ${pnlClass(r.contribPct)}`}>{r.contribPct.toFixed(2)}%</td>
              <td className={`py-1.5 pl-3 text-right ${pnlClass(r.contribUsd)}`}>{fmtSigned(r.contribUsd, 0)}</td>
              <td className={`py-1.5 pl-3 text-right ${pnlClass(r.returnPct)}`}>{fmtPct(r.returnPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContributorsDetractors({ rows }: { rows: PosContrib[] }) {
  const sorted = [...rows].sort((a, b) => b.contribUsd - a.contribUsd);
  const top = sorted.slice(0, 10);
  const bottom = sorted.filter((r) => r.contribUsd < 0).slice(-10).reverse();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BarPanel title="Top 10 Contributors" items={top} accent="text-emerald-400" />
      <BarPanel title="Top 10 Detractors" items={bottom.length ? bottom : sorted.slice(-10).reverse()} accent="text-rose-400" />
    </div>
  );
}

// ── 2. Sector Attribution ──────────────────────────────────────────────────────

export function SectorAttributionSection({ sectors }: { sectors: SectorAttr[] }) {
  const barData = [...sectors].sort((a, b) => a.contribUsd - b.contribUsd).map((s) => ({ name: s.sector, v: +s.contribUsd.toFixed(0) }));
  const bubble = sectors.map((s) => ({ x: +s.weight.toFixed(2), y: +s.returnPct.toFixed(2), z: Math.abs(s.contribUsd) + 1, name: s.sector, contrib: s.contribUsd }));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 text-left">Sector</th>
              <th className="px-4 py-2 text-right">Weight %</th>
              <th className="px-4 py-2 text-right">Return %</th>
              <th className="px-4 py-2 text-right">Contrib %</th>
              <th className="px-4 py-2 text-right">Contrib $</th>
              <th className="px-4 py-2 text-right"># Holdings</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sectors.map((s) => (
              <tr key={s.sector} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 text-left font-sans text-slate-200">{s.sector}</td>
                <td className="px-4 py-2 text-right text-slate-300">{s.weight.toFixed(1)}%</td>
                <td className={`px-4 py-2 text-right ${pnlClass(s.returnPct)}`}>{fmtPct(s.returnPct)}</td>
                <td className={`px-4 py-2 text-right ${pnlClass(s.contribPct)}`}>{s.contribPct.toFixed(3)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${pnlClass(s.contribUsd)}`}>{fmtSigned(s.contribUsd, 0)}</td>
                <td className="px-4 py-2 text-right text-slate-400">{s.holdings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-1 text-[11px] text-slate-500">Sector Contribution ($) — gains right, losses left</div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 30, right: 16, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={90} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
                <Tooltip contentStyle={TT} formatter={(v) => [`$${fmtMoney(Number(v), 0)}`, "Contribution"]} />
                <Bar dataKey="v" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                  {barData.map((d, i) => <Cell key={i} fill={d.v >= 0 ? GREEN : RED} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-1 text-[11px] text-slate-500">Sector Return vs Weight (bubble = |contribution|)</div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 16 }}>
                <XAxis type="number" dataKey="x" name="Weight" unit="%" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false}
                  label={{ value: "Weight %", position: "insideBottom", offset: -4, fill: "#64748b", fontSize: 10 }} />
                <YAxis type="number" dataKey="y" name="Return" unit="%" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
                <ZAxis type="number" dataKey="z" range={[60, 600]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Tooltip contentStyle={TT} cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v, n) => [String(v), String(n)]}
                  labelFormatter={() => ""} />
                <Scatter data={bubble} isAnimationActive={false}>
                  {bubble.map((d, i) => <Cell key={i} fill={d.contrib >= 0 ? GREEN : RED} fillOpacity={0.6} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 3. Time Attribution ────────────────────────────────────────────────────────

function bestWorstOver(d: ContributionData, lookback: number): { best: string; worst: string } {
  const n = d.dates.length;
  const start = Math.max(0, n - lookback);
  let best = { sym: "—", v: -Infinity };
  let worst = { sym: "—", v: Infinity };
  for (const p of d.perPosition) {
    const c = p.cum[n - 1] - p.cum[start];
    if (c > best.v) best = { sym: p.symbol, v: c };
    if (c < worst.v) worst = { sym: p.symbol, v: c };
  }
  return { best: best.sym, worst: worst.sym };
}

export function TimeAttribution({ data }: { data: ContributionData }) {
  const periods: { label: string; key: "daily" | "weekly" | "monthly" | "quarterly"; lb: number }[] = [
    { label: "Daily", key: "daily", lb: 1 },
    { label: "Weekly", key: "weekly", lb: 5 },
    { label: "Monthly", key: "monthly", lb: 21 },
    { label: "Quarterly", key: "quarterly", lb: 63 },
  ];
  const incep = periodReturn(data, "inception");

  // daily return heatmap cells
  const cells = data.dates.map((date, i) => {
    const base = data.mvSeries[Math.max(0, i - 1)] || data.baseValue || 1;
    const ret = i === 0 ? 0 : (data.portfolioDaily[i] / base) * 100;
    return { date, ret };
  });
  const maxAbs = Math.max(...cells.map((c) => Math.abs(c.ret)), 0.5);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 text-left">Period</th>
              <th className="px-4 py-2 text-right">Return %</th>
              <th className="px-4 py-2 text-right">Contribution $</th>
              <th className="px-4 py-2 text-right">Cumulative %</th>
              <th className="px-4 py-2 text-left">Best</th>
              <th className="px-4 py-2 text-left">Worst</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {periods.map((p) => {
              const r = periodReturn(data, p.key);
              const bw = bestWorstOver(data, p.lb);
              return (
                <tr key={p.key} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2 text-left font-sans text-slate-200">{p.label}</td>
                  <td className={`px-4 py-2 text-right ${pnlClass(r.ret)}`}>{fmtPct(r.ret)}</td>
                  <td className={`px-4 py-2 text-right ${pnlClass(r.contrib)}`}>{fmtSigned(r.contrib, 0)}</td>
                  <td className={`px-4 py-2 text-right ${pnlClass(incep.ret)}`}>{fmtPct(incep.ret)}</td>
                  <td className="px-4 py-2 text-left text-emerald-400/80">{bw.best}</td>
                  <td className="px-4 py-2 text-left text-rose-400/80">{bw.worst}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-2 text-[11px] text-slate-500">Daily Contribution Heatmap (portfolio daily return)</div>
        <div className="flex flex-wrap gap-1">
          {cells.map((c) => (
            <div key={c.date} title={`${c.date}: ${fmtPct(c.ret)}`}
              className="h-6 w-6 rounded-sm"
              style={{ background: c.ret === 0 ? "rgba(255,255,255,0.03)" : c.ret > 0 ? `rgba(16,185,129,${(0.2 + 0.7 * Math.min(1, Math.abs(c.ret) / maxAbs)).toFixed(2)})` : `rgba(244,63,94,${(0.2 + 0.7 * Math.min(1, Math.abs(c.ret) / maxAbs)).toFixed(2)})` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 4. Cumulative Decomposition + Rolling ────────────────────────────────────────

export function CumulativeDecomposition({ data }: { data: ContributionData }) {
  const [by, setBy] = useState<"symbol" | "sector" | "assetClass">("sector");
  const { keys, rows } = useMemo(() => groupCumulative(data, by, 8), [data, by]);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Cumulative Performance Decomposition ($)</div>
        <div className="flex gap-1">
          {(["symbol", "sector", "assetClass"] as const).map((k) => (
            <button key={k} onClick={() => setBy(k)}
              className={`rounded px-2 py-0.5 text-xs ${k === by ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>
              {k === "assetClass" ? "Asset Class" : k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={32} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`$${fmtMoney(Number(v), 0)}`, String(n)]} />
            {keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.5} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-[10px] text-slate-600">Stacked cumulative $ contribution{by === "symbol" ? " (top 8 + Other)" : ""}.</div>
    </div>
  );
}
