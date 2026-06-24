"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Deal } from "@/lib/types";
import { buildEquityFromDeals, filterByPeriod } from "@/lib/equity";
import { fmtMoney } from "@/lib/format";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "All"];

export default function EquityCurve({
  deals,
  currentEquity,
}: {
  deals: Deal[];
  currentEquity: number;
}) {
  const [period, setPeriod] = useState("1M");
  const full = useMemo(() => buildEquityFromDeals(deals, currentEquity), [deals, currentEquity]);
  const data = useMemo(() => filterByPeriod(full, period), [full, period]);

  const baseline = data[0]?.value ?? 0;
  // Normalize to P&L from period start so Y-axis shows gain/loss, not absolute notional
  const normalized = data.map((d) => ({ date: d.date, value: d.value - baseline }));

  const end = normalized[normalized.length - 1]?.value ?? 0;
  const up = end >= 0;
  const color = up ? "#10b981" : "#f43f5e";

  const values = normalized.map((d) => d.value);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 0);
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.2;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">
          Equity Curve
          <span className="ml-2 text-[11px] font-normal text-slate-500">P&L from period start</span>
        </div>
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
      <div className="h-[300px]">
        {normalized.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={normalized} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
                domain={[lo - pad, hi + pad]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={(v) => {
                  const n = Number(v);
                  const sign = n >= 0 ? "+" : "";
                  const abs = Math.abs(n);
                  return sign + "$" + (abs >= 1000 ? (abs / 1000).toFixed(1) + "K" : abs.toFixed(0));
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
                  return [(n >= 0 ? "+" : "") + "$" + fmtMoney(n, 0), "Period P&L"];
                }}
              />
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
