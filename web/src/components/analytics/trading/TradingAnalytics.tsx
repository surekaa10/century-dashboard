"use client";

import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import TacticalDashboard from "@/components/analytics/tactical/TacticalDashboard";
import TraderDNA from "@/components/analytics/dna/TraderDNA";
import DecisionQuality from "@/components/analytics/decision/DecisionQuality";

type Sub = "tactical" | "dna" | "decision";

export default function TradingAnalytics({ snapshot }: { snapshot: Snapshot }) {
  const [sub, setSub] = useState<Sub>("tactical");
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto px-6 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ["tactical", "Tactical Book"],
          ["dna", "Trader DNA"],
          ["decision", "Decision Quality"],
        ] as [Sub, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
              sub === k ? "bg-cyan-500/20 text-cyan-300" : "border border-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "tactical" ? (
        <TacticalDashboard snapshot={snapshot} />
      ) : sub === "dna" ? (
        <TraderDNA snapshot={snapshot} />
      ) : (
        <div className="px-6 pb-10 pt-4">
          <DecisionQuality snapshot={snapshot} />
        </div>
      )}
    </div>
  );
}
