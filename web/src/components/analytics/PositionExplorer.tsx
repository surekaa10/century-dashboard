"use client";

import { useState } from "react";
import type { Enriched } from "@/lib/analytics";
import { fmtMoney, fmtSigned, fmtPct, pnlClass } from "@/lib/format";

function Row({ label, value, cls = "text-slate-200" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-mono text-xs ${cls}`}>{value}</span>
    </div>
  );
}

const num = (v: number, suffix = "", dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) + suffix : "n/a");

export default function PositionExplorer({ rows }: { rows: Enriched[] }) {
  const [sym, setSym] = useState(rows[0]?.symbol ?? "");
  const p = rows.find((r) => r.symbol === sym) ?? rows[0];
  if (!p) return null;

  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-3 flex items-center gap-3">
        <select
          value={sym}
          onChange={(e) => setSym(e.target.value)}
          className="rounded border border-cyan-500/20 bg-black/30 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        >
          {rows.map((r) => (
            <option key={r.symbol} value={r.symbol}>
              {r.symbol} — {r.sector}
            </option>
          ))}
        </select>
        <span className={`font-mono text-sm font-semibold ${pnlClass(p.unrealizedPnl)}`}>
          {fmtSigned(p.unrealizedPnl, 0)} ({fmtPct(p.pnlPct)})
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-3">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-cyan-400/70">Position Info</div>
          <Row label="Symbol" value={p.symbol} />
          <Row label="Asset Class" value={p.assetClass} />
          <Row label="Sector" value={p.sector} />
          <Row label="Industry" value={p.industry} />
          <Row label="Direction" value={p.direction} />
          <Row label="Current Weight" value={`${p.weight.toFixed(2)}%`} />
          <Row label="Market Value" value={fmtMoney(p.marketValue, 0)} />
          <Row label="Avg Cost" value={fmtMoney(p.entryPrice)} />
          <Row label="Current Price" value={fmtMoney(p.currentPrice)} />
          <Row label="Open Time" value={p.openTime} />
        </div>

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-cyan-400/70">Risk Metrics</div>
          <Row label="Volatility (ann.)" value={num(p.volAnnual, "%")} />
          <Row label="Contrib. to Port. Vol" value={num(p.contribToVolPct, "%")} cls={pnlClass(-Math.abs(p.contribToVolPct) + 0.0001)} />
          <Row label="Marginal VaR" value={Number.isFinite(p.marginalVar) ? fmtMoney(p.marginalVar, 0) : "n/a"} />
          <Row label="Component VaR (95%)" value={fmtMoney(p.componentVar, 0)} cls={pnlClass(-p.componentVar)} />
          <Row label="Beta vs SPY" value={num(p.beta)} />
          <Row label="Max Drawdown" value={num(p.maxDrawdown, "%")} cls="text-rose-400" />
        </div>

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-cyan-400/70">Performance</div>
          <Row label="Total Return (since cost)" value={fmtPct(p.returnPct)} cls={pnlClass(p.returnPct)} />
          <Row label="Price Δ (hist. window)" value={fmtPct(p.totalReturnPct)} cls={pnlClass(p.totalReturnPct)} />
          <Row label="Daily Return" value={fmtPct(p.dailyReturnPct)} cls={pnlClass(p.dailyReturnPct)} />
          <Row label="Monthly Return" value={fmtPct(p.monthlyReturnPct)} cls={pnlClass(p.monthlyReturnPct)} />
          <Row label="Sharpe (ann.)" value={num(p.sharpe)} cls={pnlClass(p.sharpe)} />
          <Row label="Unrealized P&L" value={fmtSigned(p.unrealizedPnl, 0)} cls={pnlClass(p.unrealizedPnl)} />
          <Row label="Daily P&L" value={fmtSigned(p.dailyPnl, 0)} cls={pnlClass(p.dailyPnl)} />
        </div>
      </div>
      {!p.hasHistory && (
        <div className="mt-3 text-[11px] text-amber-400/70">
          ⚠ Limited price history for {p.symbol} — volatility / beta / Sharpe may be unreliable.
        </div>
      )}
    </div>
  );
}
