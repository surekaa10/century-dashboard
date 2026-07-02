"use client";

import type { SimPosition } from "@/lib/simulation";

export default function SimulationBanner({
  simPositions,
  onOpen,
  onClearAll,
}: {
  simPositions: SimPosition[];
  onOpen: () => void;
  onClearAll: () => void;
}) {
  if (simPositions.length === 0) return null;

  const symbols = [...new Set(simPositions.map((s) => s.symbol))].join(", ");
  const count = simPositions.length;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/[0.07] px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Pulsing indicator */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-400">
          Simulation Active
        </span>
        <span className="hidden truncate font-mono text-[11px] text-amber-300/60 sm:inline">
          · {count} position{count !== 1 ? "s" : ""}: {symbols}
        </span>
        <span className="font-mono text-[10px] text-amber-500/50">
          · all dashboards include simulated holdings · live portfolio unchanged
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onOpen}
          className="rounded border border-amber-500/30 px-2.5 py-0.5 font-mono text-[11px] text-amber-400 transition hover:border-amber-400/60 hover:text-amber-300"
        >
          Edit
        </button>
        <button
          onClick={onClearAll}
          className="rounded border border-amber-500/20 px-2.5 py-0.5 font-mono text-[11px] text-amber-600 transition hover:border-amber-500/40 hover:text-amber-400"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
