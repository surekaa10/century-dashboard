"use client";

import { useState } from "react";
import type { BookConfig, BookType } from "@/lib/books";
import { saveBookConfig } from "@/lib/books";

export default function BookClassifier({
  symbols,
  config,
  onSave,
  onClose,
}: {
  symbols: string[];
  config: BookConfig;
  onSave: (config: BookConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BookConfig>(() => ({
    classifications: { ...config.classifications },
    tradingCapital: config.tradingCapital,
  }));

  const setBook = (symbol: string, book: BookType) => {
    setDraft((prev) => ({
      ...prev,
      classifications: { ...prev.classifications, [symbol]: book },
    }));
  };

  const handleSave = () => {
    saveBookConfig(draft);
    onSave(draft);
    onClose();
  };

  const investCount = symbols.filter(
    (s) => (draft.classifications[s] ?? "investment") === "investment",
  ).length;
  const tradeCount = symbols.length - investCount;

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-cyan-500/20 bg-[#0d1524] shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-100">
              Classify Positions
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {investCount} Investment · {tradeCount} Trading
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 transition hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* trading capital input */}
        <div className="border-b border-white/[0.06] px-5 py-3">
          <label className="flex items-center gap-3">
            <span className="shrink-0 text-[11px] uppercase tracking-wider text-slate-500">
              Trading Capital ($)
            </span>
            <input
              type="number"
              value={draft.tradingCapital}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  tradingCapital: Number(e.target.value) || 0,
                }))
              }
              className="w-32 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500/50"
            />
            <span className="text-[11px] text-slate-600">
              virtual allocation for trading book
            </span>
          </label>
        </div>

        {/* symbol list */}
        <div className="flex-1 overflow-y-auto">
          {symbols.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No open positions to classify.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0d1524]">
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="px-5 py-2 text-left">Symbol</th>
                  <th className="px-5 py-2 text-right">Book</th>
                </tr>
              </thead>
              <tbody>
                {symbols.map((sym) => {
                  const current = draft.classifications[sym] ?? "investment";
                  return (
                    <tr
                      key={sym}
                      className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-2.5 font-mono font-semibold text-slate-200">
                        {sym}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <div className="inline-flex overflow-hidden rounded-md border border-white/[0.08]">
                          <button
                            onClick={() => setBook(sym, "investment")}
                            className={`px-3 py-1 text-xs font-semibold transition ${
                              current === "investment"
                                ? "bg-blue-500/20 text-blue-300"
                                : "text-slate-600 hover:text-slate-400"
                            }`}
                          >
                            Investment
                          </button>
                          <button
                            onClick={() => setBook(sym, "trading")}
                            className={`border-l border-white/[0.08] px-3 py-1 text-xs font-semibold transition ${
                              current === "trading"
                                ? "bg-orange-500/20 text-orange-300"
                                : "text-slate-600 hover:text-slate-400"
                            }`}
                          >
                            Trading
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
            onClick={handleSave}
            className="rounded-md bg-cyan-600/80 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
