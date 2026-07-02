"use client";

import { useEffect, useState } from "react";
import type { ManualTrade } from "@/app/api/manual-trades/route";
import { fmtMoney, fmtSigned, pnlClass } from "@/lib/format";

// ── Aggregate statistics across all closed trades ─────────────────────────────
interface TradeStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  netPnl: number;
  bestTrade: number;
  worstTrade: number;
  grossGain: number;
  grossLoss: number;
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

// ── Add Trade Modal ────────────────────────────────────────────────────────────
interface FormState {
  symbol: string;
  direction: "Long" | "Short";
  volume: string;
  entryPrice: string;
  exitPrice: string;
  realizedPnl: string;
  openTime: string;
  closeTime: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  symbol: "", direction: "Long", volume: "", entryPrice: "",
  exitPrice: "", realizedPnl: "", openTime: "", closeTime: "", note: "",
};

function AddTradeModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (trade: ManualTrade) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Live P&L hint — assumes 100 units/lot (standard Gold contract)
  const calcPnl = (() => {
    const entry = parseFloat(form.entryPrice);
    const exit = parseFloat(form.exitPrice);
    const vol = parseFloat(form.volume);
    if (!isFinite(entry) || !isFinite(exit) || !isFinite(vol) || vol <= 0) return null;
    return form.direction === "Long"
      ? (exit - entry) * vol * 100
      : (entry - exit) * vol * 100;
  })();

  const handleSubmit = async () => {
    setError("");
    const { symbol, direction, volume, entryPrice, exitPrice, realizedPnl, openTime, closeTime, note } = form;
    if (!symbol.trim() || !volume || !entryPrice || !exitPrice || !realizedPnl || !openTime || !closeTime) {
      setError("All fields except Note are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/manual-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          direction,
          volume: parseFloat(volume),
          entry_price: parseFloat(entryPrice),
          exit_price: parseFloat(exitPrice),
          realized_pnl: parseFloat(realizedPnl),
          open_time: new Date(openTime).toISOString(),
          close_time: new Date(closeTime).toISOString(),
          note: note.trim() || null,
        }),
      });
      const data = (await res.json()) as { trade?: ManualTrade; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to save");
      onAdded(data.trade!);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500/50";
  const labelCls = "block text-[10px] uppercase tracking-wider text-slate-500 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-cyan-500/20 bg-[#0d1524] shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="text-sm font-semibold text-slate-100">Add Closed Trade</div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">✕</button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 font-mono text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Symbol + Direction */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Symbol</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder="GOLD"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Direction</label>
              <div className="inline-flex overflow-hidden rounded-md border border-white/[0.08]">
                <button
                  onClick={() => set("direction", "Long")}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${
                    form.direction === "Long"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  Long
                </button>
                <button
                  onClick={() => set("direction", "Short")}
                  className={`border-l border-white/[0.08] px-3 py-1.5 text-xs font-semibold transition ${
                    form.direction === "Short"
                      ? "bg-rose-500/20 text-rose-400"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  Short
                </button>
              </div>
            </div>
          </div>

          {/* Volume + Entry + Exit */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Volume (lots)</label>
              <input
                type="number" step="0.01" min="0"
                value={form.volume}
                onChange={(e) => set("volume", e.target.value)}
                placeholder="1.00"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Entry Price</label>
              <input
                type="number" step="any" min="0"
                value={form.entryPrice}
                onChange={(e) => set("entryPrice", e.target.value)}
                placeholder="3312.50"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Exit Price</label>
              <input
                type="number" step="any" min="0"
                value={form.exitPrice}
                onChange={(e) => set("exitPrice", e.target.value)}
                placeholder="3280.00"
                className={inputCls}
              />
            </div>
          </div>

          {/* Realized P&L */}
          <div>
            <label className={labelCls}>Realized P&L ($)</label>
            <input
              type="number" step="any"
              value={form.realizedPnl}
              onChange={(e) => set("realizedPnl", e.target.value)}
              placeholder="-700.00"
              className={inputCls}
            />
            {calcPnl !== null && (
              <div className="mt-1 font-mono text-[10px] text-slate-600">
                calc (100 oz/lot):{" "}
                <span className={calcPnl >= 0 ? "text-emerald-600" : "text-rose-700"}>
                  {calcPnl >= 0 ? "+" : ""}{calcPnl.toFixed(2)}
                </span>
                {" "}— use your broker&apos;s actual figure
              </div>
            )}
          </div>

          {/* Open + Close times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Opened</label>
              <input
                type="datetime-local"
                value={form.openTime}
                onChange={(e) => set("openTime", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Closed</label>
              <input
                type="datetime-local"
                value={form.closeTime}
                onChange={(e) => set("closeTime", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={labelCls}>Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="e.g. Gold long — stopped out on CPI miss"
              className={inputCls}
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-white/[0.08] px-4 py-1.5 text-sm text-slate-500 transition hover:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-cyan-600/80 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ClosedTrades() {
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

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

  const handleAdded = (trade: ManualTrade) => {
    // Insert in close_time desc order (newest first)
    setTrades((prev) =>
      [trade, ...prev].sort(
        (a, b) => new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime(),
      ),
    );
  };

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
      {trades.length > 0 && (
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

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Gross Gains" value={fmtMoney(stats.grossGain)} valueClass="text-emerald-400" />
            <StatCard label="Gross Losses" value={fmtSigned(stats.grossLoss)} valueClass="text-rose-400" />
            <StatCard label="Best Trade" value={fmtSigned(stats.bestTrade)} valueClass="text-emerald-400" />
            <StatCard label="Worst Trade" value={fmtSigned(stats.worstTrade)} valueClass="text-rose-400" />
          </div>
        </>
      )}

      {/* ── Trade Journal header + Add button ── */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-300">Trade Journal</div>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-1 text-xs font-semibold text-cyan-400 transition hover:bg-cyan-500/10 hover:text-cyan-300"
        >
          + Add Trade
        </button>
      </div>

      {trades.length > 0 ? (
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
                  <td className="px-4 py-2.5 font-sans font-semibold text-slate-200">{t.symbol}</td>
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
                  <td className="px-4 py-2.5 text-right text-slate-300">{t.volume.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(t.entryPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">{fmtMoney(t.exitPrice)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${pnlClass(t.realizedPnl)}`}>
                    {fmtSigned(t.realizedPnl)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtDate(t.openTime)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{fmtDate(t.closeTime)}</td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-[11px] italic text-slate-600">
                    {t.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
          <div className="text-sm font-semibold text-slate-400">No closed trades recorded</div>
          <div className="mt-1 text-[11px] text-slate-600">
            Click <span className="font-semibold text-cyan-500/70">+ Add Trade</span> above to log your first closed position.
            Trades are stored in the Supabase{" "}
            <code className="rounded bg-white/[0.04] px-1">manual_trades</code> table.
          </div>
        </div>
      )}

      {addOpen && (
        <AddTradeModal onClose={() => setAddOpen(false)} onAdded={handleAdded} />
      )}
    </div>
  );
}
