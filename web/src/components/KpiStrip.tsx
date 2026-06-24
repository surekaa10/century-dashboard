"use client";

import type { Account, Position } from "@/lib/types";
import { fmtMoney, fmtSigned, pnlClass } from "@/lib/format";

function Card({
  label,
  value,
  valueClass = "text-slate-100",
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${valueClass}`}>{value}</div>
      {hint && <div className="mt-0.5 font-mono text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

export default function KpiStrip({
  account,
  positions,
  todayRealized,
}: {
  account: Account;
  positions: Position[];
  todayRealized: number;
}) {
  const floating = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const swap = positions.reduce((s, p) => s + p.swap, 0);
  const holdings = new Set(positions.map((p) => p.symbol)).size;
  const ccy = account.currency;

  return (
    <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4 xl:grid-cols-8">
      <Card label="Equity" value={`${fmtMoney(account.equity)}`} hint={ccy} />
      <Card label="Balance" value={fmtMoney(account.balance)} hint="excl. credit" />
      <Card label="Credit" value={fmtMoney(account.credit)} hint="broker line" valueClass="text-cyan-300" />
      <Card
        label="Floating P&L"
        value={fmtSigned(floating)}
        valueClass={`font-mono ${pnlClass(floating)}`}
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
