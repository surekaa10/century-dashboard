"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Account, Position, SymbolRates } from "@/lib/types";
import { buildPnlCurve, buildYesterdayPnlFromRates, filterByPeriod } from "@/lib/equity";
import type { EquityPoint } from "@/lib/equity";
import { fmtMoney } from "@/lib/format";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "All"];

// P&L-style metrics centre on zero & colour by sign; level metrics scale to data.
const PNL_METRICS = new Set(["Floating P&L", "Yesterday P&L", "Today Realized", "Swap"]);

export default function EquityCurve({
  positions,
  symbolRates,
  account,
  todayRealized,
  metric = "Floating P&L",
}: {
  positions: Position[];
  symbolRates: SymbolRates;
  account: Account;
  todayRealized: number;
  metric?: string;
}) {
  const [period, setPeriod] = useState("1M");
  const [yZoom, setYZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startZoom: number } | null>(null);

  const floating = useMemo(() => buildPnlCurve(positions, symbolRates), [positions, symbolRates]);

  // Build the series for the selected metric off the floating-P&L backbone.
  // Floating P&L and Equity have a genuine reconstructed daily trend; the other
  // account fields are point-in-time, so we plot their current level honestly.
  const { series, reconstructed } = useMemo(() => {
    const currentFloating = floating.length ? floating[floating.length - 1].value : 0;
    const swap = positions.reduce((s, p) => s + p.swap, 0);
    const { yesterdayPnl } = buildYesterdayPnlFromRates(positions, symbolRates);

    if (metric === "Floating P&L") return { series: floating, reconstructed: true };
    if (metric === "Equity") {
      const offset = account.equity - currentFloating; // ≈ balance + credit + swap
      return { series: floating.map((p) => ({ date: p.date, value: p.value + offset })), reconstructed: true };
    }
    const consts: Record<string, number> = {
      Balance: account.balance,
      Credit: account.credit,
      Swap: swap,
      Margin: account.margin,
      "Free Margin": account.freeMargin,
      "Today Realized": todayRealized,
      "Yesterday P&L": yesterdayPnl,
    };
    const v = consts[metric] ?? 0;
    return { series: floating.map((p) => ({ date: p.date, value: v })) as EquityPoint[], reconstructed: false };
  }, [metric, floating, positions, symbolRates, account, todayRealized]);

  const data = useMemo(() => filterByPeriod(series, period), [series, period]);

  const end = data[data.length - 1]?.value ?? 0;
  const isPnl = PNL_METRICS.has(metric);
  const color = isPnl ? (end >= 0 ? "#10b981" : "#f43f5e") : "#22d3ee";

  const values = data.map((d) => d.value);
  const lo = isPnl ? Math.min(...values, 0) : Math.min(...values);
  const hi = isPnl ? Math.max(...values, 0) : Math.max(...values);
  const center = (lo + hi) / 2;
  const naturalRange = (hi - lo) || Math.abs(hi) * 0.05 || 100;
  const halfRange = (naturalRange / 2 + naturalRange * 0.15) / yZoom;
  const domainLo = center - halfRange;
  const domainHi = center + halfRange;

  // Y-axis drag
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.clientX - rect.left < rect.width - 72) return;
    dragRef.current = { startY: e.clientY, startZoom: yZoom };
    e.preventDefault();
  };

  // Y-axis scroll
  const handleWheel = (e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.clientX - rect.left < rect.width - 72) return;
    setYZoom((prev) => Math.max(0.1, Math.min(50, prev * Math.exp(-e.deltaY * 0.002))));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = e.clientY - dragRef.current.startY;
      setYZoom(Math.max(0.1, Math.min(50, dragRef.current.startZoom * Math.exp(dy * 0.008))));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">
          {metric}
          <span className="ml-2 text-[11px] font-normal text-slate-500">
            {reconstructed ? "reconstructed daily trend · drag or scroll Y-axis to zoom" : "current level — no daily history to reconstruct"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {yZoom !== 1 && (
            <button
              onClick={() => setYZoom(1)}
              className="rounded px-2 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700"
            >
              Reset zoom
            </button>
          )}
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded px-2 py-0.5 text-xs ${
                  p === period
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[300px] cursor-ns-resize select-none"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={(d) => String(d).slice(5)}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                orientation="right"
                domain={[domainLo, domainHi]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={(v) => {
                  const n = Number(v);
                  const sign = n >= 0 ? "+" : "-";
                  const abs = Math.abs(n);
                  return (isPnl ? sign : "") + "$" + (abs >= 1000 ? (abs / 1000).toFixed(1) + "K" : abs.toFixed(0));
                }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  background: "#0d1321",
                  border: "1px solid rgba(56,189,248,0.25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(value) => {
                  const n = Number(value);
                  return [(isPnl && n >= 0 ? "+" : "") + "$" + fmtMoney(n, 0), metric];
                }}
              />
              {isPnl && <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />}
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill="url(#eq)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No account history available
          </div>
        )}
      </div>
    </div>
  );
}
