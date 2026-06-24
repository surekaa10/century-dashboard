"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Position } from "@/lib/types";
import { fmtCompact, fmtMoney } from "@/lib/format";

const PALETTE = [
  "#38bdf8", "#a78bfa", "#10b981", "#fb923c", "#fbbf24",
  "#f43f5e", "#22d3ee", "#c084fc", "#34d399", "#f472b6",
  "#60a5fa", "#facc15",
];

export default function AllocationDonut({ positions }: { positions: Position[] }) {
  const data = useMemo(() => {
    const bySym = new Map<string, number>();
    for (const p of positions) {
      bySym.set(p.symbol, (bySym.get(p.symbol) ?? 0) + Math.abs(p.marketValue));
    }
    return [...bySym.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [positions]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-sm font-semibold text-slate-200">Allocation by Symbol</div>
      <div className="relative h-[300px]">
        {data.length ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="85%"
                  paddingAngle={1.5}
                  stroke="#060a14"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0d1321",
                    border: "1px solid rgba(56,189,248,0.25)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const v = Number(value);
                    return [`$${fmtMoney(v, 0)} · ${((v / total) * 100).toFixed(1)}%`, String(name)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-xl font-semibold text-slate-100">
                ${fmtCompact(total)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                total MV
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No positions
          </div>
        )}
      </div>
    </div>
  );
}
