"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildScorecard } from "@/lib/scorecard";
import type { Benchmark } from "@/lib/analytics";
import { Section } from "../ui";
import {
  HealthGauge, PillarCards, PillarRadar, ScoreHistory, StrengthsWeaknesses, Recommendations, BenchmarkTable,
} from "./ScorecardViews";

export default function Scorecard({ snapshot }: { snapshot: Snapshot }) {
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/api/benchmark", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const d = useMemo(() => buildScorecard(snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark), [snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark]);

  if (!d.ok) return <div className="px-6 py-10 text-center text-slate-500">Insufficient data to compute the Portfolio Health Score.</div>;

  return (
    <div className="px-6 pb-10">
      <Section title="Portfolio Health Score" info="portfolio-health-score" subtitle="Is this a high-quality portfolio? — one score, four pillars">
        <HealthGauge d={d} />
      </Section>

      <Section title="Score Breakdown" subtitle="Four equally-weighted 25-point pillars">
        <PillarCards pillars={d.pillars} />
      </Section>

      <Section title="Pillar Profile & Evolution">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PillarRadar d={d} />
          <ScoreHistory d={d} />
        </div>
      </Section>

      <Section title="Strengths & Weaknesses"><StrengthsWeaknesses d={d} /></Section>

      <Section title="Portfolio Manager Recommendations" subtitle="Ranked by estimated score impact"><Recommendations d={d} /></Section>

      <Section title="Benchmark Comparison" subtitle="vs equal-weight, risk-parity (inverse-vol), and S&P 500"><BenchmarkTable d={d} /></Section>

      <Section title="AI Portfolio Review">
        <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] p-4 text-sm leading-relaxed text-slate-200">{d.review}</div>
        <div className="mt-2 text-[10px] text-slate-600">Composite of the platform&apos;s analytics engines (return/diversification/risk/concentration) over the holdings&apos; available history. Benchmark variants are reconstructed from the same return window; equal-weight/risk-parity are illustrative, not executed allocations.</div>
      </Section>
    </div>
  );
}
