"use client";

import { useMemo } from "react";
import type { Position } from "@/lib/types";
import type { BookConfig } from "@/lib/books";
import { filterByBook, buildTradingKpis } from "@/lib/books";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { buildYesterdayPnlFromRates } from "@/lib/equity";
import type { SymbolRates } from "@/lib/types";

function Card({
  label,
  value,
  valueClass = "text-slate-100",
  sub,
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-orange-500/10 bg-orange-500/[0.04] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
      {sub && (
        <div
          className={`mt-0.5 font-mono text-[11px] ${
            sub.startsWith("+")
              ? "text-emerald-500"
              : sub.startsWith("-")
              ? "text-rose-500"
              : "text-slate-500"
          }`}
        >
          {sub}
        </div>
      )}
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] text-slate-600">{hint}</div>
      )}
    </div>
  );
}

export default function TradingKpiStrip({
  allPositions,
  bookConfig,
  symbolRates,
  todayRealized,
}: {
  allPositions: Position[];
  bookConfig: BookConfig;
  symbolRates: SymbolRates;
  todayRealized: number;
}) {
  const tradingPositions = useMemo(
    () => filterByBook(allPositions, bookConfig, "trading"),
    [allPositions, bookConfig],
  );

  const kpis = useMemo(
    () => buildTradingKpis(tradingPositions, bookConfig.tradingCapital),
    [tradingPositions, bookConfig.tradingCapital],
  );

  const { yesterdayPnl, yesterdayDate } = useMemo(
    () => buildYesterdayPnlFromRates(tradingPositions, symbolRates),
    [tradingPositions, symbolRates],
  );

  const utilizationColor =
    kpis.utilizationPct > 90
      ? "text-rose-400"
      : kpis.utilizationPct > 70
      ? "text-orange-400"
      : "text-emerald-400";

  return (
    <div className="px-6 pb-1 pt-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-orange-500/70">
          Trading Book
        </span>
        <span className="font-mono text-[10px] text-slate-600">
          · virtual capital ${fmtMoney(bookConfig.tradingCapital).replace("$", "")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Card
          label="Trading Capital"
          value={fmtMoney(kpis.tradingCapital)}
          valueClass="text-orange-300"
          hint="virtual allocation"
        />
        <Card
          label="Capital Used"
          value={fmtMoney(kpis.capitalUsed)}
          sub={`${kpis.utilizationPct.toFixed(1)}% utilized`}
        />
        <Card
          label="Capital Remaining"
          value={fmtMoney(kpis.capitalRemaining)}
          valueClass={kpis.capitalRemaining < 0 ? "text-rose-400" : "text-slate-100"}
          hint="trading cash"
        />
        <Card
          label="Utilization"
          value={`${kpis.utilizationPct.toFixed(1)}%`}
          valueClass={utilizationColor}
          hint={`${kpis.openTrades} instrument${kpis.openTrades !== 1 ? "s" : ""}`}
        />
        <Card
          label="Open P&L"
          value={fmtSigned(kpis.openPnl)}
          valueClass={`font-mono ${pnlClass(kpis.openPnl)}`}
          sub={fmtPct(kpis.openPnlPct)}
        />
        <Card
          label="Yesterday P&L"
          value={fmtSigned(yesterdayPnl)}
          valueClass={`font-mono ${pnlClass(yesterdayPnl)}`}
          sub={yesterdayDate ?? "—"}
        />
        <Card
          label="Today Realized"
          value={fmtSigned(todayRealized)}
          valueClass={`font-mono ${pnlClass(todayRealized)}`}
          hint="account-wide"
        />
        <Card
          label="Swap Charges"
          value={fmtSigned(kpis.swapCharges)}
          valueClass={`font-mono ${pnlClass(kpis.swapCharges)}`}
          hint="trading positions"
        />
      </div>
    </div>
  );
}
