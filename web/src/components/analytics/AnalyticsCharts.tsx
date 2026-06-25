"use client";

import { useMemo } from "react";
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

// ── Sector Breakdown ─────────────────────────────────────────────────────────

const SECTOR_COLORS = ["#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24", "#f43f5e", "#22d3ee", "#c084fc"];

export function SectorBreakdown({ rows }: { rows: Enriched[] }) {
  const data = useMemo(() => {
    const m = new Map<string, { mv: number; count: number; pnl: number }>();
    let totalMv = 0;
    let totalPnl = 0;
    for (const r of rows) {
      const e = m.get(r.sector) ?? { mv: 0, count: 0, pnl: 0 };
      e.mv += Math.abs(r.marketValue);
      e.count += 1;
      e.pnl += r.unrealizedPnl;
      m.set(r.sector, e);
      totalMv += Math.abs(r.marketValue);
      totalPnl += r.unrealizedPnl;
    }
    return [...m.entries()]
      .map(([sector, e]) => ({
        sector,
        weight: totalMv ? (e.mv / totalMv) * 100 : 0,
        count: e.count,
        pnl: e.pnl,
        contrib: totalPnl ? (e.pnl / totalPnl) * 100 : 0,
        mv: e.mv,
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [rows]);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 text-sm font-semibold text-slate-200">Sector Breakdown</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="weight" nameKey="sector" innerRadius="55%" outerRadius="82%" paddingAngle={1.5} stroke="#060a14" strokeWidth={2} isAnimationActive={false}>
                {data.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(1)}%`, String(n)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1 text-left">Sector</th>
                <th className="px-2 py-1 text-right">Weight</th>
                <th className="px-2 py-1 text-right">#</th>
                <th className="px-2 py-1 text-right">P&L</th>
                <th className="px-2 py-1 text-right">Contrib.</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.map((d, i) => (
                <tr key={d.sector} className="border-t border-white/[0.04]">
                  <td className="px-2 py-1.5 text-left font-sans text-slate-300">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    {d.sector}
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
