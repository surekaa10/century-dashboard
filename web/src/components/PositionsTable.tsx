"use client";

import type { Position } from "@/lib/types";
import { fmtMoney, fmtSigned, pnlClass } from "@/lib/format";

export default function PositionsTable({ positions }: { positions: Position[] }) {
  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue);

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">
        Open Positions <span className="text-slate-500">({positions.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-right">Volume</th>
              <th className="px-4 py-2 text-right">Entry</th>
              <th className="px-4 py-2 text-right">Current</th>
              <th className="px-4 py-2 text-right">Market Value</th>
              <th className="px-4 py-2 text-right">Swap</th>
              <th className="px-4 py-2 text-right">Unrealized P&L</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((p, i) => (
              <tr key={`${p.symbol}-${i}`} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 text-left font-sans font-medium text-slate-200">
                  {p.symbol}
                </td>
                <td className="px-4 py-2 text-left">
                  <span
                    className={
                      p.direction === "Long"
                        ? "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400"
                        : "rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400"
                    }
                  >
                    {p.direction}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-slate-300">{p.volume}</td>
                <td className="px-4 py-2 text-right text-slate-400">{fmtMoney(p.entryPrice)}</td>
                <td className="px-4 py-2 text-right text-slate-300">{fmtMoney(p.currentPrice)}</td>
                <td className="px-4 py-2 text-right text-slate-300">{fmtMoney(p.marketValue)}</td>
                <td className={`px-4 py-2 text-right ${pnlClass(p.swap)}`}>{fmtSigned(p.swap)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${pnlClass(p.unrealizedPnl)}`}>
                  {fmtSigned(p.unrealizedPnl)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
