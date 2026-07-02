"use client";

import { useMemo, useState } from "react";
import type { Enriched } from "@/lib/analytics";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// "15 May 2026  22:49" → epoch ms (UTC midnight of the open date); 0 if unparseable.
function parseOpenMs(openTime: string): number {
  const t = openTime.trim().split(/\s+/);
  if (t.length < 3) return 0;
  const dd = parseInt(t[0], 10), mo = MONTHS[t[1]?.slice(0, 3).toLowerCase()], yy = parseInt(t[2], 10);
  if (!Number.isFinite(dd) || mo === undefined || !Number.isFinite(yy)) return 0;
  return Date.UTC(yy, mo, dd);
}

type Key =
  | "symbol" | "assetClass" | "sector" | "volume" | "marketValue" | "weight"
  | "swapPa" | "swap"
  | "entryPrice" | "currentPrice" | "unrealizedPnl" | "pnlPct" | "dailyPnl" | "dailyReturnPct";

// Enriched row + annualized swap-cost field derived below.
type Row = Enriched & { swapPa: number };

const COLS: { key: Key; label: string; num: boolean }[] = [
  { key: "symbol", label: "Symbol", num: false },
  { key: "assetClass", label: "Asset Class", num: false },
  { key: "sector", label: "Sector", num: false },
  { key: "volume", label: "Qty", num: true },
  { key: "marketValue", label: "Market Value", num: true },
  { key: "weight", label: "Weight %", num: true },
  { key: "swapPa", label: "Swap % p.a.", num: true },
  { key: "swap", label: "Swap $", num: true },
  { key: "entryPrice", label: "Entry", num: true },
  { key: "currentPrice", label: "Current", num: true },
  { key: "unrealizedPnl", label: "Unreal. P&L", num: true },
  { key: "pnlPct", label: "Unreal. %", num: true },
  { key: "dailyPnl", label: "Daily P&L", num: true },
  { key: "dailyReturnPct", label: "Daily %", num: true },
];

export default function HoldingsTable({ rows }: { rows: Enriched[] }) {
  const [sortKey, setSortKey] = useState<Key>("marketValue");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");

  // Swap % p.a. = the overnight financing charge, annualized. MT5 gives the swap
  // accrued since the position opened, so we average it per day and scale to a
  // year, expressed against the position's notional (market value).
  const withSwap = useMemo<Row[]>(() => {
    const now = Date.now();
    return rows.map((r) => {
      const openMs = parseOpenMs(r.openTime);
      const days = openMs ? Math.max(1, (now - openMs) / 86400000) : 0;
      const notional = Math.abs(r.marketValue);
      const swapPa = days > 0 && notional > 0 ? ((r.swap / days) * 365 / notional) * 100 : 0;
      return { ...r, swapPa };
    });
  }, [rows]);

  const view = useMemo(() => {
    const filtered = withSwap.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q.toLowerCase()) ||
        r.sector.toLowerCase().includes(q.toLowerCase()) ||
        r.assetClass.toLowerCase().includes(q.toLowerCase()),
    );
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
    return sorted;
  }, [withSwap, q, sortKey, asc]);

  const downloadCsv = () => {
    const header = COLS.map((c) => c.label).join(",");
    const body = view
      .map((r) => COLS.map((c) => (typeof r[c.key] === "number" ? (r[c.key] as number).toFixed(2) : `"${r[c.key]}"`)).join(","))
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "holdings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const setSort = (k: Key) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(false);
    }
  };

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012]">
      <div className="flex items-center justify-between gap-3 border-b border-cyan-500/10 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">Holdings Overview</span>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search symbol / sector…"
            className="w-44 rounded border border-cyan-500/15 bg-black/20 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
          />
          <button
            onClick={downloadCsv}
            className="rounded border border-cyan-500/20 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10"
          >
            ↓ CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort(c.key)}
                  className={`cursor-pointer select-none px-3 py-2 ${c.num ? "text-right" : "text-left"} hover:text-slate-300`}
                >
                  {c.label}
                  {sortKey === c.key ? (asc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {view.map((r, i) => (
              <tr key={`${r.symbol}-${i}`} className="border-t border-white/[0.04]">
                <td className="px-3 py-2 text-left font-sans font-medium text-slate-200">{r.symbol}</td>
                <td className="px-3 py-2 text-left text-slate-400">{r.assetClass}</td>
                <td className="px-3 py-2 text-left text-slate-400">{r.sector}</td>
                <td className="px-3 py-2 text-right text-slate-300">{r.volume}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtMoney(r.marketValue, 0)}</td>
                <td className="px-3 py-2 text-right text-slate-400">{r.weight.toFixed(2)}%</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.swapPa)}`}>{r.swapPa >= 0 ? "+" : ""}{r.swapPa.toFixed(2)}%</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.swap)}`}>{fmtSigned(r.swap, 2)}</td>
                <td className="px-3 py-2 text-right text-slate-400">{fmtMoney(r.entryPrice)}</td>
                <td className="px-3 py-2 text-right text-slate-300">{fmtMoney(r.currentPrice)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${pnlClass(r.unrealizedPnl)}`}>{fmtSigned(r.unrealizedPnl, 0)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.dailyPnl)}`}>{fmtSigned(r.dailyPnl, 0)}</td>
                <td className={`px-3 py-2 text-right ${pnlClass(r.dailyReturnPct)}`}>{fmtPct(r.dailyReturnPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
