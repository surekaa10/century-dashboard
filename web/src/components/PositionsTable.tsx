"use client";

import { Fragment, useMemo, useState } from "react";
import type { Position } from "@/lib/types";
import type { BookConfig, BookType, BookView } from "@/lib/books";
import { getBook } from "@/lib/books";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseOpenMs(openTime: string): number {
  const t = openTime.trim().split(/\s+/);
  if (t.length < 3) return 0;
  const dd = parseInt(t[0], 10), mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], yy = parseInt(t[2], 10);
  if (!Number.isFinite(dd) || mo === undefined || !Number.isFinite(yy)) return 0;
  return Date.UTC(yy, mo, dd);
}
function swapStats(swap: number, openTime: string, notional: number): { daily: number; pa: number } {
  const ms = parseOpenMs(openTime);
  const days = ms ? Math.max(1, (Date.now() - ms) / 86400000) : 0;
  const daily = days > 0 ? swap / days : 0;
  const pa = days > 0 && notional > 0 ? (daily * 365 / notional) * 100 : 0;
  return { daily, pa };
}

function groupBySymbol(positions: Position[]): Map<string, Position[]> {
  const map = new Map<string, Position[]>();
  for (const p of positions) {
    const key = p.symbol.trim();
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return map;
}

interface Row {
  sym: string;
  fills: Position[];
  direction: "Long" | "Short";
  totalVol: number;
  avgEntry: number;
  currentPrice: number;
  totalMvSym: number;
  costValue: number;
  totalPnl: number;
  pnlPct: number;
  weight: number;
  book: BookType;
  swapTotal: number;
  swapDaily: number;
  swapPa: number;
  simulated: boolean;
}

type SortKey =
  | "symbol" | "book" | "side" | "qty" | "avg" | "current"
  | "mv" | "cost" | "pnl" | "pnlpct" | "weight" | "swap" | "swapday" | "swappa";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; numeric: boolean }[] = [
  { key: "symbol", label: "Symbol", align: "left", numeric: false },
  { key: "book", label: "Book", align: "left", numeric: false },
  { key: "side", label: "Side", align: "left", numeric: false },
  { key: "qty", label: "Total Qty", align: "right", numeric: true },
  { key: "avg", label: "Avg Entry", align: "right", numeric: true },
  { key: "current", label: "Current", align: "right", numeric: true },
  { key: "mv", label: "Market Value", align: "right", numeric: true },
  { key: "cost", label: "Cost Value", align: "right", numeric: true },
  { key: "pnl", label: "Unrealized P&L", align: "right", numeric: true },
  { key: "pnlpct", label: "P&L %", align: "right", numeric: true },
  { key: "weight", label: "Weight %", align: "right", numeric: true },
  { key: "swap", label: "Swap $", align: "right", numeric: true },
  { key: "swapday", label: "Avg $/day", align: "right", numeric: true },
  { key: "swappa", label: "Swap % p.a.", align: "right", numeric: true },
];

const sortValue = (r: Row, k: SortKey): number | string => {
  switch (k) {
    case "symbol": return r.sym;
    case "book": return r.simulated ? "zzz_simulated" : r.book;
    case "side": return r.direction;
    case "qty": return r.totalVol;
    case "avg": return r.avgEntry;
    case "current": return r.currentPrice;
    case "mv": return Math.abs(r.totalMvSym);
    case "cost": return r.costValue;
    case "pnl": return r.totalPnl;
    case "pnlpct": return r.pnlPct;
    case "weight": return r.weight;
    case "swap": return r.swapTotal;
    case "swapday": return r.swapDaily;
    case "swappa": return r.swapPa;
  }
};

function BookBadge({
  sym,
  book,
  simulated,
  onClick,
  onRemoveSim,
}: {
  sym: string;
  book: BookType;
  simulated: boolean;
  onClick?: (sym: string, book: BookType) => void;
  onRemoveSim?: (sym: string) => void;
}) {
  if (simulated) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-violet-400">
          SIM
        </span>
        {onRemoveSim && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveSim(sym); }}
            title={`Remove simulated ${sym}`}
            className="text-[10px] text-slate-600 transition hover:text-rose-400"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  const toggle = () => onClick?.(sym, book === "investment" ? "trading" : "investment");
  return (
    <button
      onClick={toggle}
      title={onClick ? `Click to move ${sym} to ${book === "investment" ? "Trading" : "Investment"}` : undefined}
      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
        onClick ? "cursor-pointer" : "cursor-default"
      } ${
        book === "trading"
          ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
          : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
      }`}
    >
      {book === "trading" ? "Trading" : "Invest"}
    </button>
  );
}

export default function PositionsTable({
  positions,
  allPositions,
  bookConfig,
  activeBook,
  onBookChange,
  onRemoveSim,
}: {
  positions: Position[];
  allPositions?: Position[];
  bookConfig?: BookConfig;
  activeBook?: BookView;
  onBookChange?: (symbol: string, book: BookType) => void;
  onRemoveSim?: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("mv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const displayPositions = useMemo(() => {
    if (showAll && allPositions) return allPositions;
    return positions;
  }, [positions, allPositions, showAll]);

  const totalMv = displayPositions.reduce((s, p) => s + Math.abs(p.marketValue), 0) || 1;

  const rows = useMemo<Row[]>(() => {
    const grouped = groupBySymbol(displayPositions);
    const built: Row[] = [...grouped.keys()].map((sym) => {
      const fills = grouped.get(sym)!;
      const totalVol = fills.reduce((s, p) => s + p.volume, 0);
      const costValue = fills.reduce((s, p) => s + p.entryPrice * p.volume, 0);
      const avgEntry = totalVol ? costValue / totalVol : 0;
      const totalMvSym = fills.reduce((s, p) => s + p.marketValue, 0);
      const totalPnl = fills.reduce((s, p) => s + p.unrealizedPnl, 0);
      const basis = Math.abs(avgEntry * totalVol);
      const isSimulated = fills.some((p) => p.simulated);
      const book = bookConfig ? getBook(sym, bookConfig) : "investment";
      const swapTotal = fills.reduce((s, p) => s + p.swap, 0);
      const swapDaily = fills.reduce((s, p) => s + swapStats(p.swap, p.openTime, Math.abs(p.marketValue)).daily, 0);
      const notionalSym = Math.abs(totalMvSym) || 1;
      const swapPa = (swapDaily * 365 / notionalSym) * 100;
      return {
        sym, fills, direction: fills[0].direction, totalVol, avgEntry,
        currentPrice: fills[0].currentPrice, totalMvSym, costValue, totalPnl,
        pnlPct: basis > 0 ? (totalPnl / basis) * 100 : 0,
        weight: (Math.abs(totalMvSym) / totalMv) * 100,
        book, swapTotal, swapDaily, swapPa, simulated: isSimulated,
      };
    });
    const dir = sortDir === "asc" ? 1 : -1;
    built.sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return built;
  }, [displayPositions, totalMv, sortKey, sortDir, bookConfig]);

  const onSort = (k: SortKey, numeric: boolean) => {
    if (k === sortKey) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(k);
    setSortDir(numeric ? "desc" : "asc");
  };

  const toggle = (sym: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });

  const symbolsLen = rows.length;
  const simCount = rows.filter((r) => r.simulated).length;
  const showAllToggle =
    activeBook &&
    activeBook !== "combined" &&
    activeBook !== "simulated" &&
    allPositions &&
    allPositions.length !== positions.length;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex flex-wrap items-center gap-3 border-b border-cyan-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">
          Open Positions{" "}
          <span className="text-slate-500">
            ({symbolsLen} instrument{symbolsLen !== 1 ? "s" : ""}
            {displayPositions.length !== symbolsLen ? `, ${displayPositions.length} fills` : ""}
            {simCount > 0 && <span className="text-violet-400"> · {simCount} simulated</span>})
          </span>
        </span>
        <span className="font-normal text-[11px] text-slate-600">· click column to sort</span>
        {showAllToggle && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto rounded border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-slate-500 transition hover:text-slate-300"
          >
            {showAll ? "Show book only" : "Show all positions"}
          </button>
        )}
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
              const rowBg = r.simulated
                ? "border-t border-violet-500/10 bg-violet-500/[0.025] hover:bg-violet-500/[0.04]"
                : "border-t border-white/[0.04] hover:bg-white/[0.025]";
              return (
                <Fragment key={r.sym}>
                  <tr
                    onClick={() => multiFill && toggle(r.sym)}
                    className={`transition-colors ${rowBg} ${multiFill ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-2 py-2.5 text-center text-slate-600">
                      {multiFill && <span className="select-none text-xs text-slate-500">{isOpen ? "▾" : "▸"}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <span className={`font-sans font-semibold ${r.simulated ? "text-violet-300" : "text-slate-200"}`}>
                        {r.sym}
                      </span>
                      {multiFill && <span className="ml-2 text-[10px] text-slate-600">{r.fills.length} fills</span>}
                    </td>
                    <td className="px-4 py-2.5 text-left">
                      <BookBadge
                        sym={r.sym}
                        book={r.book}
                        simulated={r.simulated}
                        onClick={r.simulated ? undefined : onBookChange}
                        onRemoveSim={r.simulated ? onRemoveSim : undefined}
                      />
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
                    <td className={`px-4 py-2.5 text-right ${pnlClass(r.swapTotal)}`}>{fmtSigned(r.swapTotal, 2)}</td>
                    <td className={`px-4 py-2.5 text-right ${pnlClass(r.swapDaily)}`}>{fmtSigned(r.swapDaily, 2)}</td>
                    <td className={`px-4 py-2.5 text-right ${pnlClass(r.swapPa)}`}>{r.swapPa >= 0 ? "+" : ""}{r.swapPa.toFixed(2)}%</td>
                  </tr>

                  {isOpen &&
                    r.fills.map((fill, i) => {
                      const ss = swapStats(fill.swap, fill.openTime, Math.abs(fill.marketValue));
                      return (
                        <tr
                          key={`${r.sym}-fill-${i}`}
                          className={`border-t border-white/[0.02] ${r.simulated ? "bg-violet-500/[0.03]" : "bg-cyan-500/[0.02]"}`}
                        >
                          <td className="px-2 py-1.5" />
                          <td className="px-4 py-1.5 text-left font-sans text-[11px] text-slate-500">
                            &nbsp;&nbsp;└ {fill.simulated ? "Simulated" : `Fill ${i + 1}`}
                            <span className="ml-2 text-slate-600">{fill.openTime}</span>
                          </td>
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5" />
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fill.volume.toFixed(4)}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.entryPrice)}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.currentPrice)}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-500">{fmtMoney(fill.marketValue, 0)}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">{fmtMoney(fill.entryPrice * fill.volume, 0)}</td>
                          <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(fill.unrealizedPnl)}`}>{fmtSigned(fill.unrealizedPnl)}</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                          <td className="px-4 py-1.5 text-right text-[11px] text-slate-600">—</td>
                          <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(fill.swap)}`}>{fmtSigned(fill.swap, 2)}</td>
                          <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(ss.daily)}`}>{fmtSigned(ss.daily, 2)}</td>
                          <td className={`px-4 py-1.5 text-right text-[11px] ${pnlClass(ss.pa)}`}>{ss.pa >= 0 ? "+" : ""}{ss.pa.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            {symbolsLen === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-slate-500">No open positions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
