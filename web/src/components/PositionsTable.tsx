"use client";

import { useState } from "react";
import type { Position } from "@/lib/types";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

function groupBySymbol(positions: Position[]): Map<string, Position[]> {
  const map = new Map<string, Position[]>();
  for (const p of positions) {
    const key = p.symbol.trim();
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return map;
}

export default function PositionsTable({ positions }: { positions: Position[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalMv = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;
  const grouped = groupBySymbol(positions);
  const symbols = [...grouped.keys()].sort((a, b) => {
    const mvA = grouped.get(a)!.reduce((s, p) => s + Math.abs(p.marketValue), 0);
    const mvB = grouped.get(b)!.reduce((s, p) => s + Math.abs(p.marketValue), 0);
    return mvB - mvA;
  });

  const toggle = (sym: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">
        Open Positions{" "}
        <span className="text-slate-500">
          ({symbols.length} instrument{symbols.length !== 1 ? "s" : ""}
          {positions.length !== symbols.length ? `, ${positions.length} fills` : ""})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="w-6 px-2 py-2" />
              <th className="px-4 py-2 text-left">Symbol</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-right">Total Qty</th>
              <th className="px-4 py-2 text-right">Avg Entry</th>
              <th className="px-4 py-2 text-right">Current</th>
              <th className="px-4 py-2 text-right">Market Value</th>
              <th className="px-4 py-2 text-right">Cost Value</th>
              <th className="px-4 py-2 text-right">Unrealized P&L</th>
              <th className="px-4 py-2 text-right">P&L %</th>
              <th className="px-4 py-2 text-right">Weight %</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {symbols.map((sym) => {
              const fills = grouped.get(sym)!;
              const totalVol = fills.reduce((s, p) => s + p.volume, 0);
              const avgEntry = fills.reduce((s, p) => s + p.entryPrice * p.volume, 0) / totalVol;
              const totalMvSym = fills.reduce((s, p) => s + p.marketValue, 0);
              const totalPnl = fills.reduce((s, p) => s + p.unrealizedPnl, 0);
              const costValue = fills.reduce((s, p) => s + p.entryPrice * p.volume, 0);
              const currentPrice = fills[0].currentPrice;
              const direction = fills[0].direction;
              const basis = Math.abs(avgEntry * totalVol);
              const pnlPct = basis > 0 ? (totalPnl / basis) * 100 : 0;
              const weight = (Math.abs(totalMvSym) / totalMv) * 100;
              const isOpen = expanded.has(sym);
              const multiFill = fills.length > 1;

              return (
                <>
                  {/* ── Instrument summary row ── */}
                  <tr
                    key={sym}
                    onClick={() => multiFill && toggle(sym)}
                    className={`border-t border-white/[0.04] transition-colors ${multiFill ? "cursor-pointer hover:bg-white/[0.025]" : ""}`}
                  >
                    <td className="px-2 py-2.5 text-center text-slate-600">
                      {multiFill && (
                        <span className="select-none text-xs text-slate-500">
                          {isOpen ? "▾" : "▸"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <span className="font-sans font-semibold text-slate-200">{sym}</span>
                      {multiFill && (
                        <span className="ml-2 text-[10px] text-slate-600">{fills.length} fills</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <span
                        className={
                          direction === "Long"
                            ? "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400"
                            : "rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400"
                        }
                      >
                        {direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{totalVol.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-200">{fmtMoney(avgEntry)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(currentPrice)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(totalMvSym, 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{fmtMoney(costValue, 0)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${pnlClass(totalPnl)}`}>
                      {fmtSigned(totalPnl)}
                    </td>
                    <td className={`px-4 py-2.5 text-right ${pnlClass(pnlPct)}`}>{fmtPct(pnlPct)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{weight.toFixed(2)}%</td>
                  </tr>

                  {/* ── Individual fill rows (expanded) ── */}
                  {isOpen &&
                    fills.map((fill, i) => (
                      <tr
                        key={`${sym}-fill-${i}`}
                        className="border-t border-white/[0.02] bg-cyan-500/[0.02]"
                      >
                        <td className="px-2 py-1.5" />
                        <td className="px-4 py-1.5 text-left font-sans text-[11px] text-slate-500">
                          &nbsp;&nbsp;└ Fill {i + 1}
                          <span className="ml-2 text-slate-600">{fill.openTime}</span>
                        </td>
                        <td className="px-4 py-1.5" />
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">
                          {fill.volume.toFixed(4)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">
                          {fmtMoney(fill.entryPrice)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">
                          {fmtMoney(fill.currentPrice)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">
                          {fmtMoney(fill.marketValue, 0)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">
                          {fmtMoney(fill.entryPrice * fill.volume, 0)}
                        </td>
                        <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(fill.unrealizedPnl)}`}>
                          {fmtSigned(fill.unrealizedPnl)}
                        </td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                      </tr>
                    ))}
                </>
              );
            })}
            {symbols.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
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
