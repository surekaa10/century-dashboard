"use client";

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from "recharts";
import type { RiskRow, SectorRisk, RiskHistory } from "@/lib/risk";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 } as const;
const PALETTE = ["#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24", "#f43f5e", "#22d3ee", "#c084fc", "#94a3b8"];

// risk heat: low = green, mid = amber, high = red
function riskHeat(v: number, max: number): string {
  const t = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  if (t < 0.34) return `rgba(16,185,129,${(0.25 + t).toFixed(2)})`;
  if (t < 0.67) return `rgba(251,191,36,${(0.3 + (t - 0.34)).toFixed(2)})`;
  return `rgba(244,63,94,${(0.4 + (t - 0.67)).toFixed(2)})`;
}
function riskTextClass(v: number, avg: number): string {
  if (v > avg * 1.5) return "text-rose-400";
  if (v > avg) return "text-amber-400";
  return "text-emerald-400";
}

// ── 1. Position Risk table ──────────────────────────────────────────────────────

type Key = "symbol" | "weight" | "volAnnual" | "marginalVar" | "componentVar" | "riskContribPct" | "betaToPortfolio";

export function RiskPositionTable({ rows }: { rows: RiskRow[] }) {
  const [sortKey, setSortKey] = useState<Key>("riskContribPct");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");
  const avg = rows.length ? 100 / rows.length : 0;

  const view = useMemo(() => {
    const f = rows.filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase()) || r.sector.toLowerCase().includes(q.toLowerCase()));
    return [...f].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
  }, [rows, q, sortKey, asc]);

  const ranked = [...rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
  const rankOf = (s: string) => ranked.findIndex((r) => r.symbol === s) + 1;

  const cols: { k: Key; label: string }[] = [
    { k: "symbol", label: "Symbol" },
    { k: "weight", label: "Weight %" },
    { k: "volAnnual", label: "Vol %" },
    { k: "marginalVar", label: "Marginal VaR" },
    { k: "componentVar", label: "Component VaR" },
    { k: "riskContribPct", label: "Risk Contrib %" },
    { k: "betaToPortfolio", label: "β to Port." },
  ];
  const csv = () => {
    const head = ["Rank", ...cols.map((c) => c.label)].join(",");
    const body = view.map((r) => [rankOf(r.symbol), r.symbol, r.weight.toFixed(2), r.volAnnual.toFixed(2), r.marginalVar.toFixed(2), r.componentVar.toFixed(2), r.riskContribPct.toFixed(2), r.betaToPortfolio.toFixed(2)].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([head + "\n" + body], { type: "text/csv" }));
    a.download = "risk_attribution.csv";
    a.click();
  };

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">Position Risk Contribution</span>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40 rounded border border-cyan-500/15 bg-black/20 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40" />
          <button onClick={csv} className="rounded border border-cyan-500/20 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10">↓ CSV</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-right">#</th>
              {cols.map((c) => (
                <th key={c.k} onClick={() => (c.k === sortKey ? setAsc(!asc) : (setSortKey(c.k), setAsc(false)))} className={`cursor-pointer select-none px-3 py-2 ${c.k === "symbol" ? "text-left" : "text-right"} hover:text-slate-300`}>
                  {c.label}{sortKey === c.k ? (asc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {view.map((r) => (
              <tr key={r.symbol + r.marketValue} className="border-t border-white/[0.04]">
                <td className="px-3 py-2 text-right text-slate-500">{rankOf(r.symbol)}</td>
                <td className="px-3 py-2 text-left font-sans font-medium text-slate-200">{r.symbol}</td>
                <td className="px-3 py-2 text-right text-slate-300">{r.weight.toFixed(2)}%</td>
                <td className="px-3 py-2 text-right text-slate-300">{r.volAnnual.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right text-slate-400">{fmtSigned(r.marginalVar, 0)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(-r.componentVar)}`}>{fmtMoney(r.componentVar, 0)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${riskTextClass(r.riskContribPct, avg)}`}>{r.riskContribPct.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right text-slate-300">{r.betaToPortfolio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Top risk contributors (weight vs risk side-by-side) ──────────────────────────

export function TopRiskContributors({ rows }: { rows: RiskRow[] }) {
  const top = [...rows].sort((a, b) => b.riskContribPct - a.riskContribPct).slice(0, 15);
  const max = Math.max(...top.map((r) => Math.max(r.riskContribPct, r.weight)), 1);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Top 15 Risk Contributors</div>
      <div className="mb-3 flex gap-4 text-[11px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#f43f5e" }} />Risk %</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#38bdf8" }} />Weight %</span>
      </div>
      <div className="space-y-2 font-mono text-xs">
        {top.map((r) => (
          <div key={r.symbol + r.marketValue} className="grid grid-cols-[70px_1fr_auto] items-center gap-2">
            <span className="font-sans text-slate-200">{r.symbol}</span>
            <div className="space-y-1">
              <div className="h-2 rounded bg-white/[0.03]"><div className="h-2 rounded bg-rose-500" style={{ width: `${(r.riskContribPct / max) * 100}%` }} /></div>
              <div className="h-2 rounded bg-white/[0.03]"><div className="h-2 rounded bg-sky-400" style={{ width: `${(r.weight / max) * 100}%` }} /></div>
            </div>
            <span className="text-right text-slate-300">
              <span className="text-rose-400">{r.riskContribPct.toFixed(1)}%</span> / <span className="text-sky-400">{r.weight.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Risk Treemap ──────────────────────────────────────────────────────────────

interface Leaf { name: string; size: number; risk: number; vol: number; cvar: number; weight: number; sector: string; max: number; }
function TreemapCell(props: Record<string, unknown>) {
  const { x, y, width, height, name, risk, max } = props as { x: number; y: number; width: number; height: number; name?: string; risk?: number; max?: number };
  if (width <= 0 || height <= 0) return null;
  const leaf = typeof risk === "number";
  const fill = leaf ? riskHeat(risk!, (max as number) || 1) : "rgba(255,255,255,0.02)";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#060a14" strokeWidth={1} />
      {leaf && width > 44 && height > 20 && <text x={x + 4} y={y + 14} fill="#e2e8f0" fontSize={10} fontFamily="monospace">{name}</text>}
    </g>
  );
}

export function RiskTreemap({ rows }: { rows: RiskRow[] }) {
  const max = Math.max(...rows.map((r) => r.riskContribPct), 1);
  const bySector = new Map<string, Leaf[]>();
  for (const r of rows) {
    const leaf: Leaf = { name: r.symbol, size: Math.max(r.weight, 0.01), risk: r.riskContribPct, vol: r.volAnnual, cvar: r.componentVar, weight: r.weight, sector: r.sector, max };
    if (!bySector.has(r.sector)) bySector.set(r.sector, []);
    bySector.get(r.sector)!.push(leaf);
  }
  const data = [...bySector.entries()].map(([name, children]) => ({ name, children }));
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Risk Contribution Treemap</div>
      <div className="mb-2 text-[11px] text-slate-500">Sector → Symbol · size = weight · colour = risk contribution (green → red)</div>
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data as never} dataKey="size" stroke="#060a14" content={<TreemapCell />} isAnimationActive={false}>
            <Tooltip contentStyle={TT} formatter={(_v, _n, item) => {
              const p = (item as { payload?: Leaf } | undefined)?.payload;
              if (!p) return ["", ""];
              return [`Wt ${p.weight.toFixed(1)}% · Risk ${p.risk.toFixed(1)}% · Vol ${p.vol.toFixed(0)}% · CVaR $${fmtMoney(p.cvar, 0)}`, `${p.name} (${p.sector})`];
            }} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 3. Risk vs Weight scatter ─────────────────────────────────────────────────────

export function RiskVsWeight({ rows }: { rows: RiskRow[] }) {
  const data = rows.map((r) => ({ x: +r.weight.toFixed(2), y: +r.riskContribPct.toFixed(2), z: Math.abs(r.marketValue) + 1, name: r.symbol, over: r.riskContribPct - r.weight }));
  const maxAx = Math.max(...data.map((d) => Math.max(d.x, d.y)), 1) * 1.1;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Risk Contribution vs Weight</div>
      <div className="mb-2 text-[11px] text-slate-500">Above the line = risk heavier than capital weight (hidden concentration)</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 18 }}>
            <XAxis type="number" dataKey="x" name="Weight" unit="%" domain={[0, +maxAx.toFixed(1)]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Weight %", position: "insideBottom", offset: -6, fill: "#64748b", fontSize: 10 }} />
            <YAxis type="number" dataKey="y" name="Risk" unit="%" domain={[0, +maxAx.toFixed(1)]} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Risk %", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
            <ZAxis type="number" dataKey="z" range={[50, 500]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: maxAx, y: maxAx }]} stroke="rgba(148,163,184,0.5)" strokeDasharray="4 4" />
            <Tooltip contentStyle={TT} cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => [String(v), String(n)]} labelFormatter={() => ""} />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.over > 0 ? "#f43f5e" : "#10b981"} fillOpacity={0.65} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 4. Sector Risk ─────────────────────────────────────────────────────────────────

export function SectorRiskSection({ sectors }: { sectors: SectorRisk[] }) {
  const bars = [...sectors].sort((a, b) => a.riskContribPct - b.riskContribPct).map((s) => ({ name: s.sector, risk: +s.riskContribPct.toFixed(1), weight: +s.weight.toFixed(1) }));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 text-left">Sector</th><th className="px-4 py-2 text-right">Weight %</th>
            <th className="px-4 py-2 text-right">Risk Contrib %</th><th className="px-4 py-2 text-right">Vol %</th>
            <th className="px-4 py-2 text-right">Component VaR</th><th className="px-4 py-2 text-right"># Hold.</th>
          </tr></thead>
          <tbody className="font-mono">
            {sectors.map((s) => (
              <tr key={s.sector} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 text-left font-sans text-slate-200">{s.sector}</td>
                <td className="px-4 py-2 text-right text-slate-300">{s.weight.toFixed(1)}%</td>
                <td className={`px-4 py-2 text-right font-semibold ${s.riskContribPct > s.weight ? "text-rose-400" : "text-emerald-400"}`}>{s.riskContribPct.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right text-slate-300">{s.volAnnual.toFixed(1)}%</td>
                <td className="px-4 py-2 text-right text-slate-400">{fmtMoney(s.componentVar, 0)}</td>
                <td className="px-4 py-2 text-right text-slate-400">{s.holdings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-1 text-[11px] text-slate-500">Sector Risk Contribution vs Weight</div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ left: 30, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={92} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n) === "risk" ? "Risk" : "Weight"]} />
              <Bar dataKey="risk" fill="#f43f5e" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              <Bar dataKey="weight" fill="#38bdf8" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── 6. Rolling risk contribution ───────────────────────────────────────────────────

export function RollingRisk({ history }: { history: RiskHistory }) {
  if (history.rows.length < 2) return <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">Insufficient history for a rolling risk view.</div>;
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-sm font-semibold text-slate-200">Risk Leadership Over Time</div>
      <div className="mb-2 text-[11px] text-slate-500">Stacked % risk contribution (rolling {history.dates.length}-point window)</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history.rows} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={28} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n)]} />
            {history.keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.5} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 7. Marginal VaR sensitivity ─────────────────────────────────────────────────────

export function MarginalVarTable({ rows }: { rows: RiskRow[] }) {
  const top = [...rows].sort((a, b) => b.riskContribPct - a.riskContribPct);
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">Marginal VaR Sensitivity <span className="text-slate-500">(linear approx.)</span></div>
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500">
          <th className="px-4 py-2 text-left">Symbol</th><th className="px-4 py-2 text-right">Marginal VaR /+1%</th>
          <th className="px-4 py-2 text-right">+1% Weight</th><th className="px-4 py-2 text-right">+5% Weight</th><th className="px-4 py-2 text-right">−5% Weight</th>
        </tr></thead>
        <tbody className="font-mono">
          {top.map((r) => (
            <tr key={r.symbol + r.marketValue} className="border-t border-white/[0.04]">
              <td className="px-4 py-2 text-left font-sans text-slate-200">{r.symbol}</td>
              <td className="px-4 py-2 text-right text-slate-300">{fmtSigned(r.marginalVar, 0)}</td>
              <td className={`px-4 py-2 text-right ${pnlClass(-r.marginalVar)}`}>{fmtSigned(r.marginalVar, 0)}</td>
              <td className={`px-4 py-2 text-right ${pnlClass(-r.marginalVar * 5)}`}>{fmtSigned(r.marginalVar * 5, 0)}</td>
              <td className={`px-4 py-2 text-right ${pnlClass(r.marginalVar * 5)}`}>{fmtSigned(-r.marginalVar * 5, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
