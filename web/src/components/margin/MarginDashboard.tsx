"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildMarginAnalytics, type MarginPosition, type StressScenario } from "@/lib/margin";
import { fmtMoney, fmtSigned, fmtPct, fmtCompact, pnlClass } from "@/lib/format";
import { Section, Panel } from "@/components/analytics/ui";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
} from "recharts";

// ── Gauge (custom SVG half-circle) ──────────────────────────────────────────

function Gauge({
  value,
  max,
  label,
  sub,
  thresholds, // [{at: number, color: string}] ascending
}: {
  value: number;
  max: number;
  label: string;
  sub?: string;
  thresholds: { at: number; color: string }[];
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  // Arc: -180deg (left) to 0deg (right), centre at 0deg=right, so we need -180 to 0
  // SVG arc from (10,60) to (90,60) with cx=50, cy=60, r=40
  const cx = 50; const cy = 60; const r = 38;
  // Needle angle in degrees: -180 = left (0%), 0 = right (100%)
  const needleAngleDeg = -180 + pct * 180;
  const needleRad = (needleAngleDeg * Math.PI) / 180;
  const nx = cx + r * Math.cos(needleRad);
  const ny = cy + r * Math.sin(needleRad);

  // Determine current color from thresholds
  let currentColor = thresholds[0]?.color ?? "#10b981";
  for (const t of thresholds) {
    if (value >= t.at) currentColor = t.color;
  }

  // Arc segments
  const arcPath = (fromPct: number, toPct: number) => {
    const a1 = (-180 + fromPct * 180) * (Math.PI / 180);
    const a2 = (-180 + toPct * 180) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const largeArc = toPct - fromPct > 0.5 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 70" className="w-full max-w-[160px]">
        {/* Track */}
        <path d={arcPath(0, 1)} fill="none" stroke="#1e293b" strokeWidth={8} />
        {/* Colored fill up to value */}
        <path d={arcPath(0, pct)} fill="none" stroke={currentColor} strokeWidth={8} strokeLinecap="round" />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke="#e2e8f0" strokeWidth={1.5} strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={2.5} fill="#e2e8f0" />
      </svg>
      <div className={`-mt-1 font-mono text-xl font-bold ${currentColor === "#10b981" ? "text-emerald-400" : currentColor === "#f59e0b" ? "text-amber-400" : currentColor === "#f97316" ? "text-orange-400" : "text-rose-400"}`}>
        {label}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueClass = "text-slate-100",
  sub,
  hint,
  badge,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
  hint?: string;
  badge?: { text: string; color: string };
}) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-3 py-2.5">
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        {badge && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <div className={`mt-1 font-mono text-base font-semibold leading-tight ${valueClass}`}>{value}</div>
      {sub && (
        <div className={`mt-0.5 font-mono text-[10px] ${sub.startsWith("+") ? "text-emerald-500" : sub.startsWith("-") ? "text-rose-400" : "text-slate-500"}`}>
          {sub}
        </div>
      )}
      {hint && <div className="mt-0.5 text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function Alert({ level, text }: { level: "info" | "warn" | "danger" | "critical"; text: string }) {
  const styles = {
    info: "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    danger: "border-orange-500/30 bg-orange-500/5 text-orange-300",
    critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  };
  const icons = { info: "ℹ", warn: "⚠", danger: "▲", critical: "✕" };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${styles[level]}`}>
      <span className="shrink-0 text-base leading-snug">{icons[level]}</span>
      {text}
    </div>
  );
}

// ── Margin breakdown table row ────────────────────────────────────────────────

type SortKey = "symbol" | "notional" | "marginUsed" | "impliedLeverage" | "distToLiqPct" | "unrealizedPnl";

function MarginBreakdownTable({ positions }: { positions: MarginPosition[] }) {
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "notional",
    asc: false,
  });

  const sorted = useMemo(() => {
    const rows = [...positions];
    rows.sort((a, b) => {
      const va = a[sort.key] as number | string;
      const vb = b[sort.key] as number | string;
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sort.asc ? cmp : -cmp;
    });
    return rows;
  }, [positions, sort]);

  const th = (label: string, key: SortKey) => (
    <th
      className="cursor-pointer select-none px-4 py-2 text-left hover:text-slate-300 transition-colors"
      onClick={() =>
        setSort((s) => ({ key, asc: s.key === key ? !s.asc : false }))
      }
    >
      {label} {sort.key === key ? (sort.asc ? "↑" : "↓") : ""}
    </th>
  );

  const marginTotal = positions.reduce((s, p) => s + p.marginUsed, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
            {th("Symbol", "symbol")}
            <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500">Asset Class</th>
            <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500">Side</th>
            {th("Notional", "notional")}
            {th("Margin Used", "marginUsed")}
            <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500">Margin %</th>
            {th("Leverage", "impliedLeverage")}
            {th("Dist to Liq", "distToLiqPct")}
            <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wider text-slate-500">Liq Price</th>
            {th("Unrealized P&L", "unrealizedPnl")}
          </tr>
        </thead>
        <tbody className="font-mono">
          {sorted.map((p) => {
            const marginShare = marginTotal > 0 ? (p.marginUsed / marginTotal) * 100 : 0;
            const distClass =
              p.distToLiqPct < 10
                ? "text-rose-400 font-semibold"
                : p.distToLiqPct < 20
                ? "text-orange-400"
                : p.distToLiqPct < 30
                ? "text-amber-400"
                : "text-emerald-400";
            return (
              <tr key={p.symbol} className="border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-200">{p.symbol}</td>
                <td className="px-4 py-2.5 text-slate-400">{p.assetClass}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs ${p.direction === "Long" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    {p.direction}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-300">${fmtCompact(p.notional)}</td>
                <td className="px-4 py-2.5 text-right text-amber-300">${fmtCompact(p.marginUsed)}</td>
                <td className="px-4 py-2.5 text-right text-slate-400">{marginShare.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right text-cyan-300">{p.impliedLeverage.toFixed(1)}x</td>
                <td className={`px-4 py-2.5 text-right ${distClass}`}>{p.distToLiqPct.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{fmtMoney(p.liqPrice)}</td>
                <td className={`px-4 py-2.5 text-right ${pnlClass(p.unrealizedPnl)}`}>{fmtSigned(p.unrealizedPnl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Stress test table ─────────────────────────────────────────────────────────

function StressTable({ tests, equity }: { tests: StressScenario[]; equity: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 text-left">Scenario</th>
            <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wider text-slate-500">Description</th>
            <th className="px-4 py-2 text-right">P&L Impact</th>
            <th className="px-4 py-2 text-right">New Equity</th>
            <th className="px-4 py-2 text-right">New Margin Level</th>
            <th className="px-4 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {tests.map((t) => {
            const mlClass = t.stopOutTriggered
              ? "text-rose-400 font-semibold"
              : t.marginCallTriggered
              ? "text-orange-400 font-semibold"
              : t.newMarginLevel < 200
              ? "text-amber-400"
              : t.newMarginLevel < 300
              ? "text-yellow-300"
              : "text-emerald-400";
            const status = t.stopOutTriggered
              ? { label: "STOP-OUT", cls: "bg-rose-500/20 text-rose-300" }
              : t.marginCallTriggered
              ? { label: "MARGIN CALL", cls: "bg-orange-500/20 text-orange-300" }
              : t.newMarginLevel < 200
              ? { label: "WARNING", cls: "bg-amber-500/15 text-amber-300" }
              : { label: "SAFE", cls: "bg-emerald-500/10 text-emerald-400" };
            const equityChangePct = equity > 0 ? ((t.newEquity - equity) / equity) * 100 : 0;
            return (
              <tr key={t.label} className="border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-200">{t.label}</td>
                <td className="px-4 py-2.5 text-slate-500 font-sans text-[11px]">{t.description}</td>
                <td className={`px-4 py-2.5 text-right ${pnlClass(t.pnlImpact)}`}>{fmtSigned(t.pnlImpact, 0)}</td>
                <td className="px-4 py-2.5 text-right text-slate-300">
                  ${fmtCompact(t.newEquity)}
                  <span className={`ml-1 text-[10px] ${pnlClass(equityChangePct)}`}>
                    ({equityChangePct >= 0 ? "+" : ""}{equityChangePct.toFixed(1)}%)
                  </span>
                </td>
                <td className={`px-4 py-2.5 text-right ${mlClass}`}>
                  {isFinite(t.newMarginLevel) ? t.newMarginLevel.toFixed(0) + "%" : "∞"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Liquidation Radar ─────────────────────────────────────────────────────────

type ScatterPoint = { x: number; y: number; z: number; name: string; liqPrice: number };

function LiquidationRadar({ positions }: { positions: MarginPosition[] }) {
  const toPoint = (p: MarginPosition): ScatterPoint => ({
    x: p.distToLiqPct,
    y: p.notional,
    z: p.marginUsed,
    name: p.symbol,
    liqPrice: p.liqPrice,
  });

  const critical = positions.filter((p) => p.distToLiqPct < 10).map(toPoint);
  const danger = positions.filter((p) => p.distToLiqPct >= 10 && p.distToLiqPct < 20).map(toPoint);
  const elevated = positions.filter((p) => p.distToLiqPct >= 20 && p.distToLiqPct < 30).map(toPoint);
  const safe = positions.filter((p) => p.distToLiqPct >= 30).map(toPoint);

  const TT = { background: "#0d1321", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 8, fontSize: 12 };

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
          <XAxis
            type="number"
            dataKey="x"
            name="Dist to Liq"
            unit="%"
            tick={{ fill: "#64748b", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Distance to Liquidation (%)", position: "insideBottom", offset: -12, fill: "#475569", fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Notional"
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickFormatter={(v) => "$" + fmtCompact(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <ZAxis type="number" dataKey="z" range={[60, 400]} name="Margin" />
          <Tooltip
            contentStyle={TT}
            cursor={{ stroke: "rgba(56,189,248,0.2)", strokeWidth: 1 }}
            formatter={(value, name) => {
              const n = Number(value);
              const nm = String(name);
              if (nm === "Notional" || nm === "Margin") return [`$${fmtCompact(n)}`, nm];
              return [`${n.toFixed(1)}%`, nm];
            }}
          />
          <ReferenceLine x={10} stroke="#f43f5e" strokeDasharray="3 3" strokeOpacity={0.5}
            label={{ value: "Critical", position: "top", fill: "#f43f5e", fontSize: 9 }} />
          <ReferenceLine x={20} stroke="#f97316" strokeDasharray="3 3" strokeOpacity={0.5}
            label={{ value: "Danger", position: "top", fill: "#f97316", fontSize: 9 }} />
          {critical.length > 0 && <Scatter name="Critical" data={critical} fill="#f43f5e" fillOpacity={0.8} />}
          {danger.length > 0 && <Scatter name="Danger" data={danger} fill="#f97316" fillOpacity={0.8} />}
          {elevated.length > 0 && <Scatter name="Elevated" data={elevated} fill="#f59e0b" fillOpacity={0.8} />}
          {safe.length > 0 && <Scatter name="Safe" data={safe} fill="#10b981" fillOpacity={0.8} />}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Deleverage simulator ──────────────────────────────────────────────────────

function DeleverageSimulator({
  positions,
  account,
}: {
  positions: MarginPosition[];
  account: Snapshot["account"];
}) {
  const [targetLevel, setTargetLevel] = useState(200);
  if (!account) return null;

  // Sorted by worst margin efficiency (most margin per $ of exposure)
  const ranked = [...positions].sort((a, b) => b.marginUsed - a.marginUsed);

  // Simulate closing positions from worst to best until target is met
  let runningMargin = account.margin;
  const runningEquity = account.equity;
  const steps: { symbol: string; marginFreed: number; newLevel: number; cumPnl: number }[] = [];
  let cumPnl = 0;

  for (const p of ranked) {
    if (account.margin > 0 && (runningEquity / runningMargin) * 100 >= targetLevel) break;
    runningMargin -= p.marginUsed;
    cumPnl += p.unrealizedPnl;
    const newLevel = runningMargin > 0 ? (runningEquity / runningMargin) * 100 : Infinity;
    steps.push({
      symbol: p.symbol,
      marginFreed: p.marginUsed,
      newLevel,
      cumPnl,
    });
  }

  const currentLevel = account.margin > 0 ? (account.equity / account.margin) * 100 : Infinity;
  const alreadyMet = currentLevel >= targetLevel;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider">Target Margin Level</span>
        {[150, 200, 300, 500].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setTargetLevel(lvl)}
            className={`rounded px-3 py-1 text-xs font-mono ${targetLevel === lvl ? "bg-cyan-500/20 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
          >
            {lvl}%
          </button>
        ))}
      </div>
      {alreadyMet ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
          Already at {currentLevel.toFixed(0)}% — no forced deleveraging required at this threshold.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 text-left">Step</th>
                <th className="px-4 py-2 text-left">Close Position</th>
                <th className="px-4 py-2 text-right">Margin Freed</th>
                <th className="px-4 py-2 text-right">New Margin Level</th>
                <th className="px-4 py-2 text-right">Realized P&L</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {steps.map((s, i) => (
                <tr key={s.symbol} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2 font-sans font-semibold text-slate-200">{s.symbol}</td>
                  <td className="px-4 py-2 text-right text-amber-300">${fmtCompact(s.marginFreed)}</td>
                  <td className={`px-4 py-2 text-right ${isFinite(s.newLevel) && s.newLevel >= targetLevel ? "text-emerald-400" : "text-amber-400"}`}>
                    {isFinite(s.newLevel) ? s.newLevel.toFixed(0) + "%" : "∞"}
                  </td>
                  <td className={`px-4 py-2 text-right ${pnlClass(s.cumPnl)}`}>{fmtSigned(s.cumPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function MarginDashboard({ snapshot }: { snapshot: Snapshot }) {
  const account = snapshot.account!;

  const ma = useMemo(
    () => buildMarginAnalytics(account, snapshot.positions),
    [account, snapshot.positions],
  );

  // ── Risk alerts ──
  const alerts: { level: "info" | "warn" | "danger" | "critical"; text: string }[] = [];

  if (account.marginLevel < 150) {
    alerts.push({
      level: "critical",
      text: `CRITICAL: Margin level at ${account.marginLevel.toFixed(0)}% — approaching stop-out threshold (50%). Immediate action required.`,
    });
  } else if (account.marginLevel < 200) {
    alerts.push({
      level: "danger",
      text: `DANGER: Margin level at ${account.marginLevel.toFixed(0)}% — close to margin call territory. Consider reducing exposure.`,
    });
  } else if (account.marginLevel < 300) {
    alerts.push({
      level: "warn",
      text: `WARNING: Margin level at ${account.marginLevel.toFixed(0)}% — elevated risk. Monitor closely.`,
    });
  }

  const dangerPositions = ma.positions.filter((p) => p.distToLiqPct < 15);
  if (dangerPositions.length > 0) {
    alerts.push({
      level: "danger",
      text: `${dangerPositions.length} position${dangerPositions.length > 1 ? "s" : ""} within 15% of liquidation price: ${dangerPositions.map((p) => p.symbol).join(", ")}.`,
    });
  }

  if (ma.portfolioLeverage > 10) {
    alerts.push({
      level: "warn",
      text: `High leverage: ${ma.portfolioLeverage.toFixed(1)}x gross portfolio leverage. Tail risk is elevated.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "info",
      text: `All systems nominal. Margin level ${account.marginLevel.toFixed(0)}% — ${fmtPct(account.equity > 0 ? (ma.equityDropToStopOut / account.equity) * 100 : 0)} equity cushion to stop-out.`,
    });
  }

  // ── Margin level badge ──
  const mlBadge =
    account.marginLevel < 150
      ? { text: "CRITICAL", color: "bg-rose-500/20 text-rose-300" }
      : account.marginLevel < 200
      ? { text: "DANGER", color: "bg-orange-500/20 text-orange-300" }
      : account.marginLevel < 300
      ? { text: "WARN", color: "bg-amber-500/15 text-amber-300" }
      : { text: "SAFE", color: "bg-emerald-500/10 text-emerald-400" };

  const excessLiquidity = Math.max(0, account.freeMargin - account.margin * 0.3);
  const netLiq = account.balance + account.credit;
  const marginUsedPct = account.equity > 0 ? (account.margin / account.equity) * 100 : 0;

  return (
    <div className="px-6 pb-10">
      {/* Risk Alerts */}
      <section className="mt-4 space-y-2">
        {alerts.map((a, i) => (
          <Alert key={i} level={a.level} text={a.text} />
        ))}
      </section>

      {/* KPI Grid */}
      <Section title="Margin & Leverage Intelligence" subtitle="Real-time risk snapshot">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard
            label="Total Equity"
            value={`$${fmtCompact(account.equity)}`}
            hint={account.currency}
            valueClass="text-slate-100"
          />
          <KpiCard
            label="Net Liq Value"
            value={`$${fmtCompact(netLiq)}`}
            hint="bal + credit"
            valueClass="text-cyan-300"
          />
          <KpiCard
            label="Margin Used"
            value={`$${fmtCompact(account.margin)}`}
            sub={`${marginUsedPct.toFixed(1)}% of equity`}
            valueClass="text-amber-300"
          />
          <KpiCard
            label="Free Margin"
            value={`$${fmtCompact(account.freeMargin)}`}
            hint="buying power"
            valueClass={account.freeMargin < account.margin * 0.5 ? "text-orange-400" : "text-emerald-400"}
          />
          <KpiCard
            label="Margin Level"
            value={`${account.marginLevel.toFixed(0)}%`}
            badge={mlBadge}
            valueClass={account.marginLevel < 200 ? "text-rose-400" : account.marginLevel < 300 ? "text-amber-400" : "text-emerald-400"}
          />
          <KpiCard
            label="Excess Liquidity"
            value={`$${fmtCompact(excessLiquidity)}`}
            hint="above maint. buffer"
            valueClass="text-slate-300"
          />
          <KpiCard
            label="Gross Exposure"
            value={`$${fmtCompact(ma.grossExposure)}`}
            hint="Σ|notional|"
          />
          <KpiCard
            label="Net Exposure"
            value={fmtSigned(ma.netExposure, 0).replace("+$", "+$").replace("$", "$")}
            sub={ma.netExposure >= 0 ? "Long bias" : "Short bias"}
            valueClass={ma.netExposure >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
          <KpiCard
            label="Portfolio Leverage"
            value={`${ma.portfolioLeverage.toFixed(1)}x`}
            hint="gross / equity"
            valueClass={ma.portfolioLeverage > 8 ? "text-orange-400" : ma.portfolioLeverage > 5 ? "text-amber-400" : "text-slate-100"}
          />
          <KpiCard
            label="Financing Cost"
            value={fmtSigned(ma.financingCost)}
            hint="total swap"
            valueClass={pnlClass(ma.financingCost)}
          />
          <KpiCard
            label="Margin Efficiency"
            value={`${ma.marginEfficiency >= 0 ? "+" : ""}${ma.marginEfficiency.toFixed(1)}%`}
            hint="P&L / margin"
            valueClass={pnlClass(ma.marginEfficiency)}
          />
          <KpiCard
            label="Margin Call Risk"
            value={`${ma.marginCallRisk.toFixed(0)}%`}
            hint="proximity to call"
            valueClass={ma.marginCallRisk > 60 ? "text-rose-400" : ma.marginCallRisk > 40 ? "text-orange-400" : ma.marginCallRisk > 25 ? "text-amber-400" : "text-emerald-400"}
          />
        </div>
      </Section>

      {/* Gauges + Waterfall */}
      <Section title="Exposure & Leverage Overview" subtitle="Portfolio risk at a glance">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Margin Level Gauge */}
          <Panel className="flex flex-col items-center justify-center gap-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Margin Level</div>
            <Gauge
              value={Math.min(account.marginLevel, 600)}
              max={600}
              label={`${account.marginLevel.toFixed(0)}%`}
              sub="100% = margin call · 50% = stop-out"
              thresholds={[
                { at: 0, color: "#f43f5e" },
                { at: 150, color: "#f97316" },
                { at: 200, color: "#f59e0b" },
                { at: 300, color: "#10b981" },
              ]}
            />
            <div className="mt-1 grid w-full grid-cols-2 gap-2 text-[10px]">
              <div className="rounded border border-white/[0.06] px-2 py-1 text-center">
                <div className="text-slate-500">To Margin Call</div>
                <div className="font-mono text-rose-400">${fmtCompact(ma.equityDropToMarginCall)}</div>
              </div>
              <div className="rounded border border-white/[0.06] px-2 py-1 text-center">
                <div className="text-slate-500">To Stop-Out</div>
                <div className="font-mono text-orange-400">${fmtCompact(ma.equityDropToStopOut)}</div>
              </div>
            </div>
          </Panel>

          {/* Leverage Gauge */}
          <Panel className="flex flex-col items-center justify-center gap-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Portfolio Leverage</div>
            <Gauge
              value={Math.min(ma.portfolioLeverage, 20)}
              max={20}
              label={`${ma.portfolioLeverage.toFixed(1)}x`}
              sub="gross notional / equity"
              thresholds={[
                { at: 0, color: "#10b981" },
                { at: 5, color: "#f59e0b" },
                { at: 8, color: "#f97316" },
                { at: 12, color: "#f43f5e" },
              ]}
            />
            <div className="mt-1 grid w-full grid-cols-2 gap-2 text-[10px]">
              <div className="rounded border border-white/[0.06] px-2 py-1 text-center">
                <div className="text-slate-500">Gross Exp.</div>
                <div className="font-mono text-slate-300">${fmtCompact(ma.grossExposure)}</div>
              </div>
              <div className="rounded border border-white/[0.06] px-2 py-1 text-center">
                <div className="text-slate-500">Net Exp.</div>
                <div className={`font-mono ${ma.netExposure >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{ma.netExposure >= 0 ? "+" : ""}${fmtCompact(Math.abs(ma.netExposure))}</div>
              </div>
            </div>
          </Panel>

          {/* Margin by Asset Class Waterfall */}
          <Panel>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Margin by Asset Class</div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ma.byAssetClass}
                  layout="vertical"
                  margin={{ top: 0, right: 8, bottom: 0, left: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "#64748b", fontSize: 9 }}
                    tickFormatter={(v) => "$" + fmtCompact(v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="assetClass"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0d1321",
                      border: "1px solid rgba(56,189,248,0.25)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v) => [`$${fmtCompact(Number(v))}`, "Margin Used"]}
                  />
                  <Bar dataKey="marginUsed" radius={3}>
                    {ma.byAssetClass.map((entry, i) => {
                      const colors = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];
                      return <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.8} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-2">
              {ma.byAssetClass.map((ac, i) => {
                const colors = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];
                return (
                  <div key={ac.assetClass} className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                    {ac.assetClass} · ${fmtCompact(ac.notional)}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </Section>

      {/* Instrument Margin Breakdown */}
      <Section
        title="Instrument Margin Breakdown"
        subtitle="Per-position margin usage, leverage, and liquidation distances — click headers to sort"
      >
        <MarginBreakdownTable positions={ma.positions} />
      </Section>

      {/* Liquidation Radar */}
      <Section
        title="Liquidation Radar"
        subtitle="Positions plotted by distance to liquidation — smaller distance means higher risk"
      >
        <Panel>
          <div className="mb-2 flex gap-4 text-[10px]">
            {[
              { color: "bg-rose-500", label: "Critical (<10%)" },
              { color: "bg-orange-500", label: "Danger (10–20%)" },
              { color: "bg-amber-500", label: "Elevated (20–30%)" },
              { color: "bg-emerald-500", label: "Safe (>30%)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 text-slate-400">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                {label}
              </div>
            ))}
            <span className="ml-auto text-slate-600">Bubble size = margin used</span>
          </div>
          <LiquidationRadar positions={ma.positions} />
        </Panel>
      </Section>

      {/* Stress Testing */}
      <Section
        title="Stress Testing"
        subtitle="Simulated margin levels under market shock scenarios"
      >
        <StressTable tests={ma.stressTests} equity={account.equity} />
      </Section>

      {/* Forced Deleverage Simulator */}
      <Section
        title="Forced Deleveraging Simulator"
        subtitle="Optimal unwind sequence to restore a target margin level"
      >
        <Panel>
          <DeleverageSimulator positions={ma.positions} account={account} />
        </Panel>
      </Section>

      {/* Buying Power by Asset Class */}
      <Section
        title="Buying Power & Concentration"
        subtitle="Remaining capacity and concentration risk"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ma.byAssetClass.map((ac) => {
            const pct = ma.grossExposure > 0 ? (ac.notional / ma.grossExposure) * 100 : 0;
            return (
              <Panel key={ac.assetClass}>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{ac.assetClass}</div>
                <div className="font-mono text-base font-semibold text-slate-200">${fmtCompact(ac.notional)}</div>
                <div className="mt-1 font-mono text-[11px] text-slate-400">{pct.toFixed(1)}% of gross exposure</div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${Math.min(100, pct)}%`, opacity: 0.7 }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
                  <span>{ac.count} positions</span>
                  <span className={pnlClass(ac.pnl)}>{fmtSigned(ac.pnl, 0)} P&L</span>
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
