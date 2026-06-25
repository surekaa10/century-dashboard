"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import StatusHeader from "@/components/StatusHeader";
import KpiStrip from "@/components/KpiStrip";
import PositionsTable from "@/components/PositionsTable";
import EquityCurve from "@/components/EquityCurve";
import AllocationDonut from "@/components/AllocationDonut";
import PositionAnalytics from "@/components/analytics/PositionAnalytics";
import PerformanceAttribution from "@/components/analytics/attribution/PerformanceAttribution";
import RiskAttribution from "@/components/analytics/risk/RiskAttribution";
import PositionEvolution from "@/components/analytics/evolution/PositionEvolution";
import DiversificationAnalysis from "@/components/analytics/diversification/DiversificationAnalysis";
import FactorExposure from "@/components/analytics/factors/FactorExposure";
import StressTesting from "@/components/analytics/stress/StressTesting";
import MarginDashboard from "@/components/margin/MarginDashboard";
import DrawdownAnalytics from "@/components/analytics/drawdown/DrawdownAnalytics";
import Scorecard from "@/components/analytics/scorecard/Scorecard";
import PortfolioIntelligence from "@/components/analytics/intelligence/PortfolioIntelligence";
import PMDashboard from "@/components/analytics/pm/PMDashboard";

const POLL_MS = 30_000;
type Tab =
  | "overview" | "scorecard" | "analytics" | "attribution" | "risk" | "evolution"
  | "diversification" | "factors" | "stress" | "margin" | "drawdown" | "intelligence" | "command";

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        const data = (await res.json()) as Snapshot;
        if (alive) setSnapshot(data);
      } catch {
        if (alive)
          setSnapshot({
            ok: false,
            error: "Network error",
            generatedAt: "",
            account: null,
            positions: [],
            deals: [],
            todayRealized: 0,
            symbolRates: {},
          });
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const ageSeconds = snapshot?.generatedAt
    ? Math.max(0, (now - new Date(snapshot.generatedAt).getTime()) / 1000)
    : null;

  const account = snapshot?.account ?? null;

  return (
    <main className="min-h-screen bg-[#060a14] text-slate-200">
      <StatusHeader snapshot={snapshot} ageSeconds={ageSeconds} />

      {account ? (
        <>
          <nav className="flex gap-1 border-b border-cyan-500/10 px-6">
            {([
              ["overview", "Overview"],
              ["scorecard", "Scorecard"],
              ["analytics", "Position Analytics"],
              ["attribution", "Attribution"],
              ["risk", "Risk"],
              ["evolution", "Evolution"],
              ["diversification", "Diversification"],
              ["factors", "Factors"],
              ["stress", "Stress"],
              ["margin", "Margin & Leverage"],
              ["drawdown", "Drawdown"],
              ["intelligence", "Intelligence"],
              ["command", "PM Command"],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                  tab === key
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "intelligence" ? (
            <PortfolioIntelligence snapshot={snapshot!} />
          ) : tab === "scorecard" ? (
            <Scorecard snapshot={snapshot!} />
          ) : tab === "overview" ? (
            <>
              <KpiStrip
                account={account}
                positions={snapshot!.positions}
                todayRealized={snapshot!.todayRealized}
                deals={snapshot!.deals}
              />
              <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <EquityCurve positions={snapshot!.positions} symbolRates={snapshot!.symbolRates} />
                </div>
                <AllocationDonut positions={snapshot!.positions} />
              </div>
              <div className="px-6 py-4">
                <PositionsTable positions={snapshot!.positions} />
              </div>
            </>
          ) : tab === "analytics" ? (
            <PositionAnalytics snapshot={snapshot!} />
          ) : tab === "attribution" ? (
            <PerformanceAttribution snapshot={snapshot!} />
          ) : tab === "risk" ? (
            <RiskAttribution snapshot={snapshot!} />
          ) : tab === "evolution" ? (
            <PositionEvolution snapshot={snapshot!} />
          ) : tab === "diversification" ? (
            <DiversificationAnalysis snapshot={snapshot!} />
          ) : tab === "factors" ? (
            <FactorExposure snapshot={snapshot!} />
          ) : tab === "stress" ? (
            <StressTesting snapshot={snapshot!} />
          ) : tab === "margin" ? (
            <MarginDashboard snapshot={snapshot!} />
          ) : tab === "drawdown" ? (
            <DrawdownAnalytics snapshot={snapshot!} />
          ) : tab === "command" ? (
            <PMDashboard snapshot={snapshot!} />
          ) : (
            <PortfolioIntelligence snapshot={snapshot!} />
          )}

          <footer className="px-6 py-6 text-center font-mono text-[11px] text-slate-600">
            Century Research · reads snapshot.json · auto-refresh 30s
          </footer>
        </>
      ) : (
        <div className="flex h-[60vh] items-center justify-center px-6">
          <div className="max-w-lg rounded-lg border border-rose-500/20 bg-rose-500/5 p-6 text-center">
            <div className="mb-2 text-sm font-semibold text-rose-300">
              {snapshot ? "Could not load snapshot" : "Loading…"}
            </div>
            {snapshot?.error && (
              <div className="font-mono text-xs text-slate-400">{snapshot.error}</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
