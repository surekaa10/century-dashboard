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
import RiskSuite from "@/components/analytics/risksuite/RiskSuite";
import PositionEvolution from "@/components/analytics/evolution/PositionEvolution";
import FactorExposure from "@/components/analytics/factors/FactorExposure";
import MarginDashboard from "@/components/margin/MarginDashboard";
import CommandCenter from "@/components/analytics/command/CommandCenter";
import TradingAnalytics from "@/components/analytics/trading/TradingAnalytics";
import ValidationDashboard from "@/components/analytics/validation/ValidationDashboard";

const POLL_MS = 30_000;
type Tab =
  | "overview" | "analytics" | "attribution" | "risk" | "evolution"
  | "factors" | "margin" | "trading" | "command" | "integrity";

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [tab, setTab] = useState<Tab>("overview");
  const [kpiOverlay, setKpiOverlay] = useState<{ label: string; value: number; color: string } | null>(null);

  const handleKpiCardClick = (label: string, value: number, color: string) => {
    setKpiOverlay((prev) => (prev?.label === label ? null : { label, value, color }));
  };

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
          <nav className="flex gap-1 overflow-x-auto border-b border-cyan-500/10 px-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([
              ["overview", "Overview"],
              ["analytics", "Position Analytics"],
              ["evolution", "Evolution"],
              ["risk", "Risk & Resilience"],
              ["margin", "Margin & Leverage"],
              ["attribution", "Attribution"],
              ["factors", "Factors"],
              ["trading", "Trading"],
              ["command", "Command Center"],
              ["integrity", "Integrity"],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-4 ${
                  tab === key
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "command" ? (
            <CommandCenter snapshot={snapshot!} />
          ) : tab === "overview" ? (
            <>
              <KpiStrip
                account={account}
                positions={snapshot!.positions}
                todayRealized={snapshot!.todayRealized}
                symbolRates={snapshot!.symbolRates}
                onCardClick={handleKpiCardClick}
                activeCardLabel={kpiOverlay?.label}
              />
              <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <EquityCurve
                    positions={snapshot!.positions}
                    symbolRates={snapshot!.symbolRates}
                    overlayLine={kpiOverlay ?? undefined}
                  />
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
            <RiskSuite snapshot={snapshot!} />
          ) : tab === "evolution" ? (
            <PositionEvolution snapshot={snapshot!} />
          ) : tab === "factors" ? (
            <FactorExposure snapshot={snapshot!} />
          ) : tab === "margin" ? (
            <MarginDashboard snapshot={snapshot!} />
          ) : tab === "trading" ? (
            <TradingAnalytics snapshot={snapshot!} />
          ) : tab === "integrity" ? (
            <ValidationDashboard snapshot={snapshot!} />
          ) : (
            <CommandCenter snapshot={snapshot!} />
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
