"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Enriched, PortfolioAnalytics, CorrelationResult } from "@/lib/analytics";
import { fmtSigned, fmtPct, pnlClass } from "@/lib/format";

export { HoldingsTreemap } from "./HoldingsTreemap";

const GREEN = "#10b981";
const RED = "#f43f5e";
const TT = {
  background: "#0d1321",
  border: "1px solid rgba(56,189,248,0.25)",
  borderRadius: 8,
  fontSize: 12,
} as const;

// red → neutral → green by signed value in [-mag, mag]
function divergingColor(v: number, mag: number): string {
  const t = Math.max(-1, Math.min(1, mag > 0 ? v / mag : 0));
  if (t >= 0) {
    const a = 0.12 + 0.6 * t;
    return `rgba(16,185,129,${a.toFixed(3)})`;
  }
  const a = 0.12 + 0.6 * -t;
  return `rgba(244,63,94,${a.toFixed(3)})`;
}

// ── Winners & Losers ──────────────────────────────────────────────────────────

function RankTable({ title, items, accent }: { title: string; items: Enriched[]; accent: string }) {
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.pnlPct)), 1);
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
                  <div
                    className="h-2 rounded"
                    style={{
                      width: `${(Math.abs(r.pnlPct) / maxAbs) * 100}%`,
                      background: r.pnlPct >= 0 ? GREEN : RED,
                    }}
                  />
                </div>
              </td>
              <td className={`py-1.5 pl-2 text-right ${pnlClass(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</td>
              <td className={`py-1.5 pl-3 text-right ${pnlClass(r.unrealizedPnl)}`}>{fmtSigned(r.unrealizedPnl, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WinnersLosers({ rows }: { rows: Enriched[] }) {
  const sorted = [...rows].sort((a, b) => b.pnlPct - a.pnlPct);
  const winners = sorted.slice(0, 10);
  const losers = sorted.slice(-10).reverse();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RankTable title="Top Winners" items={winners} accent="text-emerald-400" />
      <RankTable title="Top Losers" items={losers} accent="text-rose-400" />
    </div>
  );
}

// ── Correlation Matrix ─────────────────────────────────────────────────────────

export function CorrelationMatrix({ correlation }: { correlation: CorrelationResult }) {
  const { symbols, matrix, avg, highest, lowest } = correlation;
  if (symbols.length < 2) {
    return (
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 text-sm text-slate-500">
        Not enough price history to compute a correlation matrix.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">Return Correlation Matrix</div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="p-1" />
              {symbols.map((s) => (
                <th key={s} className="p-1 text-slate-500" style={{ writingMode: "vertical-rl" }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {symbols.map((s, i) => (
              <tr key={s}>
                <td className="whitespace-nowrap p-1 text-right text-slate-400">{s}</td>
                {symbols.map((t, j) => {
                  const r = matrix[i][j];
                  return (
                    <td
                      key={t}
                      title={`${s} / ${t}: ${r.toFixed(2)}`}
                      className="h-6 w-6 text-center text-[9px] text-slate-200"
                      style={{ background: divergingColor(r, 1) }}
                    >
                      {r.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Avg Correlation</div>
          <div className="font-mono text-slate-200">{avg.toFixed(2)}</div>
        </div>
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Most Correlated</div>
          <div className="font-mono text-emerald-400">
            {highest ? `${highest.a}/${highest.b} ${highest.r.toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Least Correlated</div>
          <div className="font-mono text-rose-400">
            {lowest ? `${lowest.a}/${lowest.b} ${lowest.r.toFixed(2)}` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Concentration Analysis ──────────────────────────────────────────────────────

export function ConcentrationAnalysis({ analytics }: { analytics: PortfolioAnalytics }) {
  const top15 = [...analytics.positions].sort((a, b) => b.weight - a.weight).slice(0, 15)
    .map((p) => ({ name: p.symbol, weight: +p.weight.toFixed(2) }));

  // weight histogram bins
  const bins = [0, 2, 4, 6, 8, 10, 15, 100];
  const hist = bins.slice(0, -1).map((lo, i) => {
    const hi = bins[i + 1];
    const label = hi === 100 ? `${lo}%+` : `${lo}-${hi}%`;
    const count = analytics.positions.filter((p) => p.weight >= lo && p.weight < hi).length;
    return { label, count };
  });

  const hhi = analytics.hhi;
  const level = hhi < 0.1 ? { t: "Diversified", c: "text-emerald-400", b: "border-emerald-500/30 bg-emerald-500/10" }
    : hhi < 0.18 ? { t: "Moderate Concentration", c: "text-amber-400", b: "border-amber-500/30 bg-amber-500/10" }
    : { t: "Concentrated", c: "text-rose-400", b: "border-rose-500/30 bg-rose-500/10" };

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Concentration Analysis</div>
        <div className={`rounded border px-2 py-0.5 text-xs ${level.b} ${level.c}`}>{level.t}</div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Top 5 Holdings" value={`${analytics.top5Pct.toFixed(1)}%`} />
        <Metric label="Top 10 Holdings" value={`${analytics.top10Pct.toFixed(1)}%`} />
        <Metric label="Effective N" value={analytics.effectiveN.toFixed(1)} />
        <Metric label="HHI Index" value={hhi.toFixed(3)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[240px]">
          <div className="mb-1 text-[11px] text-slate-500">Largest 15 Positions (weight %)</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top15} layout="vertical" margin={{ left: 24, right: 12, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={64} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v)}%`, "Weight"]} />
              <Bar dataKey="weight" fill="#38bdf8" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[240px]">
          <div className="mb-1 text-[11px] text-slate-500">Position Weight Distribution</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hist} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={TT} formatter={(v) => [String(v), "Positions"]} />
              <Bar dataKey="count" fill="#a78bfa" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white/[0.02] p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

// ── Sector Breakdown (drill-down, P&L-coloured) ───────────────────────────────

interface SectorSlice {
  key: string;       // sector name, or industry name when drilled in
  weight: number;    // % of total portfolio gross MV (consistent at both levels)
  count: number;
  pnl: number;
  contrib: number;   // % of total portfolio P&L
  mv: number;
}

// Slice size is ALWAYS the weight; only the fill encodes P&L. Green for profit,
// red for loss, with saturation scaled by |P&L| vs the largest mover so the
// dominant contributor reads strongest. A visible floor keeps small slices clean.
function pnlFill(pnl: number, maxAbs: number): string {
  const t = maxAbs > 0 ? Math.min(1, Math.abs(pnl) / maxAbs) : 0;
  const a = (0.45 + 0.5 * t).toFixed(3);
  return pnl >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`;
}

function aggregate(rows: Enriched[], by: (r: Enriched) => string, totalMv: number, totalPnl: number): SectorSlice[] {
  const m = new Map<string, { mv: number; count: number; pnl: number }>();
  for (const r of rows) {
    const k = by(r);
    const e = m.get(k) ?? { mv: 0, count: 0, pnl: 0 };
    e.mv += Math.abs(r.marketValue);
    e.count += 1;
    e.pnl += r.unrealizedPnl;
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([key, e]) => ({
      key,
      weight: totalMv ? (e.mv / totalMv) * 100 : 0,
      count: e.count,
      pnl: e.pnl,
      contrib: totalPnl ? (e.pnl / totalPnl) * 100 : 0,
      mv: e.mv,
    }))
    .sort((a, b) => b.weight - a.weight);
}

function SectorTooltip({ active, payload }: { active?: boolean; payload?: { payload: SectorSlice }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pos = d.pnl >= 0;
  return (
    <div className="dark-surface rounded-md px-3 py-2 text-xs shadow-lg" style={{ background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)" }}>
      <div className="mb-1 font-semibold text-slate-100">{d.key}</div>
      <div className="text-slate-400">Weight <span className="font-mono text-slate-200">{d.weight.toFixed(1)}%</span></div>
      <div className="text-slate-400">P&L <span className={`font-mono ${pos ? "text-emerald-400" : "text-rose-400"}`}>{fmtSigned(d.pnl, 0)}</span></div>
    </div>
  );
}

export function SectorBreakdown({ rows }: { rows: Enriched[] }) {
  const [drill, setDrill] = useState<string | null>(null);

  const { totalMv, totalPnl } = useMemo(() => {
    let mv = 0, pnl = 0;
    for (const r of rows) { mv += Math.abs(r.marketValue); pnl += r.unrealizedPnl; }
    return { totalMv: mv, totalPnl: pnl };
  }, [rows]);

  const sectors = useMemo(() => aggregate(rows, (r) => r.sector, totalMv, totalPnl), [rows, totalMv, totalPnl]);

  const subsectors = useMemo(() => {
    if (!drill) return [];
    return aggregate(rows.filter((r) => r.sector === drill), (r) => r.industry, totalMv, totalPnl);
  }, [rows, drill, totalMv, totalPnl]);

  // If a drilled sector vanishes from the data (e.g. positions closed), reset.
  const drillValid = !drill || subsectors.length > 0;
  const data = drill && drillValid ? subsectors : sectors;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);

  const drillPnl = drill ? subsectors.reduce((s, d) => s + d.pnl, 0) : totalPnl;
  const centerPos = drillPnl >= 0;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Sector Breakdown</div>
        {/* Breadcrumb navigation back to the top level */}
        <div className="text-xs">
          <button
            type="button"
            onClick={() => setDrill(null)}
            className={drill ? "text-cyan-400 hover:underline" : "cursor-default text-slate-500"}
          >
            All Sectors
          </button>
          {drill && drillValid && <span className="text-slate-500"> › <span className="text-slate-300">{drill}</span></span>}
        </div>
      </div>
      <div className="mb-3 text-[11px] text-slate-500">
        {drill && drillValid ? "Subsectors — click ‘All Sectors’ or the centre to go back" : "Click a slice to drill into its subsectors"}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="relative h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="weight"
                nameKey="key"
                innerRadius="55%"
                outerRadius="82%"
                paddingAngle={1.5}
                stroke="#060a14"
                strokeWidth={2}
                isAnimationActive={false}
                onClick={(_, i) => { if (!drill) setDrill(data[i].key); }}
                className={drill ? undefined : "cursor-pointer"}
              >
                {data.map((d) => <Cell key={d.key} fill={pnlFill(d.pnl, maxAbs)} className={drill ? undefined : "cursor-pointer"} />)}
              </Pie>
              <Tooltip content={<SectorTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Centre hub: shows level P&L; doubles as a back button when drilled */}
          <button
            type="button"
            disabled={!drill}
            onClick={() => setDrill(null)}
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center disabled:cursor-default"
            style={{ width: "44%", height: "44%", borderRadius: "9999px" }}
          >
            {drill && drillValid && <div className="text-[10px] text-cyan-400">‹ back</div>}
            <div className={`font-mono text-base font-semibold ${centerPos ? "text-emerald-400" : "text-rose-400"}`}>{fmtSigned(drillPnl, 0)}</div>
            <div className="max-w-[90%] truncate text-[10px] uppercase tracking-wider text-slate-500">{drill && drillValid ? drill : "total P&L"}</div>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1 text-left">{drill && drillValid ? "Subsector" : "Sector"}</th>
                <th className="px-2 py-1 text-right">Weight</th>
                <th className="px-2 py-1 text-right">#</th>
                <th className="px-2 py-1 text-right">P&L</th>
                <th className="px-2 py-1 text-right">Contrib.</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.map((d) => (
                <tr
                  key={d.key}
                  onClick={() => { if (!drill) setDrill(d.key); }}
                  className={`border-t border-white/[0.04] ${drill ? "" : "cursor-pointer hover:bg-white/[0.03]"}`}
                >
                  <td className="px-2 py-1.5 text-left font-sans text-slate-300">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: pnlFill(d.pnl, maxAbs) }} />
                    {d.key}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-300">{d.weight.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{d.count}</td>
                  <td className={`px-2 py-1.5 text-right ${pnlClass(d.pnl)}`}>{fmtSigned(d.pnl, 0)}</td>
                  <td className={`px-2 py-1.5 text-right ${pnlClass(d.contrib)}`}>{d.contrib.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Contribution Analysis ────────────────────────────────────────────────────

export function ContributionAnalysis({ rows }: { rows: Enriched[] }) {
  const retData = [...rows].sort((a, b) => b.contribToReturn - a.contribToReturn).map((r) => ({ name: r.symbol, v: +r.contribToReturn.toFixed(3) }));
  const riskData = [...rows].sort((a, b) => b.contribToVolPct - a.contribToVolPct).slice(0, 15).map((r) => ({ name: r.symbol, v: +r.contribToVolPct.toFixed(2) }));

  const topRet = retData[0];
  const botRet = retData[retData.length - 1];
  const topRisk = riskData[0];

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">Position Contribution Analysis</div>
      <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Largest + Return</div>
          <div className="font-mono text-emerald-400">{topRet ? `${topRet.name} ${topRet.v >= 0 ? "+" : ""}${topRet.v}` : "—"}</div>
        </div>
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Largest − Return</div>
          <div className="font-mono text-rose-400">{botRet ? `${botRet.name} ${botRet.v}` : "—"}</div>
        </div>
        <div className="rounded bg-white/[0.02] p-2">
          <div className="text-[10px] uppercase text-slate-500">Largest Risk</div>
          <div className="font-mono text-amber-400">{topRisk ? `${topRisk.name} ${topRisk.v}%` : "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[260px]">
          <div className="mb-1 text-[11px] text-slate-500">Contribution to Return (weight × return)</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={retData} layout="vertical" margin={{ left: 24, right: 12, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={64} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v) => [String(v), "Contrib %"]} />
              <Bar dataKey="v" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {retData.map((d, i) => <Cell key={i} fill={d.v >= 0 ? GREEN : RED} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[260px]">
          <div className="mb-1 text-[11px] text-slate-500">Contribution to Risk (% of portfolio VaR)</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={riskData} layout="vertical" margin={{ left: 24, right: 12, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={64} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} formatter={(v) => [`${Number(v)}%`, "Risk Contrib"]} />
              <Bar dataKey="v" fill="#fb923c" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
