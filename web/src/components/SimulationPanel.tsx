"use client";

import { useState } from "react";
import type { SimPosition, PriceResult } from "@/lib/simulation";
import { makeSimId } from "@/lib/simulation";
import { fmtMoney, fmtSigned, pnlClass } from "@/lib/format";

// ── Form state for adding / editing a simulated position ──────────────────────
const EMPTY_FORM = {
  symbol: "",
  fullName: "",
  direction: "Long" as "Long" | "Short",
  volume: "",
  entryPrice: "",
  currentPrice: "",
  notes: "",
};

type FormState = typeof EMPTY_FORM;

function calcPnl(form: FormState) {
  const vol = parseFloat(form.volume) || 0;
  const entry = parseFloat(form.entryPrice) || 0;
  const current = parseFloat(form.currentPrice) || 0;
  if (!vol || !entry || !current) return null;
  const pnl =
    form.direction === "Long"
      ? vol * (current - entry)
      : vol * (entry - current);
  const mv =
    form.direction === "Long" ? vol * current : -(vol * current);
  const pnlPct = entry > 0 ? ((current - entry) / entry) * 100 * (form.direction === "Long" ? 1 : -1) : 0;
  return { pnl, mv, pnlPct };
}

// ── Mini card inside the existing positions list ───────────────────────────────
function SimCard({
  pos,
  onRemove,
}: {
  pos: SimPosition;
  onRemove: () => void;
}) {
  const vol = pos.volume;
  const mv =
    pos.direction === "Long"
      ? vol * pos.currentPrice
      : -(vol * pos.currentPrice);
  const pnl =
    pos.direction === "Long"
      ? vol * (pos.currentPrice - pos.entryPrice)
      : vol * (pos.entryPrice - pos.currentPrice);
  const pnlPct =
    pos.entryPrice > 0
      ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) *
        100 *
        (pos.direction === "Long" ? 1 : -1)
      : 0;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-violet-300">{pos.symbol}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                pos.direction === "Long"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {pos.direction}
            </span>
          </div>
          {pos.fullName && (
            <div className="mt-0.5 truncate text-[10px] text-slate-500">{pos.fullName}</div>
          )}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 text-slate-600 transition hover:text-rose-400"
          title={`Remove ${pos.symbol}`}
        >
          ✕
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
        <div>
          <div className="text-slate-600">Qty</div>
          <div className="text-slate-300">{vol.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-slate-600">Mkt Value</div>
          <div className="text-slate-300">{fmtMoney(Math.abs(mv), 0)}</div>
        </div>
        <div>
          <div className="text-slate-600">Open P&L</div>
          <div className={pnlClass(pnl)}>
            {fmtSigned(pnl)}{" "}
            <span className="text-[10px]">({pnlPct.toFixed(1)}%)</span>
          </div>
        </div>
      </div>
      {pos.notes && (
        <div className="mt-1.5 rounded bg-white/[0.02] px-2 py-1 text-[10px] italic text-slate-500">
          {pos.notes}
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function SimulationPanel({
  simPositions,
  onAdd,
  onRemove,
  onClearAll,
  onClose,
}: {
  simPositions: SimPosition[];
  onAdd: (pos: SimPosition, rates: Record<string, { dates: string[]; close: number[] }>) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fetchError, setFetchError] = useState("");
  const [adding, setAdding] = useState(false);

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFetch = async () => {
    const sym = form.symbol.trim().toUpperCase();
    if (!sym) return;
    setFetchStatus("loading");
    setFetchError("");
    try {
      const res = await fetch(`/api/price?symbol=${encodeURIComponent(sym)}`);
      const data = (await res.json()) as PriceResult;
      if (data.error && !data.currentPrice) {
        setFetchStatus("error");
        setFetchError(data.error);
        return;
      }
      setForm((prev) => ({
        ...prev,
        symbol: data.symbol,
        fullName: data.fullName,
        currentPrice: data.currentPrice > 0 ? data.currentPrice.toFixed(2) : prev.currentPrice,
      }));
      setFetchStatus("ok");
    } catch (e) {
      setFetchStatus("error");
      setFetchError(e instanceof Error ? e.message : "Fetch failed");
    }
  };

  const handleAdd = async () => {
    const sym = form.symbol.trim().toUpperCase();
    const vol = parseFloat(form.volume);
    const entry = parseFloat(form.entryPrice);
    const current = parseFloat(form.currentPrice);
    if (!sym || !vol || !entry || !current) return;

    setAdding(true);
    // Fetch history for analytics (vol, beta, Sharpe, etc.)
    let rates: Record<string, { dates: string[]; close: number[] }> = {};
    try {
      const res = await fetch(`/api/price?symbol=${encodeURIComponent(sym)}`);
      const data = (await res.json()) as PriceResult;
      if (data.dates.length) {
        rates[sym] = { dates: data.dates, close: data.close };
      }
    } catch {
      // Analytics will work with partial data — just no history for this symbol
    }

    const simPos: SimPosition = {
      id: makeSimId(),
      symbol: sym,
      fullName: form.fullName || undefined,
      direction: form.direction,
      volume: vol,
      entryPrice: entry,
      currentPrice: current,
      notes: form.notes.trim() || undefined,
    };

    onAdd(simPos, rates);
    setForm(EMPTY_FORM);
    setFetchStatus("idle");
    setAdding(false);
  };

  const preview = calcPnl(form);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-full w-full max-w-md flex-col border-l border-violet-500/20 bg-[#0b1120] shadow-2xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">Scenario Builder</span>
              {simPositions.length > 0 && (
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-400">
                  {simPositions.length} active
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Add simulated positions · all analytics update automatically
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Active simulated positions ── */}
          {simPositions.length > 0 && (
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">
                  Active Scenario ({simPositions.length})
                </span>
                <button
                  onClick={onClearAll}
                  className="text-[11px] text-slate-600 transition hover:text-rose-400"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {simPositions.map((pos) => (
                  <SimCard
                    key={pos.id}
                    pos={pos}
                    onRemove={() => onRemove(pos.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Add position form ── */}
          <div className="px-4 py-4">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">
              Add Position
            </div>

            {/* Symbol + Fetch */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-500">Ticker Symbol</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.symbol}
                  onChange={(e) => {
                    set("symbol", e.target.value.toUpperCase());
                    setFetchStatus("idle");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  placeholder="e.g. NVDA"
                  className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/50"
                />
                <button
                  onClick={handleFetch}
                  disabled={!form.symbol.trim() || fetchStatus === "loading"}
                  className="rounded-md border border-violet-500/30 px-3 py-1.5 text-xs font-semibold text-violet-400 transition hover:border-violet-500/60 hover:bg-violet-500/10 disabled:opacity-40"
                >
                  {fetchStatus === "loading" ? "…" : "Fetch"}
                </button>
              </div>
              {fetchStatus === "ok" && form.fullName && (
                <div className="mt-1 text-[11px] text-emerald-500">{form.fullName}</div>
              )}
              {fetchStatus === "error" && (
                <div className="mt-1 text-[11px] text-rose-400">{fetchError}</div>
              )}
            </div>

            {/* Direction */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-500">Side</label>
              <div className="flex overflow-hidden rounded-md border border-white/[0.08]">
                <button
                  onClick={() => set("direction", "Long")}
                  className={`flex-1 py-1.5 text-xs font-semibold transition ${
                    form.direction === "Long"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  Long
                </button>
                <button
                  onClick={() => set("direction", "Short")}
                  className={`flex-1 border-l border-white/[0.08] py-1.5 text-xs font-semibold transition ${
                    form.direction === "Short"
                      ? "bg-rose-500/20 text-rose-400"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  Short
                </button>
              </div>
            </div>

            {/* Volume */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-500">Quantity / Shares</label>
              <input
                type="number"
                value={form.volume}
                onChange={(e) => set("volume", e.target.value)}
                placeholder="e.g. 100"
                min="0"
                step="any"
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Entry price */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-500">Entry / Purchase Price</label>
              <input
                type="number"
                value={form.entryPrice}
                onChange={(e) => set("entryPrice", e.target.value)}
                placeholder="e.g. 120.00"
                min="0"
                step="any"
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Current price */}
            <div className="mb-3">
              <label className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>Current Market Price</span>
                {fetchStatus === "ok" && (
                  <span className="text-emerald-500">auto-filled from Yahoo</span>
                )}
              </label>
              <input
                type="number"
                value={form.currentPrice}
                onChange={(e) => set("currentPrice", e.target.value)}
                placeholder="e.g. 135.00"
                min="0"
                step="any"
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Notes */}
            <div className="mb-3">
              <label className="mb-1 block text-[11px] text-slate-500">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="e.g. Q3 earnings play"
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Preview P&L */}
            {preview && (
              <div className="mb-3 rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 font-mono text-[11px]">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-600">
                  Preview
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-slate-600">Market Value</div>
                    <div className="text-slate-300">{fmtMoney(Math.abs(preview.mv), 0)}</div>
                  </div>
                  <div>
                    <div className="text-slate-600">Open P&L</div>
                    <div className={pnlClass(preview.pnl)}>{fmtSigned(preview.pnl)}</div>
                  </div>
                  <div>
                    <div className="text-slate-600">P&L %</div>
                    <div className={pnlClass(preview.pnlPct)}>
                      {preview.pnlPct >= 0 ? "+" : ""}
                      {preview.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={
                adding ||
                !form.symbol.trim() ||
                !parseFloat(form.volume) ||
                !parseFloat(form.entryPrice) ||
                !parseFloat(form.currentPrice)
              }
              className="w-full rounded-lg bg-violet-600/80 py-2 text-sm font-semibold text-white transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add to Simulation"}
            </button>
          </div>
        </div>

        {/* ── Footer note ── */}
        <div className="border-t border-white/[0.06] px-4 py-3 text-center font-mono text-[10px] text-slate-600">
          Simulated positions are in-memory only · never written to the database
        </div>
      </div>
    </div>
  );
}
