"use client";

import { useState } from "react";
import type { Snapshot } from "@/lib/types";
import Scorecard from "../scorecard/Scorecard";
import PortfolioIntelligence from "../intelligence/PortfolioIntelligence";
import PMDashboard from "../pm/PMDashboard";

type SubTab = "scorecard" | "intelligence" | "command";

const SUBTABS: [SubTab, string, string][] = [
  ["scorecard", "Scorecard", "Portfolio health score & component grades"],
  ["intelligence", "Intelligence", "Automated insights, alerts & recommendations"],
  ["command", "PM Command", "Full portfolio command center for the desk"],
];

export default function CommandCenter({ snapshot }: { snapshot: Snapshot }) {
  const [sub, setSub] = useState<SubTab>("scorecard");
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

      {sub === "scorecard" ? (
        <Scorecard snapshot={snapshot} />
      ) : sub === "intelligence" ? (
        <PortfolioIntelligence snapshot={snapshot} />
      ) : (
        <PMDashboard snapshot={snapshot} />
      )}
    </div>
  );
}
