"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildAnalytics, buildKpiHistory, type Benchmark } from "@/lib/analytics";
import { fmtPct, pnlClass } from "@/lib/format";
import { Section } from "./ui";
import HoldingsSnapshot from "./HoldingsSnapshot";
import HoldingsTable from "./HoldingsTable";
import PositionExplorer from "./PositionExplorer";
import {
  WinnersLosers, HoldingsTreemap, CorrelationMatrix, ConcentrationAnalysis, SectorBreakdown, ContributionAnalysis,
} from "./AnalyticsCharts";

export default function PositionAnalytics({ snapshot }: { snapshot: Snapshot }) {
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/benchmark", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const a = useMemo(
    () => buildAnalytics(snapshot.positions, snapshot.symbolRates, benchmark),
    [snapshot.positions, snapshot.symbolRates, benchmark],
  );

  const history = useMemo(
    () => buildKpiHistory(snapshot.positions, snapshot.symbolRates, 30),
    [snapshot.positions, snapshot.symbolRates],
  );
  const equity = snapshot.account?.equity ?? 0;

  if (!snapshot.positions.length) {
    return <div className="px-6 py-10 text-center text-slate-500">No open positions to analyse.</div>;
  }

  const attribution = [...a.positions].sort((x, y) => y.contribToReturn - x.contribToReturn);

  return (
    <div className="px-6 pb-10">
      {/* 1. Holdings Snapshot */}
      <Section title="Holdings Snapshot" subtitle="Portfolio structure, exposure & concentration at a glance">
        <HoldingsSnapshot analytics={a} history={history} equity={equity} />
      </Section>

      {/* 2. Holdings Overview */}
      <Section title="Holdings Overview">
        <HoldingsTable rows={a.positions} />
      </Section>

      {/* 3. Position Details Explorer */}
      <Section title="Position Details Explorer" subtitle="Per-position risk & performance">
        <PositionExplorer rows={a.positions} />
      </Section>

      {/* 4. Winners & Losers */}
      <Section title="Winners & Losers" subtitle="Ranked by unrealized return %">
        <WinnersLosers rows={a.positions} />
      </Section>

      {/* 5. Holdings Treemap */}
      <Section title="Holdings Treemap">
        <HoldingsTreemap rows={a.positions} />
      </Section>

      {/* 6. Return Correlation Matrix */}
      <Section title="Return Correlation Matrix" subtitle="Daily-return correlation across holdings">
        <CorrelationMatrix correlation={a.correlation} />
      </Section>

      {/* 7. Concentration Analysis */}
      <Section title="Concentration Analysis">
        <ConcentrationAnalysis analytics={a} />
      </Section>

      {/* 8. Sector Breakdown */}
      <Section title="Sector Breakdown">
        <SectorBreakdown rows={a.positions} />
      </Section>

      {/* 9. Position Contribution Analysis */}
      <Section title="Position Contribution Analysis">
        <ContributionAnalysis rows={a.positions} />
      </Section>

      {/* 10. Performance Attribution Snapshot */}
      <Section title="Performance Attribution Snapshot" subtitle="Sorted by contribution to portfolio return">
        <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 text-left">Symbol</th>
                <th className="px-4 py-2 text-right">Weight</th>
                <th className="px-4 py-2 text-right">Return</th>
                <th className="px-4 py-2 text-right">Contrib. to Return</th>
                <th className="px-4 py-2 text-right">Contrib. to Risk</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {attribution.map((r) => (
                <tr key={r.symbol} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2 text-left font-sans text-slate-200">{r.symbol}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{r.weight.toFixed(2)}%</td>
                  <td className={`px-4 py-2 text-right ${pnlClass(r.pnlPct)}`}>{fmtPct(r.pnlPct)}</td>
                  <td className={`px-4 py-2 text-right ${pnlClass(r.contribToReturn)}`}>{r.contribToReturn.toFixed(3)}</td>
                  <td className="px-4 py-2 text-right text-amber-300/80">{r.contribToVolPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {!benchmark && (
        <p className="mt-4 text-[11px] text-slate-600">
          Beta vs SPY pending benchmark load (or unavailable). All other metrics use the account&apos;s own price history.
        </p>
      )}
    </div>
  );
}
