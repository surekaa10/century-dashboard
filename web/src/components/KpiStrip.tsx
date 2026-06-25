"use client";

import { useMemo } from "react";
import type { Account, Position, Deal } from "@/lib/types";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { buildDailyPnlET } from "@/lib/equity";

function Card({
  label,
  value,
  valueClass = "text-slate-100",
  hint,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-4 py-3">
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
  deals,
}: {
  account: Account;
  positions: Position[];
  todayRealized: number;
  deals: Deal[];
}) {
  const floating = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const swap = positions.reduce((s, p) => s + p.swap, 0);
  const holdings = new Set(positions.map((p) => p.symbol.trim())).size;
  const ccy = account.currency;

  // Floating P&L % relative to equity
  const floatingPct = account.equity > 0 ? (floating / account.equity) * 100 : 0;

  // Yesterday P&L in Eastern Time derived from the equity curve
  const { todayPnl, yesterdayPnl, yesterdayDate } = useMemo(
    () => buildDailyPnlET(deals, account.equity),
    [deals, account.equity],
  );
  const yesterdayPct = account.equity > 0 ? (yesterdayPnl / (account.equity - todayPnl || account.equity)) * 100 : 0;

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
      />
      <Card
        label="Yesterday P&L (ET)"
        value={fmtSigned(yesterdayPnl)}
        valueClass={`font-mono ${pnlClass(yesterdayPnl)}`}
        sub={yesterdayDate ? `${fmtPct(yesterdayPct)}  ·  ${yesterdayDate}` : "—"}
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
      />
    </div>
  );
}
