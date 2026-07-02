"use client";

import { useEffect, useState } from "react";
import type { ManualTrade } from "@/app/api/manual-trades/route";
import { fmtMoney, fmtSigned, pnlClass } from "@/lib/format";

// ── Aggregate statistics across all closed trades ─────────────────────────────
interface TradeStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;        // %
  avgWin: number;
  avgLoss: number;        // negative number
  profitFactor: number;
  expectancy: number;
  netPnl: number;
  bestTrade: number;
  worstTrade: number;
  grossGain: number;
  grossLoss: number;      // negative
}

function buildStats(trades: ManualTrade[]): TradeStats {
  if (!trades.length) {
    return {
      totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0,
      avgWin: 0, avgLoss: 0, profitFactor: 0, expectancy: 0,
      netPnl: 0, bestTrade: 0, worstTrade: 0, grossGain: 0, grossLoss: 0,
    };
  }

  const wins = trades.filter((t) => t.realizedPnl > 0);
  const losses = trades.filter((t) => t.realizedPnl < 0);
  const grossGain = wins.reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = losses.reduce((s, t) => s + t.realizedPnl, 0);
  const avgWin = wins.length ? grossGain / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const profitFactor = grossLoss !== 0 ? Math.abs(grossGain / grossLoss) : Infinity;
  const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;

  return {
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    expectancy,
    netPnl: trades.reduce((s, t) => s + t.realizedPnl, 0),
    bestTrade: Math.max(...trades.map((t) => t.realizedPnl)),
    worstTrade: Math.min(...trades.map((t) => t.realizedPnl)),
    grossGain,
    grossLoss,
  };
}

function StatCard({
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

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function ClosedTrades() {
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/manual-trades")
      .then((r) => r.json())
      .then((d: { trades: ManualTrade[]; error?: string }) => {
        setTrades(d.trades ?? []);
        if (d.error) setError(d.error);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = buildStats(trades);

  if (loading) {
    return (
      <div className="px-6 py-12 text-center font-mono text-sm text-slate-500">
        Loading trade history…
      </div>
    );
  }

  return (
    <div className="px-6 pb-10 pt-4">
      {error && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-[11px] text-amber-400">
          Note: {error} — showing available data.
        </div>
      )}

      {/* ── Aggregate stats grid ── */}
      {trades.length > 0 ? (
        <>
          <div className="mb-4 text-sm font-semibold text-slate-300">Closed Trade Statistics</div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <StatCard label="Total Trades" value={String(stats.totalTrades)} />
            <StatCard
              label="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              valueClass={stats.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}
              hint={`${stats.winCount}W · ${stats.lossCount}L`}
            />
            <StatCard
              label="Net P&L"
              value={fmtSigned(stats.netPnl)}
              valueClass={`font-mono ${pnlClass(stats.netPnl)}`}
            />
            <StatCard
              label="Avg Win"
              value={fmtSigned(stats.avgWin)}
              valueClass="text-emerald-400"
            />
            <StatCard
              label="Avg Loss"
              value={fmtSigned(stats.avgLoss)}
              valueClass="text-rose-400"
            />
            <StatCard
              label="Profit Factor"
              value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
              valueClass={stats.profitFactor >= 1 ? "text-emerald-400" : "text-rose-400"}
              hint="gross gain / gross loss"
            />
            <StatCard
              label="Expectancy"
              value={fmtSigned(stats.expectancy)}
              valueClass={`font-mono ${pnlClass(stats.expectancy)}`}
              hint="avg $ per trade"
            />
          </div>

          {/* Secondary stats row */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Gross Gains" value={fmtMoney(stats.grossGain)} valueClass="text-emerald-400" />
            <StatCard label="Gross Losses" value={fmtSigned(stats.grossLoss)} valueClass="text-rose-400" />
            <StatCard label="Best Trade" value={fmtSigned(stats.bestTrade)} valueClass="text-emerald-400" />
            <StatCard label="Worst Trade" value={fmtSigned(stats.worstTrade)} valueClass="text-rose-400" />
          </div>

          {/* ── Trade journal table ── */}
          <div className="mb-2 text-sm font-semibold text-slate-300">Trade Journal</div>
          <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left">Symbol</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-right">Volume</th>
                  <th className="px-4 py-2 text-right">Entry</th>
                  <th className="px-4 py-2 text-right">Exit</th>
                  <th className="px-4 py-2 text-right">Realized P&L</th>
                  <th className="px-4 py-2 text-right">Opened</th>
                  <th className="px-4 py-2 text-right">Closed</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5 font-sans font-semibold text-slate-200">
                      {t.symbol}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          t.direction === "Long"
                            ? "rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400"
                            : "rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400"
                        }
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">
                      {t.volume.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">
                      {fmtMoney(t.entryPrice)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">
                      {fmtMoney(t.exitPrice)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${pnlClass(t.realizedPnl)}`}
                    >
                      {fmtSigned(t.realizedPnl)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {fmtDate(t.openTime)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {fmtDate(t.closeTime)}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-[11px] italic text-slate-600">
                      {t.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <div className="text-sm font-semibold text-slate-400">No closed trades recorded</div>
          <div className="mt-1 text-[11px] text-slate-600">
            Manual trades (e.g. the Gold position) are stored in the Supabase{" "}
            <code className="rounded bg-white/[0.04] px-1">manual_trades</code> table.
            Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in{" "}
            <code className="rounded bg-white/[0.04] px-1">.env.local</code>.
          </div>
        </div>
      )}
    </div>
  );
}
