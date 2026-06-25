"use client";

import { useMemo } from "react";
import type { Account, Position, SymbolRates } from "@/lib/types";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { buildYesterdayPnlFromRates } from "@/lib/equity";

function Card({
  label,
  value,
  valueClass = "text-slate-100",
  hint,
  sub,
  onClick,
  active,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  sub?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${
        active
          ? "border-cyan-400/50 bg-cyan-500/10"
          : "border-cyan-500/10 bg-white/[0.012] hover:border-cyan-500/20"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className={`mt-0.5 font-mono text-[11px] ${sub.startsWith("+") ? "text-emerald-500" : sub.startsWith("-") ? "text-rose-500" : "text-slate-500"}`}>{sub}</div>}
      {hint && <div className="mt-0.5 font-mono text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

export default function KpiStrip({
  account,
  positions,
  todayRealized,
  symbolRates,
  onCardClick,
  activeCardLabel,
}: {
  account: Account;
  positions: Position[];
  todayRealized: number;
  symbolRates: SymbolRates;
  onCardClick?: (label: string, value: number, color: string) => void;
  activeCardLabel?: string;
}) {
  const swap = positions.reduce((s, p) => s + p.swap, 0);
  const holdings = new Set(positions.map((p) => p.symbol.trim())).size;
  const ccy = account.currency;

  // Floating P&L: dirSign * (currentPrice - entryPrice) * qty per fill
  const floating = useMemo(() => positions.reduce((s, p) => {
    if (p.currentPrice <= 0) return s;
    const dirSign = p.direction === "Long" ? 1 : -1;
    const qty = Math.abs(p.marketValue) / p.currentPrice;
    return s + dirSign * (p.currentPrice - p.entryPrice) * qty;
  }, 0), [positions]);

  // Floating % against cost basis (sum of entryPrice * qty per fill)
  const costBasis = useMemo(() => positions.reduce((s, p) => {
    if (p.currentPrice <= 0) return s;
    const qty = Math.abs(p.marketValue) / p.currentPrice;
    return s + p.entryPrice * qty;
  }, 0), [positions]);
  const floatingPct = costBasis > 0 ? (floating / costBasis) * 100 : 0;

  // Yesterday P&L via symbolRates historical closes
  const { todayPnl, yesterdayPnl, yesterdayDate } = useMemo(
    () => buildYesterdayPnlFromRates(positions, symbolRates),
    [positions, symbolRates],
  );
  const yesterdayPct = costBasis > 0 ? (yesterdayPnl / costBasis) * 100 : 0;

  const makeClick = (label: string, value: number, color: string) =>
    onCardClick ? () => onCardClick(label, value, color) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4 xl:grid-cols-9">
      <Card label="Equity" value={`${fmtMoney(account.equity)}`} hint={ccy} />
      <Card label="Balance" value={fmtMoney(account.balance)} hint="excl. credit" />
      <Card label="Credit" value={fmtMoney(account.credit)} hint="broker line" valueClass="text-cyan-300" />
      <Card
        label="Floating P&L"
        value={fmtSigned(floating)}
        valueClass={`font-mono ${pnlClass(floating)}`}
        sub={fmtPct(floatingPct)}
        onClick={makeClick("Floating P&L", floating, floating >= 0 ? "#10b981" : "#f43f5e")}
        active={activeCardLabel === "Floating P&L"}
      />
      <Card
        label="Yesterday P&L (ET)"
        value={fmtSigned(yesterdayPnl)}
        valueClass={`font-mono ${pnlClass(yesterdayPnl)}`}
        sub={yesterdayDate ? `${fmtPct(yesterdayPct)}  ·  ${yesterdayDate}` : "—"}
        onClick={makeClick("Yesterday P&L", yesterdayPnl, yesterdayPnl >= 0 ? "#10b981" : "#f43f5e")}
        active={activeCardLabel === "Yesterday P&L"}
      />
      <Card
        label="Swap"
        value={fmtSigned(swap)}
        valueClass={`font-mono ${pnlClass(swap)}`}
      />
      <Card label="Margin" value={fmtMoney(account.margin)} />
      <Card label="Free Margin" value={fmtMoney(account.freeMargin)} />
      <Card
        label="Today Realized"
        value={fmtSigned(todayRealized)}
        valueClass={`font-mono ${pnlClass(todayRealized)}`}
        hint={`${holdings} holdings`}
        onClick={makeClick("Today Realized", todayRealized, todayRealized >= 0 ? "#10b981" : "#f43f5e")}
        active={activeCardLabel === "Today Realized"}
      />
    </div>
  );
}
