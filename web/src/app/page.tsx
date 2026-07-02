"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import type { BookConfig, BookView } from "@/lib/books";
import {
  DEFAULT_BOOK_CONFIG,
  filterByBook,
  loadBookConfig,
} from "@/lib/books";
import StatusHeader from "@/components/StatusHeader";
import BookSelector from "@/components/BookSelector";
import BookClassifier from "@/components/BookClassifier";
import KpiStrip from "@/components/KpiStrip";
import TradingKpiStrip from "@/components/TradingKpiStrip";
import PositionsTable from "@/components/PositionsTable";
import EquityCurve from "@/components/EquityCurve";
import AllocationDonut from "@/components/AllocationDonut";
import WorldClock from "@/components/WorldClock";
import PositionAnalytics from "@/components/analytics/PositionAnalytics";
import PerformanceAttribution from "@/components/analytics/attribution/PerformanceAttribution";
import RiskSuite from "@/components/analytics/risksuite/RiskSuite";
import PositionEvolution from "@/components/analytics/evolution/PositionEvolution";
import FactorExposure from "@/components/analytics/factors/FactorExposure";
import MarginDashboard from "@/components/margin/MarginDashboard";
import CommandCenter from "@/components/analytics/command/CommandCenter";
import TradingAnalytics from "@/components/analytics/trading/TradingAnalytics";
import ValidationDashboard from "@/components/analytics/validation/ValidationDashboard";
import MetricDictionary from "@/components/analytics/glossary/MetricDictionary";
import ResearchBallot from "@/components/ResearchBallot";

const POLL_MS = 30_000;
type Tab =
  | "overview" | "analytics" | "attribution" | "risk" | "evolution"
  | "factors" | "margin" | "trading" | "command" | "integrity" | "glossary" | "ballot";

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [tab, setTab] = useState<Tab>("overview");
  const [kpiMetric, setKpiMetric] = useState<string>("Floating P&L");

  // Book segregation state — load from localStorage after mount to avoid SSR mismatch
  const [bookConfig, setBookConfig] = useState<BookConfig>(DEFAULT_BOOK_CONFIG);
  const [activeBook, setActiveBook] = useState<BookView>("combined");
  const [classifierOpen, setClassifierOpen] = useState(false);

  useEffect(() => {
    setBookConfig(loadBookConfig());
  }, []);

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

  // All unique symbols from the current snapshot — used by BookClassifier
  const allSymbols = useMemo(
    () =>
      [...new Set((snapshot?.positions ?? []).map((p) => p.symbol.trim()))].sort(),
    [snapshot?.positions],
  );

  // Filtered snapshot for analytics components — only positions in the active book.
  // All calculation functions accept positions[], so this single filter propagates
  // throughout every tab automatically.
  const activeSnapshot = useMemo<Snapshot | null>(() => {
    if (!snapshot) return null;
    if (activeBook === "combined") return snapshot;
    return {
      ...snapshot,
      positions: filterByBook(snapshot.positions, bookConfig, activeBook),
    };
  }, [snapshot, activeBook, bookConfig]);

  // Convenience aliases used in the Overview tab
  const visiblePositions = activeSnapshot?.positions ?? [];

  return (
    <main className="min-h-screen bg-[#060a14] text-slate-200">
      <StatusHeader snapshot={snapshot} ageSeconds={ageSeconds} onBallotClick={() => setTab("ballot")} />

      {account ? (
        <>
          {/* ── Book selector bar ────────────────────────────────────────── */}
          <BookSelector
            activeBook={activeBook}
            onChange={setActiveBook}
            onClassify={() => setClassifierOpen(true)}
          />

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
              ["glossary", "Glossary"],
              ["ballot", "Research Ballot"],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-4 ${
                  tab === key
                    ? activeBook === "trading"
                      ? "border-orange-400 text-orange-300"
                      : activeBook === "investment"
                      ? "border-blue-400 text-blue-300"
                      : "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "command" ? (
            <CommandCenter snapshot={activeSnapshot!} />
          ) : tab === "overview" ? (
            <>
              <WorldClock />

              {/* KPI strip — Investment/Combined uses standard strip; Trading uses its own */}
              {activeBook === "trading" ? (
                <TradingKpiStrip
                  allPositions={snapshot!.positions}
                  bookConfig={bookConfig}
                  symbolRates={snapshot!.symbolRates}
                  todayRealized={snapshot!.todayRealized}
                />
              ) : (
                <KpiStrip
                  account={account}
                  positions={visiblePositions}
                  todayRealized={snapshot!.todayRealized}
                  symbolRates={snapshot!.symbolRates}
                  onCardClick={setKpiMetric}
                  activeCardLabel={kpiMetric}
                />
              )}

              <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <EquityCurve
                    positions={visiblePositions}
                    symbolRates={snapshot!.symbolRates}
                    account={account}
                    todayRealized={snapshot!.todayRealized}
                    metric={activeBook === "trading" ? "Floating P&L" : kpiMetric}
                  />
                </div>
                <AllocationDonut positions={visiblePositions} />
              </div>
              <div className="px-6 py-4">
                <PositionsTable
                  positions={visiblePositions}
                  allPositions={snapshot!.positions}
                  bookConfig={bookConfig}
                  activeBook={activeBook}
                  onBookChange={(sym, book) => {
                    const next = {
                      ...bookConfig,
                      classifications: { ...bookConfig.classifications, [sym]: book },
                    };
                    setBookConfig(next);
                    import("@/lib/books").then((m) => m.saveBookConfig(next));
                  }}
                />
              </div>
            </>
          ) : tab === "analytics" ? (
            <PositionAnalytics snapshot={activeSnapshot!} />
          ) : tab === "attribution" ? (
            <PerformanceAttribution snapshot={activeSnapshot!} />
          ) : tab === "risk" ? (
            <RiskSuite snapshot={activeSnapshot!} />
          ) : tab === "evolution" ? (
            <PositionEvolution snapshot={activeSnapshot!} />
          ) : tab === "factors" ? (
            <FactorExposure snapshot={activeSnapshot!} />
          ) : tab === "margin" ? (
            <MarginDashboard snapshot={activeSnapshot!} />
          ) : tab === "trading" ? (
            <TradingAnalytics snapshot={activeSnapshot!} />
          ) : tab === "integrity" ? (
            <ValidationDashboard snapshot={activeSnapshot!} />
          ) : tab === "glossary" ? (
            <MetricDictionary />
          ) : tab === "ballot" ? (
            <ResearchBallot />
          ) : (
            <CommandCenter snapshot={activeSnapshot!} />
          )}

          <footer className="px-6 py-6 text-center font-mono text-[11px] text-slate-600">
            Century Research · reads snapshot.json · auto-refresh 30s
            {activeBook !== "combined" && (
              <span
                className={`ml-2 font-semibold ${
                  activeBook === "trading" ? "text-orange-500/60" : "text-blue-500/60"
                }`}
              >
                · {activeBook} book
              </span>
            )}
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

      {/* Book classifier modal */}
      {classifierOpen && (
        <BookClassifier
          symbols={allSymbols}
          config={bookConfig}
          onSave={setBookConfig}
          onClose={() => setClassifierOpen(false)}
        />
      )}
    </main>
  );
}
