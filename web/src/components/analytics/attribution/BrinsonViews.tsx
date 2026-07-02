"use client";

import { useMemo } from "react";
import {
  Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { BrinsonResult, RiskMetrics } from "@/lib/brinson";
import type { MonthlyReturn, TradeAttrib } from "@/lib/attribution";
import { fmtSigned, fmtPct, fmtMoney, pnlClass } from "@/lib/format";

const GREEN = "#10b981";
const RED   = "#f43f5e";
const CYAN  = "#38bdf8";
const AMBER = "#fbbf24";
const TT    = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.2)", borderRadius: 8, fontSize: 12 } as const;

// ── 1. Active Return Overview ──────────────────────────────────────────────────

export function ActiveReturnHeader({
  brinson,
  risk,
  benchmarkName,
  period,
  loading,
}: {
  brinson: BrinsonResult | null;
  risk: RiskMetrics | null;
  benchmarkName: string;
  period: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-6 py-8 text-center font-mono text-sm text-slate-500">
        Fetching {benchmarkName} + sector ETF data…
      </div>
    );
  }
  if (!brinson) {
    return (
      <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3 font-mono text-xs text-amber-400">
        Attribution data unavailable — check CORS or Yahoo Finance access from the server.
      </div>
    );
  }

  const ar = brinson.totalActiveReturn;
  const cells: { label: string; value: string; hint?: string; cls?: string }[] = [
    { label: "Portfolio Return", value: fmtPct(brinson.portfolioReturn), cls: pnlClass(brinson.portfolioReturn) },
    { label: `${benchmarkName} Return`, value: fmtPct(brinson.benchmarkReturn), cls: pnlClass(brinson.benchmarkReturn) },
    { label: "Active Return", value: fmtPct(ar), hint: `${period} vs ${benchmarkName}`, cls: pnlClass(ar) },
    { label: "Allocation Effect", value: fmtPct(brinson.allocationEffect), hint: "sector over/underweight", cls: pnlClass(brinson.allocationEffect) },
    { label: "Selection Effect", value: fmtPct(brinson.selectionEffect), hint: "stock picking vs sector", cls: pnlClass(brinson.selectionEffect) },
    { label: "Interaction Effect", value: fmtPct(brinson.interactionEffect), hint: "overweight × outperform", cls: pnlClass(brinson.interactionEffect) },
    ...(risk ? [
      { label: "Sharpe Ratio",  value: risk.sharpeRatio.toFixed(2),  hint: "vs 4.5% rfr", cls: risk.sharpeRatio >= 1 ? "text-emerald-400" : risk.sharpeRatio >= 0 ? "text-amber-400" : "text-rose-400" },
      { label: "Info Ratio",    value: risk.informationRatio.toFixed(2), hint: "active ret / TE", cls: risk.informationRatio >= 0.5 ? "text-emerald-400" : risk.informationRatio >= 0 ? "text-amber-400" : "text-rose-400" },
      { label: "Tracking Error", value: `${risk.trackingError.toFixed(1)}%`, hint: "annualized active vol" },
      { label: "Portfolio Beta", value: risk.beta.toFixed(2), hint: `vs ${benchmarkName}`, cls: "text-slate-100" },
      { label: "Jensen Alpha",   value: fmtPct(risk.alpha, 1), hint: "annualized %", cls: pnlClass(risk.alpha) },
      { label: "Correlation",    value: risk.correlation.toFixed(2), hint: `vs ${benchmarkName}` },
      { label: "Max Drawdown",   value: `-${risk.maxDrawdown.toFixed(1)}%`, hint: "portfolio", cls: "text-rose-400" },
      { label: "Calmar Ratio",   value: risk.calmarRatio.toFixed(2), hint: "return / max DD" },
    ] : []),
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
          <div className={`mt-1 font-mono text-lg font-semibold ${c.cls ?? "text-slate-100"}`}>{c.value}</div>
          {c.hint && <div className="mt-0.5 font-mono text-[10px] text-slate-600">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// ── 2. Active Return Waterfall (horizontal signed bar chart) ──────────────────

export function ActiveReturnWaterfall({ brinson }: { brinson: BrinsonResult }) {
  // Waterfall: stacked bars (transparent spacer + colored value)
  // Each bar represents one step in the cumulative build-up from Benchmark → Portfolio
  const { benchmarkReturn: bm, allocationEffect: al, selectionEffect: se,
          interactionEffect: ie, residual, portfolioReturn: pr } = brinson;

  // Build stacked waterfall data: each entry has a transparent "spacer" and a colored "bar"
  type WFEntry = { name: string; spacer: number; positive: number; negative: number; isTotal: boolean };
  let cum = bm;
  const entries: WFEntry[] = [
    { name: "Benchmark", spacer: 0, positive: bm > 0 ? bm : 0, negative: bm < 0 ? Math.abs(bm) : 0, isTotal: true },
  ];

  for (const [name, val] of [["Allocation", al], ["Selection", se], ["Interaction", ie], ["Residual", residual]] as [string, number][]) {
    if (Math.abs(val) < 0.0001) continue;
    if (val >= 0) {
      entries.push({ name, spacer: cum, positive: val, negative: 0, isTotal: false });
    } else {
      entries.push({ name, spacer: cum + val, positive: 0, negative: Math.abs(val), isTotal: false });
    }
    cum += val;
  }
  entries.push({ name: "Portfolio", spacer: 0, positive: pr > 0 ? pr : 0, negative: pr < 0 ? Math.abs(pr) : 0, isTotal: true });

  const minVal = Math.min(...entries.map((e) => e.spacer), 0);
  const maxVal = Math.max(...entries.map((e) => e.spacer + e.positive), pr, bm, 0);
  const pad = (maxVal - minVal) * 0.12;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-[11px] text-slate-500">
        Active return decomposition — stacked build-up from Benchmark to Portfolio return (%)
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={entries} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
            barCategoryGap="30%">
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[minVal - pad, maxVal + pad]} tick={{ fill: "#64748b", fontSize: 9 }}
              axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={40} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip contentStyle={TT}
              formatter={(v, name) => name === "spacer" ? null : [`${Number(v).toFixed(3)}%`, String(name)]}
              filterNull={true}
            />
            {/* transparent spacer lifts the colored bar to the right starting point */}
            <Bar dataKey="spacer" stackId="a" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="positive" stackId="a" isAnimationActive={false} name="Contribution">
              {entries.map((e, i) => (
                <Cell key={i} fill={e.isTotal ? CYAN : GREEN} fillOpacity={e.isTotal ? 0.9 : 0.8} />
              ))}
            </Bar>
            <Bar dataKey="negative" stackId="a" isAnimationActive={false} name="Drag">
              {entries.map((e, i) => (
                <Cell key={i} fill={e.isTotal ? CYAN : RED} fillOpacity={e.isTotal ? 0.9 : 0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row */}
      <div className="mt-3 flex flex-wrap gap-4 border-t border-white/[0.04] pt-3">
        {[
          ["Benchmark", bm, "#64748b"],
          ["Allocation", al, al >= 0 ? GREEN : RED],
          ["Selection", se, se >= 0 ? GREEN : RED],
          ["Interaction", ie, ie >= 0 ? GREEN : RED],
          ["Residual", residual, AMBER],
          ["Portfolio", pr, pr > bm ? GREEN : RED],
        ].map(([label, val, color]) => (
          <div key={String(label)} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: String(color) }} />
            <span className="text-[10px] text-slate-500">{label}</span>
            <span className="font-mono text-[11px] font-semibold" style={{ color: String(color) }}>
              {(Number(val) >= 0 ? "+" : "")}{Number(val).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 3. Brinson Sector Table ────────────────────────────────────────────────────

export function BrinsonSectorTable({ brinson }: { brinson: BrinsonResult }) {
  const withEffect = brinson.sectors.filter(
    (s) => Math.abs(s.totalEffect) > 0.001 || s.portfolioWeight > 0.1
  );

  const signBar = (v: number, max: number) => (
    <div className="flex items-center gap-1">
      <div className="w-16 flex-shrink-0">
        <div className="relative h-1.5 w-full rounded bg-white/[0.04]">
          {v >= 0 ? (
            <div className="absolute left-1/2 h-1.5 rounded-r" style={{ width: `${Math.min(50, (v / max) * 50)}%`, background: GREEN }} />
          ) : (
            <div className="absolute h-1.5 rounded-l" style={{ right: "50%", width: `${Math.min(50, (Math.abs(v) / max) * 50)}%`, background: RED }} />
          )}
          <div className="absolute left-1/2 h-full w-px bg-white/20" />
        </div>
      </div>
      <span className={`font-mono text-[10px] ${pnlClass(v)}`}>{v >= 0 ? "+" : ""}{v.toFixed(3)}</span>
    </div>
  );

  const maxEffect = Math.max(...withEffect.map((s) => Math.abs(s.totalEffect)), 0.1);

  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 text-left">Sector</th>
            <th className="px-3 py-2 text-right">Port W%</th>
            <th className="px-3 py-2 text-right">Bench W%</th>
            <th className="px-3 py-2 text-right">Active W%</th>
            <th className="px-3 py-2 text-right">Port Ret%</th>
            <th className="px-3 py-2 text-right">Bench Ret%</th>
            <th className="px-3 py-2 text-center">Allocation</th>
            <th className="px-3 py-2 text-center">Selection</th>
            <th className="px-3 py-2 text-center">Interaction</th>
            <th className="px-3 py-2 text-right">Total Effect</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {withEffect.map((s) => (
            <tr key={s.sector} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.015]">
              <td className="px-3 py-2 font-sans font-medium text-slate-200">{s.sector}</td>
              <td className="px-3 py-2 text-right text-slate-300">{s.portfolioWeight.toFixed(1)}</td>
              <td className="px-3 py-2 text-right text-slate-500">{s.benchmarkWeight.toFixed(1)}</td>
              <td className={`px-3 py-2 text-right ${pnlClass(s.activeWeight)}`}>
                {s.activeWeight >= 0 ? "+" : ""}{s.activeWeight.toFixed(1)}
              </td>
              <td className={`px-3 py-2 text-right ${pnlClass(s.portfolioReturn)}`}>{fmtPct(s.portfolioReturn)}</td>
              <td className={`px-3 py-2 text-right ${pnlClass(s.benchmarkSectorReturn)}`}>{fmtPct(s.benchmarkSectorReturn)}</td>
              <td className="px-3 py-2">{signBar(s.allocationEffect, maxEffect)}</td>
              <td className="px-3 py-2">{signBar(s.selectionEffect, maxEffect)}</td>
              <td className="px-3 py-2">{signBar(s.interactionEffect, maxEffect)}</td>
              <td className={`px-3 py-2 text-right font-semibold ${pnlClass(s.totalEffect)}`}>
                {s.totalEffect >= 0 ? "+" : ""}{s.totalEffect.toFixed(3)}%
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-cyan-500/20 bg-white/[0.02] text-[11px] font-semibold">
            <td className="px-3 py-2 text-slate-400" colSpan={6}>Total</td>
            <td className={`px-3 py-2 text-center font-mono ${pnlClass(brinson.allocationEffect)}`}>
              {brinson.allocationEffect >= 0 ? "+" : ""}{brinson.allocationEffect.toFixed(3)}%
            </td>
            <td className={`px-3 py-2 text-center font-mono ${pnlClass(brinson.selectionEffect)}`}>
              {brinson.selectionEffect >= 0 ? "+" : ""}{brinson.selectionEffect.toFixed(3)}%
            </td>
            <td className={`px-3 py-2 text-center font-mono ${pnlClass(brinson.interactionEffect)}`}>
              {brinson.interactionEffect >= 0 ? "+" : ""}{brinson.interactionEffect.toFixed(3)}%
            </td>
            <td className={`px-3 py-2 text-right font-mono text-base ${pnlClass(brinson.totalActiveReturn)}`}>
              {brinson.totalActiveReturn >= 0 ? "+" : ""}{brinson.totalActiveReturn.toFixed(3)}%
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="border-t border-white/[0.04] px-3 py-2 font-mono text-[10px] text-slate-600">
        Benchmark weights: S&P 500 GICS (Q2 2025). Sector returns: SPDR sector ETFs vs selected benchmark.
        Residual {brinson.residual >= 0 ? "+" : ""}{brinson.residual.toFixed(3)}% from incomplete sector coverage.
      </div>
    </div>
  );
}

// ── 4. Monthly Returns Calendar Heatmap ───────────────────────────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function MonthlyCalendar({ months }: { months: MonthlyReturn[] }) {
  const years  = [...new Set(months.map((m) => m.year))].sort();
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.ret)), 1);

  const lookup = new Map(months.map((m) => [`${m.year}-${m.month}`, m.ret]));

  // Annual totals (sum of monthly returns as approximation)
  const annuals = years.map((yr) => ({
    yr,
    ret: months.filter((m) => m.year === yr).reduce((s, m) => s + m.ret, 0),
  }));

  const cellBg = (ret: number) => {
    const intensity = Math.min(1, Math.abs(ret) / maxAbs);
    if (ret > 0) return `rgba(16,185,129,${(0.15 + 0.7 * intensity).toFixed(2)})`;
    if (ret < 0) return `rgba(244,63,94,${(0.15 + 0.7 * intensity).toFixed(2)})`;
    return "rgba(255,255,255,0.03)";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="min-w-[700px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">Month</th>
              {years.map((yr) => <th key={yr} className="px-3 py-2 text-center">{yr}</th>)}
              <th className="px-3 py-2 text-center text-slate-600">Best</th>
              <th className="px-3 py-2 text-center text-slate-600">Worst</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {MONTH_LABELS.map((label, mi) => {
              const monthNum = mi + 1;
              const rowRets = years.map((yr) => lookup.get(`${yr}-${monthNum}`) ?? null);
              const valid   = rowRets.filter((r): r is number => r !== null);
              const best    = valid.length ? Math.max(...valid) : null;
              const worst   = valid.length ? Math.min(...valid) : null;
              return (
                <tr key={label} className="border-t border-white/[0.04]">
                  <td className="px-3 py-1.5 font-sans text-slate-400">{label}</td>
                  {years.map((yr, yi) => {
                    const ret = rowRets[yi];
                    return (
                      <td key={yr} className="px-1 py-1">
                        <div className="rounded px-2 py-1 text-center text-[11px] font-semibold"
                          style={{ background: ret !== null ? cellBg(ret) : "transparent",
                                   color: ret !== null ? (ret >= 0 ? "#10b981" : "#f43f5e") : "#475569" }}>
                          {ret !== null ? `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%` : "—"}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center text-[10px] text-emerald-400/70">
                    {best !== null ? `+${best.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center text-[10px] text-rose-400/70">
                    {worst !== null ? `${worst.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-white/[0.08] text-[11px] font-semibold">
              <td className="px-3 py-2 text-slate-500">Annual</td>
              {annuals.map(({ yr, ret }) => (
                <td key={yr} className="px-1 py-2">
                  <div className="rounded px-2 py-1 text-center font-mono text-[11px] font-bold"
                    style={{ background: cellBg(ret),
                             color: ret >= 0 ? "#10b981" : "#f43f5e" }}>
                    {ret >= 0 ? "+" : ""}{ret.toFixed(1)}%
                  </div>
                </td>
              ))}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── 5. Trading Attribution (from deals) ───────────────────────────────────────

export function TradingAttribution({ trades }: { trades: TradeAttrib[] }) {
  if (!trades.length) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center text-sm text-slate-500">
        No closed deals in snapshot. Deal history is populated from MT5 trade records.
      </div>
    );
  }

  const winners  = trades.filter((t) => t.netPnl > 0);
  const losers   = trades.filter((t) => t.netPnl < 0);
  const totalNet = trades.reduce((s, t) => s + t.netPnl, 0);
  const totalGross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalComm  = trades.reduce((s, t) => s + t.commission, 0);
  const totalSwap  = trades.reduce((s, t) => s + t.swap, 0);
  const avgHold    = trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length;
  const winRate    = trades.length ? (winners.length / trades.length) * 100 : 0;

  // Mini bar chart: net P&L by symbol
  const barData = trades.map((t) => ({ name: t.symbol, net: +t.netPnl.toFixed(0) }))
    .sort((a, b) => a.net - b.net);

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }); }
    catch { return iso.slice(0, 10); }
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {[
          ["Trades",      String(trades.length),      "text-slate-100"],
          ["Win Rate",    `${winRate.toFixed(0)}%`,   winRate >= 50 ? "text-emerald-400" : "text-rose-400"],
          ["Net P&L",     fmtSigned(totalNet, 0),     pnlClass(totalNet)],
          ["Gross P&L",   fmtSigned(totalGross, 0),   pnlClass(totalGross)],
          ["Commission",  fmtSigned(totalComm, 0),    "text-rose-400"],
          ["Swap",        fmtSigned(totalSwap, 0),    pnlClass(totalSwap)],
          ["Avg Hold",    `${avgHold.toFixed(1)}d`,   "text-slate-300"],
          ["Profit Factor", losers.length ? (Math.abs(winners.reduce((s,t) => s + t.netPnl, 0)) / Math.abs(losers.reduce((s,t) => s + t.netPnl, 0))).toFixed(2) : "∞", "text-slate-100"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`mt-1 font-mono text-lg font-semibold ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* P&L bar by symbol */}
      <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
        <div className="mb-2 text-[11px] text-slate-500">Net P&L by symbol (from closed deals)</div>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9 }} width={60} axisLine={false} tickLine={false} />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
              <Tooltip contentStyle={TT} formatter={(v) => [`$${fmtMoney(Number(v), 0)}`, "Net P&L"]} />
              <Bar dataKey="net" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {barData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? GREEN : RED} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trade table */}
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-right">Vol</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Gross P&L</th>
              <th className="px-3 py-2 text-right">Comm</th>
              <th className="px-3 py-2 text-right">Swap</th>
              <th className="px-3 py-2 text-right">Net P&L</th>
              <th className="px-3 py-2 text-right">Hold</th>
              <th className="px-3 py-2 text-right">Opened</th>
              <th className="px-3 py-2 text-right">Closed</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {trades.map((t) => (
              <tr key={t.symbol + t.openTime} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-sans font-semibold text-slate-200">{t.symbol}</td>
                <td className="px-3 py-2">
                  <span className={t.direction === "Long"
                    ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-400"
                    : "rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400"}>
                    {t.direction}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-300">{t.volume.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtMoney(t.entryPrice)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtMoney(t.exitPrice)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(t.grossPnl)}`}>{fmtSigned(t.grossPnl, 0)}</td>
                <td className="px-3 py-2 text-right text-rose-400/70">{fmtSigned(t.commission, 0)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(t.swap)}`}>{fmtSigned(t.swap, 0)}</td>
                <td className={`px-3 py-2 text-right font-bold ${pnlClass(t.netPnl)}`}>{fmtSigned(t.netPnl, 0)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{t.holdingDays}d</td>
                <td className="px-3 py-2 text-right text-slate-500">{fmtDate(t.openTime)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{fmtDate(t.closeTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 6. AI Insights (benchmark-relative) ───────────────────────────────────────

export function BrinsonInsights({ brinson, benchmarkName, period }: {
  brinson: BrinsonResult;
  benchmarkName: string;
  period: string;
}) {
  const insights = useMemo(() => buildBrinsonInsights(brinson, benchmarkName, period), [brinson, benchmarkName, period]);
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <ul className="space-y-1.5">
        {insights.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-300">
            <span className="text-cyan-500/60">▸</span><span>{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 font-mono text-[10px] text-slate-600">
        Brinson-Fachler methodology. Benchmark sector weights: S&P 500 GICS Q2 2025.
        Sector benchmark returns: SPDR ETF proxies (XLK, XLV, XLF, …). Residual = {brinson.residual.toFixed(3)}%.
      </div>
    </div>
  );
}

function buildBrinsonInsights(b: BrinsonResult, bm: string, period: string): string[] {
  const out: string[] = [];
  const ar = b.totalActiveReturn;
  const direction = ar >= 0 ? "outperformed" : "underperformed";

  out.push(`The portfolio ${direction} ${bm} by ${Math.abs(ar).toFixed(2)}% over the ${period} period (Portfolio ${b.portfolioReturn >= 0 ? "+" : ""}${b.portfolioReturn.toFixed(2)}%, Benchmark ${b.benchmarkReturn >= 0 ? "+" : ""}${b.benchmarkReturn.toFixed(2)}%).`);

  const drivers: string[] = [];
  if (Math.abs(b.allocationEffect) > 0.05) {
    const dir = b.allocationEffect > 0 ? "added" : "cost";
    drivers.push(`sector allocation ${dir} ${Math.abs(b.allocationEffect).toFixed(2)}%`);
  }
  if (Math.abs(b.selectionEffect) > 0.05) {
    const dir = b.selectionEffect > 0 ? "added" : "cost";
    drivers.push(`stock selection ${dir} ${Math.abs(b.selectionEffect).toFixed(2)}%`);
  }
  if (Math.abs(b.interactionEffect) > 0.05) {
    const dir = b.interactionEffect > 0 ? "added" : "cost";
    drivers.push(`the interaction effect (overweighting outperforming sectors) ${dir} ${Math.abs(b.interactionEffect).toFixed(2)}%`);
  }
  if (drivers.length) out.push(`Attribution breakdown: ${drivers.join("; ")}.`);

  // Best and worst sectors by total effect
  const sorted = [...b.sectors].filter((s) => s.portfolioWeight > 0);
  sorted.sort((a, z) => z.totalEffect - a.totalEffect);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best && best.totalEffect > 0.01) {
    out.push(`${best.sector} was the strongest contributor to active return (+${best.totalEffect.toFixed(2)}%), driven by ${best.selectionEffect > best.allocationEffect ? "favorable stock selection" : "an overweight position"} in a sector that returned ${best.benchmarkSectorReturn.toFixed(1)}% on the benchmark.`);
  }
  if (worst && worst.totalEffect < -0.01) {
    out.push(`${worst.sector} was the largest detractor (${worst.totalEffect.toFixed(2)}%), with the portfolio returning ${worst.portfolioReturn.toFixed(1)}% vs. the benchmark sector's ${worst.benchmarkSectorReturn.toFixed(1)}%.`);
  }

  // Allocation signal
  const topOverweight  = [...b.sectors].filter((s) => s.activeWeight > 3).sort((a, z) => z.activeWeight - a.activeWeight)[0];
  const topUnderweight = [...b.sectors].filter((s) => s.activeWeight < -3).sort((a, z) => a.activeWeight - z.activeWeight)[0];
  if (topOverweight) {
    const dir = topOverweight.allocationEffect > 0 ? "benefited from" : "suffered from";
    out.push(`The portfolio was ${topOverweight.activeWeight.toFixed(1)}% overweight ${topOverweight.sector} vs. ${bm}; this ${dir} a ${topOverweight.allocationEffect >= 0 ? "+" : ""}${topOverweight.allocationEffect.toFixed(2)}% allocation effect.`);
  }
  if (topUnderweight) {
    out.push(`An underweight of ${Math.abs(topUnderweight.activeWeight).toFixed(1)}% in ${topUnderweight.sector} contributed ${topUnderweight.allocationEffect >= 0 ? "+" : ""}${topUnderweight.allocationEffect.toFixed(2)}% to active return via the allocation effect.`);
  }

  // Explained vs residual
  const explained = Math.abs(b.explainedReturn);
  const pctExplained = ar !== 0 ? (explained / Math.abs(ar)) * 100 : 0;
  out.push(`Brinson-Fachler explains ${Math.min(100, pctExplained).toFixed(0)}% of the active return; the remaining ${Math.abs(b.residual).toFixed(3)}% residual reflects incomplete sector coverage and daily rebalancing effects.`);

  return out.slice(0, 7);
}

// ── Benchmark-relative performance chart (portfolio vs benchmark cumulative) ──

type AttrApiData = {
  benchmark: { dates: string[]; close: number[] };
  benchmarkName: string;
};

export function PortfolioBenchmarkChart({
  portfolioCum,
  portfolioDates,
  attrData,
}: {
  portfolioCum: number[];
  portfolioDates: string[];
  attrData: AttrApiData | null;
}) {
  const chartData = useMemo(() => {
    if (!attrData?.benchmark?.dates.length || !portfolioDates.length) return [];
    const bmMap = new Map(
      attrData.benchmark.dates.map((d, i) => [d, attrData.benchmark.close[i]])
    );
    const bmStart = attrData.benchmark.close[0] || 1;
    const portBase = portfolioCum[0] !== undefined ? portfolioCum[0] : 0;
    // Use the cumulative portfolio returns vs benchmark rebased to 0
    const portCumMap = new Map(portfolioDates.map((d, i) => [d, portfolioCum[i] ?? portBase]));
    const allDates = [...new Set([...portfolioDates, ...attrData.benchmark.dates])].sort();
    const result: { date: string; portfolio: number | null; benchmark: number | null }[] = [];
    for (const d of allDates) {
      const bm = bmMap.get(d);
      const port = portCumMap.get(d);
      if (bm !== undefined || port !== undefined) {
        result.push({
          date: d.slice(5),
          portfolio: port !== undefined ? +port.toFixed(2) : null,
          benchmark: bm !== undefined ? +((bm / bmStart - 1) * 100).toFixed(2) : null,
        });
      }
    }
    return result;
  }, [portfolioCum, portfolioDates, attrData]);

  if (!chartData.length) return null;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-1 text-[11px] text-slate-500">
        Portfolio cumulative return (%) vs {attrData?.benchmarkName ?? "benchmark"} — rebased to start of history
      </div>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 9 }} minTickGap={30} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} width={40}
              tickFormatter={(v) => `${v.toFixed(0)}%`} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Tooltip contentStyle={TT} formatter={(v, n) => [`${Number(v).toFixed(2)}%`, String(n)]} />
            <Line type="monotone" dataKey="portfolio" stroke={CYAN} dot={false} strokeWidth={2}
              name="Portfolio" connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="benchmark" stroke="#64748b" dot={false} strokeWidth={1.5}
              strokeDasharray="4 2" name={attrData?.benchmarkName ?? "Benchmark"}
              connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4">
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-6 rounded" style={{ background: CYAN }} /><span className="text-[10px] text-slate-500">Portfolio</span></div>
        <div className="flex items-center gap-1.5"><span className="h-0.5 w-6 rounded border-dashed border-slate-500" style={{ borderTop: "1px dashed #64748b", background: "transparent" }} /><span className="text-[10px] text-slate-500">{attrData?.benchmarkName ?? "Benchmark"}</span></div>
      </div>
    </div>
  );
}
