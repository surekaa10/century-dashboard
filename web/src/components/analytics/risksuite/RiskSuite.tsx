"use client";

import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import RiskAttribution from "../risk/RiskAttribution";
import DiversificationAnalysis from "../diversification/DiversificationAnalysis";
import StressTesting from "../stress/StressTesting";
import DrawdownAnalytics from "../drawdown/DrawdownAnalytics";
import RiskAdjustedPerformance from "../riskadjusted/RiskAdjustedPerformance";

type SubTab = "risk" | "diversification" | "stress" | "drawdown" | "adjusted";

const SUBTABS: [SubTab, string, string][] = [
  ["risk", "Risk Attribution", "Volatility, VaR & risk contribution by position"],
  ["diversification", "Diversification", "Correlation, clustering & concentration"],
  ["stress", "Stress Testing", "Scenario, factor-shock & Monte-Carlo resilience"],
  ["drawdown", "Drawdown", "Peak-to-trough decline & recovery"],
  ["adjusted", "Risk-Adjusted Performance", "Sharpe, Sortino, alpha, beta & risk efficiency"],
];

export default function RiskSuite({ snapshot }: { snapshot: Snapshot }) {
  const [sub, setSub] = useState<SubTab>("risk");
  const active = SUBTABS.find((s) => s[0] === sub)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-6 pt-4">
        {SUBTABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              sub === key
                ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300"
                : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="px-6 pt-2 text-[11px] text-slate-500">{active[2]}</div>

      {sub === "risk" ? (
        <RiskAttribution snapshot={snapshot} />
      ) : sub === "diversification" ? (
        <DiversificationAnalysis snapshot={snapshot} />
      ) : sub === "stress" ? (
        <StressTesting snapshot={snapshot} />
      ) : sub === "adjusted" ? (
        <RiskAdjustedPerformance snapshot={snapshot} />
      ) : (
        <DrawdownAnalytics snapshot={snapshot} />
      )}
    </div>
  );
}
