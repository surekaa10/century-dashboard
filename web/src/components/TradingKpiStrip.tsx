"use client";

import { useMemo } from "react";
import type { Position, SymbolRates } from "@/lib/types";
import type { BookConfig } from "@/lib/books";
import { filterByBook, buildTradingKpis } from "@/lib/books";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { buildYesterdayPnlFromRates } from "@/lib/equity";

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
      {hint && <div className="mt-0.5 font-mono text-[10px] text-slate-600">{hint}</div>}
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
    () => buildTradingKpis(tradingPositions, bookConfig.riskBudget),
    [tradingPositions, bookConfig.riskBudget],
  );

  const { yesterdayPnl, yesterdayDate } = useMemo(
    () => buildYesterdayPnlFromRates(tradingPositions, symbolRates),
    [tradingPositions, symbolRates],
  );

  // Risk utilization colour: green < 50%, amber 50-80%, red > 80%
  const riskColor =
    kpis.riskUtilizationPct > 80
      ? "text-rose-400"
      : kpis.riskUtilizationPct > 50
      ? "text-amber-400"
      : "text-emerald-400";

  return (
    <div className="px-6 pb-1 pt-2">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-orange-500/70">
          Trading Book
        </span>
        <span className="rounded border border-orange-500/20 bg-orange-500/5 px-2 py-0.5 font-mono text-[10px] text-orange-400/70">
          Risk Budget: {fmtMoney(bookConfig.riskBudget)} max loss
        </span>
        <span className="font-mono text-[10px] text-slate-600">
          · capital exposed and risk budget are independent figures
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">

        {/* ── Risk Budget — the max loss limit, NOT capital ── */}
        <Card
          label="Risk Budget"
          value={fmtMoney(kpis.riskBudget)}
          valueClass="text-orange-300"
          hint="max allowable loss"
        />

        {/* ── Risk Used — how much of the loss budget is consumed ── */}
        <Card
          label="Risk Used"
          value={fmtMoney(kpis.riskUsed)}
          valueClass={kpis.riskUsed > 0 ? "text-rose-400" : "text-emerald-400"}
          sub={`${kpis.riskUtilizationPct.toFixed(1)}% of budget`}
          hint="open unrealised loss"
        />

        {/* ── Risk Remaining — how much loss headroom is left ── */}
        <Card
          label="Risk Remaining"
          value={fmtMoney(kpis.riskRemaining)}
          valueClass={kpis.riskRemaining < kpis.riskBudget * 0.2 ? "text-rose-400" : "text-slate-100"}
          hint="budget − risk used"
        />

        {/* ── Risk Utilization — budget consumed % ── */}
        <Card
          label="Risk Utilization"
          value={`${kpis.riskUtilizationPct.toFixed(1)}%`}
          valueClass={riskColor}
          hint={`${kpis.openTrades} instrument${kpis.openTrades !== 1 ? "s" : ""} open`}
        />

        {/* ── Capital Exposed — actual market value (independent of risk budget) ── */}
        <Card
          label="Capital Exposed"
          value={fmtMoney(kpis.capitalExposed)}
          sub={kpis.openPnlPct !== 0 ? fmtPct(kpis.openPnlPct) : undefined}
          hint="market value of positions"
        />

        {/* ── Open P&L ── */}
        <Card
          label="Open P&L"
          value={fmtSigned(kpis.openPnl)}
          valueClass={`font-mono ${pnlClass(kpis.openPnl)}`}
          sub={fmtPct(kpis.openPnlPct)}
        />

        {/* ── Yesterday P&L ── */}
        <Card
          label="Yesterday P&L"
          value={fmtSigned(yesterdayPnl)}
          valueClass={`font-mono ${pnlClass(yesterdayPnl)}`}
          sub={yesterdayDate ?? "—"}
        />

        {/* ── Swap charges on trading positions ── */}
        <Card
          label="Swap Charges"
          value={fmtSigned(kpis.swapCharges)}
          valueClass={`font-mono ${pnlClass(kpis.swapCharges)}`}
          hint="trading positions only"
        />
      </div>
    </div>
  );
}
