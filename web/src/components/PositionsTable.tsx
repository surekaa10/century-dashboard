"use client";

import { Fragment, useMemo, useState } from "react";
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

interface Row {
  sym: string; fills: Position[]; direction: "Long" | "Short";
  totalVol: number; avgEntry: number; currentPrice: number;
  totalMvSym: number; costValue: number; totalPnl: number; pnlPct: number; weight: number;
}

type SortKey = "symbol" | "side" | "qty" | "avg" | "current" | "mv" | "cost" | "pnl" | "pnlpct" | "weight";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; numeric: boolean }[] = [
  { key: "symbol", label: "Symbol", align: "left", numeric: false },
  { key: "side", label: "Side", align: "left", numeric: false },
  { key: "qty", label: "Total Qty", align: "right", numeric: true },
  { key: "avg", label: "Avg Entry", align: "right", numeric: true },
  { key: "current", label: "Current", align: "right", numeric: true },
  { key: "mv", label: "Market Value", align: "right", numeric: true },
  { key: "cost", label: "Cost Value", align: "right", numeric: true },
  { key: "pnl", label: "Unrealized P&L", align: "right", numeric: true },
  { key: "pnlpct", label: "P&L %", align: "right", numeric: true },
  { key: "weight", label: "Weight %", align: "right", numeric: true },
];

const sortValue = (r: Row, k: SortKey): number | string => {
  switch (k) {
    case "symbol": return r.sym;
    case "side": return r.direction;
    case "qty": return r.totalVol;
    case "avg": return r.avgEntry;
    case "current": return r.currentPrice;
    case "mv": return Math.abs(r.totalMvSym);
    case "cost": return r.costValue;
    case "pnl": return r.totalPnl;
    case "pnlpct": return r.pnlPct;
    case "weight": return r.weight;
  }
};

export default function PositionsTable({ positions }: { positions: Position[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("mv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const totalMv = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  const rows = useMemo<Row[]>(() => {
    const grouped = groupBySymbol(positions);
    const built: Row[] = [...grouped.keys()].map((sym) => {
      const fills = grouped.get(sym)!;
      const totalVol = fills.reduce((s, p) => s + p.volume, 0);
      const costValue = fills.reduce((s, p) => s + p.entryPrice * p.volume, 0);
      const avgEntry = totalVol ? costValue / totalVol : 0;
      const totalMvSym = fills.reduce((s, p) => s + p.marketValue, 0);
      const totalPnl = fills.reduce((s, p) => s + p.unrealizedPnl, 0);
      const basis = Math.abs(avgEntry * totalVol);
      return {
        sym, fills, direction: fills[0].direction, totalVol, avgEntry,
        currentPrice: fills[0].currentPrice, totalMvSym, costValue, totalPnl,
        pnlPct: basis > 0 ? (totalPnl / basis) * 100 : 0,
        weight: (Math.abs(totalMvSym) / totalMv) * 100,
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    built.sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return built;
  }, [positions, totalMv, sortKey, sortDir]);

  const onSort = (k: SortKey, numeric: boolean) => {
    if (k === sortKey) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(k);
    setSortDir(numeric ? "desc" : "asc"); // numbers default high→low, text A→Z
  };

  const toggle = (sym: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });

  const symbolsLen = rows.length;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="border-b border-cyan-500/10 px-4 py-3 text-sm font-semibold text-slate-200">
        Open Positions{" "}
        <span className="text-slate-500">
          ({symbolsLen} instrument{symbolsLen !== 1 ? "s" : ""}
          {positions.length !== symbolsLen ? `, ${positions.length} fills` : ""})
        </span>
        <span className="ml-2 font-normal text-[11px] text-slate-600">· click a column to sort ↑/↓</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="w-6 px-2 py-2" />
              {COLUMNS.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key} className={`px-4 py-2 ${c.align === "left" ? "text-left" : "text-right"}`}>
                    <button
                      type="button"
                      onClick={() => onSort(c.key, c.numeric)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-200 focus:outline-none ${active ? "text-cyan-300" : "text-slate-500"} ${c.align === "right" ? "flex-row-reverse" : ""}`}
                    >
                      {c.label}
                      <span className={`text-[9px] ${active ? "text-cyan-300" : "text-slate-700"}`}>
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => {
              const isOpen = expanded.has(r.sym);
              const multiFill = r.fills.length > 1;
              return (
                <Fragment key={r.sym}>
                  {/* ── Instrument summary row ── */}
                  <tr
                    onClick={() => multiFill && toggle(r.sym)}
                    className={`border-t border-white/[0.04] transition-colors ${multiFill ? "cursor-pointer hover:bg-white/[0.025]" : ""}`}
                  >
                    <td className="px-2 py-2.5 text-center text-slate-600">
                      {multiFill && <span className="select-none text-xs text-slate-500">{isOpen ? "▾" : "▸"}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <span className="font-sans font-semibold text-slate-200">{r.sym}</span>
                      {multiFill && <span className="ml-2 text-[10px] text-slate-600">{r.fills.length} fills</span>}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <span className={r.direction === "Long" ? "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400" : "rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400"}>
                        {r.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{r.totalVol.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-200">{fmtMoney(r.avgEntry)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(r.currentPrice)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(r.totalMvSym, 0)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{fmtMoney(r.costValue, 0)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${pnlClass(r.totalPnl)}`}>{fmtSigned(r.totalPnl)}</td>
                    <td className={`px-4 py-2.5 text-right ${pnlClass(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{r.weight.toFixed(2)}%</td>
                  </tr>

                  {/* ── Individual fill rows (expanded) ── */}
                  {isOpen &&
                    r.fills.map((fill, i) => (
                      <tr key={`${r.sym}-fill-${i}`} className="border-t border-white/[0.02] bg-cyan-500/[0.02]">
                        <td className="px-2 py-1.5" />
                        <td className="px-4 py-1.5 text-left font-sans text-[11px] text-slate-500">
                          &nbsp;&nbsp;└ Fill {i + 1}
                          <span className="ml-2 text-slate-600">{fill.openTime}</span>
                        </td>
                        <td className="px-4 py-1.5" />
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fill.volume.toFixed(4)}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.entryPrice)}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.currentPrice)}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.marketValue, 0)}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">{fmtMoney(fill.entryPrice * fill.volume, 0)}</td>
                        <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(fill.unrealizedPnl)}`}>{fmtSigned(fill.unrealizedPnl)}</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                        <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {symbolsLen === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">No open positions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
