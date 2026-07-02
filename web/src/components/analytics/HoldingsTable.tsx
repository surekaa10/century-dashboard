"use client";

import { useMemo, useState } from "react";
import type { Enriched } from "@/lib/analytics";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

type Key =
  | "symbol" | "assetClass" | "sector" | "volume" | "marketValue" | "weight"
  | "entryPrice" | "currentPrice" | "unrealizedPnl" | "pnlPct" | "dailyPnl" | "dailyReturnPct";

const COLS: { key: Key; label: string; num: boolean }[] = [
  { key: "symbol", label: "Symbol", num: false },
  { key: "assetClass", label: "Asset Class", num: false },
  { key: "sector", label: "Sector", num: false },
  { key: "volume", label: "Qty", num: true },
  { key: "marketValue", label: "Market Value", num: true },
  { key: "weight", label: "Weight %", num: true },
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

  const view = useMemo(() => {
    const filtered = rows.filter(
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
  }, [rows, q, sortKey, asc]);

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
