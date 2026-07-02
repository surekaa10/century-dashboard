"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot, SymbolRates } from "@/lib/types";
import type { BookConfig, BookView } from "@/lib/books";
import {
  DEFAULT_BOOK_CONFIG,
  filterByBook,
  loadBookConfig,
  loadBookConfigFromServer,
} from "@/lib/books";
import type { SimPosition } from "@/lib/simulation";
import {
  loadSimPositions,
  saveSimPositions,
  simToPosition,
  simToRates,
} from "@/lib/simulation";
import StatusHeader from "@/components/StatusHeader";
import BookSelector from "@/components/BookSelector";
import BookClassifier from "@/components/BookClassifier";
import SimulationBanner from "@/components/SimulationBanner";
import SimulationPanel from "@/components/SimulationPanel";
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

  // ── Book segregation ─────────────────────────────────────────────────────────
  const [bookConfig, setBookConfig] = useState<BookConfig>(DEFAULT_BOOK_CONFIG);
  const [activeBook, setActiveBook] = useState<BookView>("combined");
  const [classifierOpen, setClassifierOpen] = useState(false);

  // ── Simulation overlay ───────────────────────────────────────────────────────
  const [simPositions, setSimPositions] = useState<SimPosition[]>([]);
  const [simRates, setSimRates] = useState<SymbolRates>({});
  const [simPanelOpen, setSimPanelOpen] = useState(false);

  // Load localStorage/sessionStorage config on the client (avoids SSR mismatch).
  // Then overlay server-side classifications so all devices/users stay in sync.
  useEffect(() => {
    const local = loadBookConfig();
    setBookConfig(local);
    setSimPositions(loadSimPositions());

    loadBookConfigFromServer().then((serverConfig) => {
      if (serverConfig) {
        setBookConfig((prev) => ({
          classifications: { ...prev.classifications, ...serverConfig.classifications },
          riskBudget: serverConfig.riskBudget,
        }));
      }
    });
  }, []);

  // ── Live snapshot polling ────────────────────────────────────────────────────
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

  // ── Symbols for the BookClassifier modal (live positions only) ───────────────
  const allLiveSymbols = useMemo(
    () =>
      [...new Set((snapshot?.positions ?? []).map((p) => p.symbol.trim()))].sort(),
    [snapshot?.positions],
  );

  // ── Simulation helpers ───────────────────────────────────────────────────────
  const addSimPosition = (
    pos: SimPosition,
    rates: Record<string, { dates: string[]; close: number[] }>,
  ) => {
    const next = [...simPositions, pos];
    setSimPositions(next);
    saveSimPositions(next);
    if (Object.keys(rates).length) {
      setSimRates((prev) => ({ ...prev, ...rates }));
    }
  };

  const removeSimPosition = (id: string) => {
    const next = simPositions.filter((p) => p.id !== id);
    setSimPositions(next);
    saveSimPositions(next);
    // Clean up rates for symbols that no longer have any simulated position
    const remaining = new Set(next.map((p) => p.symbol));
    setSimRates((prev) => {
      const cleaned = { ...prev };
      for (const sym of Object.keys(cleaned)) {
        if (!remaining.has(sym)) delete cleaned[sym];
      }
      return cleaned;
    });
  };

  const clearAllSim = () => {
    setSimPositions([]);
    setSimRates({});
    saveSimPositions([]);
  };

  // ── Effective snapshot ───────────────────────────────────────────────────────
  // This is the single snapshot every component receives.
  // Live portfolio is NEVER modified — we build a new object each render.
  //
  //  1. Filter live positions by active book
  //  2. If "simulated" view → show only simulated positions
  //     Otherwise → live (book-filtered) + all simulated positions
  //  3. Merge symbol rates so analytics can compute vol/beta for sim symbols
  const effectiveSnapshot = useMemo<Snapshot | null>(() => {
    if (!snapshot) return null;

    const simPos = simPositions.map(simToPosition);
    let basePositions;

    if (activeBook === "simulated") {
      // Simulated-only view
      basePositions = simPos;
    } else {
      // Live positions filtered by book + all simulated positions on top
      const live = filterByBook(snapshot.positions, bookConfig, activeBook);
      basePositions = [...live, ...simPos];
    }

    return {
      ...snapshot,
      positions: basePositions,
      symbolRates: { ...snapshot.symbolRates, ...simRates },
    };
  }, [snapshot, activeBook, bookConfig, simPositions, simRates]);

  const visiblePositions = effectiveSnapshot?.positions ?? [];
  const simActive = simPositions.length > 0;

  return (
    <main className="min-h-screen bg-[#060a14] text-slate-200">
      <StatusHeader
        snapshot={snapshot}
        ageSeconds={ageSeconds}
        onBallotClick={() => setTab("ballot")}
        onSimulateClick={() => setSimPanelOpen(true)}
        simCount={simPositions.length}
      />

      {account ? (
        <>
          {/* ── Simulation active banner ─────────────────────────────────── */}
          <SimulationBanner
            simPositions={simPositions}
            onOpen={() => setSimPanelOpen(true)}
            onClearAll={clearAllSim}
          />

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
                      : activeBook === "simulated"
                      ? "border-violet-400 text-violet-300"
                      : "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "command" ? (
            <CommandCenter snapshot={effectiveSnapshot!} />
          ) : tab === "overview" ? (
            <>
              <WorldClock />

              {/* KPI strip — Trading book gets its own strip; Investment/Combined/Simulated use the standard one */}
              {activeBook === "trading" ? (
                <TradingKpiStrip
                  allPositions={snapshot!.positions}
                  bookConfig={bookConfig}
                  symbolRates={{ ...snapshot!.symbolRates, ...simRates }}
                  todayRealized={snapshot!.todayRealized}
                />
              ) : (
                <KpiStrip
                  account={account}
                  positions={visiblePositions}
                  todayRealized={snapshot!.todayRealized}
                  symbolRates={{ ...snapshot!.symbolRates, ...simRates }}
                  onCardClick={setKpiMetric}
                  activeCardLabel={kpiMetric}
                />
              )}

              <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <EquityCurve
                    positions={visiblePositions}
                    symbolRates={{ ...snapshot!.symbolRates, ...simRates }}
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
                    import("@/lib/books").then((m) => {
                      m.saveBookConfig(next);
                      m.saveBookConfigToServer(next);
                    });
                  }}
                  onRemoveSim={(sym) => {
                    const target = simPositions.find((p) => p.symbol === sym);
                    if (target) removeSimPosition(target.id);
                  }}
                />
              </div>
            </>
          ) : tab === "analytics" ? (
            <PositionAnalytics snapshot={effectiveSnapshot!} />
          ) : tab === "attribution" ? (
            <PerformanceAttribution snapshot={effectiveSnapshot!} />
          ) : tab === "risk" ? (
            <RiskSuite snapshot={effectiveSnapshot!} />
          ) : tab === "evolution" ? (
            <PositionEvolution snapshot={effectiveSnapshot!} />
          ) : tab === "factors" ? (
            <FactorExposure snapshot={effectiveSnapshot!} />
          ) : tab === "margin" ? (
            <MarginDashboard snapshot={effectiveSnapshot!} />
          ) : tab === "trading" ? (
            <TradingAnalytics snapshot={effectiveSnapshot!} />
          ) : tab === "integrity" ? (
            <ValidationDashboard snapshot={effectiveSnapshot!} />
          ) : tab === "glossary" ? (
            <MetricDictionary />
          ) : tab === "ballot" ? (
            <ResearchBallot />
          ) : (
            <CommandCenter snapshot={effectiveSnapshot!} />
          )}

          <footer className="px-6 py-6 text-center font-mono text-[11px] text-slate-600">
            Century Research · reads snapshot.json · auto-refresh 30s
            {activeBook !== "combined" && (
              <span
                className={`ml-2 font-semibold ${
                  activeBook === "trading"
                    ? "text-orange-500/60"
                    : activeBook === "investment"
                    ? "text-blue-500/60"
                    : activeBook === "simulated"
                    ? "text-violet-500/60"
                    : ""
                }`}
              >
                · {activeBook} book
              </span>
            )}
            {simActive && (
              <span className="ml-2 font-semibold text-amber-500/60">
                · {simPositions.length} simulated position{simPositions.length !== 1 ? "s" : ""} included
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

      {/* ── Book classifier modal ─────────────────────────────────────────── */}
      {classifierOpen && (
        <BookClassifier
          symbols={allLiveSymbols}
          config={bookConfig}
          onSave={setBookConfig}
          onClose={() => setClassifierOpen(false)}
        />
      )}

      {/* ── Simulation panel ─────────────────────────────────────────────── */}
      {simPanelOpen && (
        <SimulationPanel
          simPositions={simPositions}
          onAdd={addSimPosition}
          onRemove={removeSimPosition}
          onClearAll={clearAllSim}
          onClose={() => setSimPanelOpen(false)}
        />
      )}
    </main>
  );
}
