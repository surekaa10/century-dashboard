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

  const start = data[0]?.value ?? 0;
  const end = data[data.length - 1]?.value ?? 0;
  const up = end >= start;
  const color = up ? "#10b981" : "#f43f5e";

  const values = data.map((d) => d.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo || Math.abs(hi) * 0.01 || 1) * 0.2;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Equity Curve</div>
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
                domain={[lo - pad, hi + pad]}
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={(v) => "$" + (Number(v) / 1000).toFixed(0) + "K"}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: "#0d1321",
                  border: "1px solid rgba(56,189,248,0.25)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(value) => ["$" + fmtMoney(Number(value), 0), "Equity"]}
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
