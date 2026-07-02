"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import {
  buildContribution, sectorAttribution, sectorAttributionForPeriod,
  contributionConcentration, leadership, periodReturn, cumReturnSeries,
  computeMonthlyReturns, computeTradeAttribution,
} from "@/lib/attribution";
import {
  computeBrinson, computeRiskMetrics, seriesReturn,
  type BrinsonResult, type RiskMetrics, type PriceSeries,
} from "@/lib/brinson";
import { fmtSigned, fmtPct, pnlClass } from "@/lib/format";
import { Section, StatCard, Sparkline } from "../ui";
import {
  PositionAttributionTable, ContributorsDetractors, SectorAttributionSection,
  TimeAttribution, CumulativeDecomposition,
} from "./AttributionViews";
import {
  ActiveReturnHeader, ActiveReturnWaterfall, BrinsonSectorTable,
  BrinsonInsights, MonthlyCalendar, TradingAttribution,
  PortfolioBenchmarkChart,
} from "./BrinsonViews";

// ── Types ──────────────────────────────────────────────────────────────────────

type PeriodKey = "daily" | "weekly" | "monthly" | "quarterly" | "ytd" | "inception";

interface AttrApiResponse {
  benchmark: PriceSeries;
  sectorRates: Record<string, PriceSeries>;
  benchmarkTicker: string;
  benchmarkName: string;
}

const BENCHMARKS = [
  { ticker: "SPY",  label: "S&P 500" },
  { ticker: "QQQ",  label: "Nasdaq 100" },
  { ticker: "URTH", label: "MSCI World" },
  { ticker: "ACWI", label: "MSCI ACWI" },
  { ticker: "IWM",  label: "Russell 2000" },
] as const;

const PERIODS: { key: PeriodKey; label: string; lookback: number }[] = [
  { key: "daily",     label: "1D",  lookback: 1  },
  { key: "weekly",    label: "1W",  lookback: 5  },
  { key: "monthly",   label: "1M",  lookback: 21 },
  { key: "quarterly", label: "3M",  lookback: 63 },
  { key: "ytd",       label: "YTD", lookback: -1 },
  { key: "inception", label: "ITD", lookback: 0  },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function PerformanceAttribution({ snapshot }: { snapshot: Snapshot }) {
  // ── Core attribution data ──────────────────────────────────────────────────
  const data    = useMemo(() => buildContribution(snapshot.positions, snapshot.symbolRates),
                          [snapshot.positions, snapshot.symbolRates]);
  const sectors = useMemo(() => sectorAttribution(data.perPosition), [data]);
  const conc    = useMemo(() => contributionConcentration(data.perPosition), [data]);
  const lead    = useMemo(() => leadership(data.perPosition), [data]);
  const cumSeries   = useMemo(() => cumReturnSeries(data), [data]);
  const monthlyRets = useMemo(() => computeMonthlyReturns(data), [data]);
  const tradeAttrib = useMemo(() => computeTradeAttribution(snapshot.deals ?? []), [snapshot.deals]);

  // ── Benchmark / period selectors ───────────────────────────────────────────
  const [bmTicker, setBmTicker]     = useState<string>("SPY");
  const [period, setPeriod]         = useState<PeriodKey>("inception");
  const [attrData, setAttrData]     = useState<AttrApiResponse | null>(null);
  const [attrLoading, setAttrLoading] = useState(true);
  const [attrError, setAttrError]   = useState("");

  // ── Tab state ──────────────────────────────────────────────────────────────
  type Tab = "brinson" | "absolute" | "trading" | "calendar";
  const [tab, setTab] = useState<Tab>("brinson");

  // ── Fetch benchmark + sector ETFs when benchmark changes ──────────────────
  useEffect(() => {
    let alive = true;
    setAttrLoading(true);
    setAttrError("");
    fetch(`/api/attribution?benchmark=${bmTicker}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: AttrApiResponse) => { if (alive) { setAttrData(d); setAttrLoading(false); } })
      .catch((e) => { if (alive) { setAttrError(e.message); setAttrLoading(false); } });
    return () => { alive = false; };
  }, [bmTicker]);

  // ── Compute Brinson-Fachler for selected period ────────────────────────────
  const activePeriod = PERIODS.find((p) => p.key === period)!;
  const lookback     = activePeriod.lookback;

  const brinson = useMemo<BrinsonResult | null>(() => {
    if (!attrData?.benchmark?.dates.length || data.dates.length < 2) return null;

    const periodSectors  = sectorAttributionForPeriod(data.perPosition, data.dates, data.mvSeries, lookback);
    const portReturn     = periodReturn(data, period).ret;
    const benchReturn    = seriesReturn(attrData.benchmark, lookback);

    return computeBrinson(periodSectors, attrData.sectorRates, benchReturn, portReturn, lookback);
  }, [attrData, data, period, lookback]);

  // ── Risk metrics ───────────────────────────────────────────────────────────
  const riskMetrics = useMemo<RiskMetrics | null>(() => {
    if (!attrData?.benchmark?.dates.length || data.dates.length < 10) return null;

    // Portfolio daily % returns
    const portDailyPct = data.portfolioDaily.map((d, i) => {
      const base = i > 0 ? (data.mvSeries[i - 1] || data.baseValue || 1) : (data.baseValue || 1);
      return base > 0 ? (d / base) * 100 : 0;
    });

    return computeRiskMetrics(data.dates, portDailyPct, attrData.benchmark);
  }, [attrData, data]);

  // ── Cumulative return series for portfolio vs benchmark chart ─────────────
  // Normalise portfolio cum to % (relative to base MV)
  const portCumPct = useMemo(
    () => data.portfolioCum.map((c) => (c / (data.baseValue || 1)) * 100),
    [data],
  );

  // ── Guard: not enough data ─────────────────────────────────────────────────
  if (!snapshot.positions.length || data.dates.length < 2) {
    return (
      <div className="px-6 py-10 text-center text-slate-500">
        Not enough price history to compute attribution.
      </div>
    );
  }

  const top5Risk = conc.top5 > 70;
  const bmName   = attrData?.benchmarkName ?? BENCHMARKS.find((b) => b.ticker === bmTicker)?.label ?? bmTicker;

  // ── Period summary cards ───────────────────────────────────────────────────
  const PERIOD_CARDS = PERIODS.map((p) => {
    const r = periodReturn(data, p.key);
    const change = r.ret - r.prevRet;
    const spark  = p.lookback > 0 ? cumSeries.slice(Math.max(0, cumSeries.length - p.lookback)) : cumSeries;
    return { ...p, r, change, spark };
  });

  return (
    <div className="px-6 pb-10">
      {/* ── Controls row: benchmark selector + period pills ── */}
      <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-white/[0.06] pb-4 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Benchmark</span>
          <div className="flex gap-1">
            {BENCHMARKS.map((b) => (
              <button key={b.ticker} onClick={() => setBmTicker(b.ticker)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  bmTicker === b.ticker
                    ? "bg-slate-500/30 text-slate-200"
                    : "border border-white/10 text-slate-500 hover:text-slate-300"
                }`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Period</span>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  period === p.key
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "border border-white/10 text-slate-500 hover:text-slate-300"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="mb-6 flex gap-1">
        {([
          ["brinson",  "Brinson-Fachler"],
          ["absolute", "Absolute Return"],
          ["trading",  "Trade Attribution"],
          ["calendar", "Monthly Calendar"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              tab === k
                ? "bg-cyan-500/20 text-cyan-300"
                : "border border-white/10 text-slate-400 hover:text-slate-200"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Brinson-Fachler                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "brinson" && (
        <>
          {attrError && (
            <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 font-mono text-xs text-amber-400">
              Attribution data error: {attrError}
            </div>
          )}

          {/* Active Return KPI strip */}
          <Section title="Active Return Overview"
            subtitle={`Portfolio vs ${bmName} — ${activePeriod.label} period — Brinson-Fachler methodology`}>
            <ActiveReturnHeader
              brinson={brinson}
              risk={riskMetrics}
              benchmarkName={bmName}
              period={activePeriod.label}
              loading={attrLoading}
            />
          </Section>

          {/* Portfolio vs Benchmark cumulative chart */}
          {!attrLoading && (
            <Section title="Portfolio vs Benchmark" subtitle="Cumulative % return — rebased to start of history">
              <PortfolioBenchmarkChart
                portfolioCum={portCumPct}
                portfolioDates={data.dates}
                attrData={attrData ? { benchmark: attrData.benchmark, benchmarkName: bmName } : null}
              />
            </Section>
          )}

          {/* Waterfall chart */}
          {brinson && (
            <Section title="Active Return Decomposition"
              subtitle="How allocation, selection, and interaction built up from benchmark to portfolio return">
              <ActiveReturnWaterfall brinson={brinson} />
            </Section>
          )}

          {/* Brinson sector table */}
          {brinson && (
            <Section title="Brinson-Fachler by Sector"
              subtitle="Allocation = sector over/underweight × sector active return. Selection = benchmark weight × stock alpha vs sector ETF.">
              <BrinsonSectorTable brinson={brinson} />
            </Section>
          )}

          {/* AI insights */}
          {brinson && (
            <Section title="Attribution Insights">
              <BrinsonInsights brinson={brinson} benchmarkName={bmName} period={activePeriod.label} />
            </Section>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Absolute Return                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "absolute" && (
        <>
          {/* Performance Summary */}
          <Section title="Performance Summary" subtitle="Reconstructed portfolio return by horizon (price-based, current holdings)">
            <div className="flex flex-wrap gap-3">
              {PERIOD_CARDS.map((p) => (
                <div key={p.key}
                  className="flex min-w-[170px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{p.label}</span>
                  <span className={`mt-1 font-mono text-xl font-semibold ${pnlClass(p.r.ret)}`}>{fmtPct(p.r.ret)}</span>
                  <span className={`text-[11px] ${pnlClass(p.r.contrib)}`}>{fmtSigned(p.r.contrib, 0)}</span>
                  <div className="mt-2 flex items-end justify-between">
                    <span className={`text-[10px] font-mono ${pnlClass(p.change)}`}>
                      {p.change >= 0 ? "+" : ""}{p.change.toFixed(2)} <span className="text-slate-600">vs prev</span>
                    </span>
                    <Sparkline data={p.spark} color={p.r.ret >= 0 ? "#10b981" : "#f43f5e"} width={70} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Position Attribution */}
          <Section title="Position Attribution" subtitle="Contribution = weight × return">
            <PositionAttributionTable rows={data.perPosition} />
            <div className="mt-4"><ContributorsDetractors rows={data.perPosition} /></div>
          </Section>

          {/* Sector Attribution */}
          <Section title="Sector Attribution">
            <SectorAttributionSection sectors={sectors} />
          </Section>

          {/* Time Attribution */}
          <Section title="Time Attribution" subtitle="Performance evolution across horizons">
            <TimeAttribution data={data} />
          </Section>

          {/* Cumulative Decomposition */}
          <Section title="Cumulative Performance Decomposition">
            <CumulativeDecomposition data={data} />
          </Section>

          {/* Concentration */}
          <Section title="Contribution Concentration"
            right={top5Risk ? <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">⚠ Top 5 &gt; 70%</span> : undefined}>
            <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([["Top 1", conc.top1], ["Top 3", conc.top3], ["Top 5", conc.top5], ["Top 10", conc.top10]] as [string, number][]).map(([l, v]) => (
                  <div key={l}>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">{l}</span>
                      <span className="font-mono text-slate-300">{v.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded bg-white/[0.04]">
                      <div className="h-2 rounded" style={{ width: `${Math.min(100, v)}%`,
                        background: v > 70 ? "#f43f5e" : v > 50 ? "#fbbf24" : "#10b981" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-sm text-slate-300">
                Top 3 positions generated <span className="font-mono text-slate-100">{conc.top3.toFixed(0)}%</span> of total portfolio gains.
              </div>
            </div>
          </Section>

          {/* Leadership */}
          <Section title="Performance Leadership">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
              <StatCard label="Winning Positions" value={String(lead.winners)} valueClass="text-emerald-400" />
              <StatCard label="Losing Positions"  value={String(lead.losers)}  valueClass="text-rose-400" />
              <StatCard label="Win Rate"           value={`${lead.winRate.toFixed(0)}%`} />
              <StatCard label="Avg Winner"         value={fmtPct(lead.avgWinnerRet)} valueClass="text-emerald-400" />
              <StatCard label="Avg Loser"          value={fmtPct(lead.avgLoserRet)}  valueClass="text-rose-400" />
              <StatCard label="Profit Factor"      value={Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞"} />
              <StatCard label="Best Position"  value={lead.best?.symbol  ?? "—"} hint={lead.best  ? fmtPct(lead.best.returnPct)  : ""} valueClass="text-emerald-400" />
              <StatCard label="Worst Position" value={lead.worst?.symbol ?? "—"} hint={lead.worst ? fmtPct(lead.worst.returnPct) : ""} valueClass="text-rose-400" />
            </div>
          </Section>

          {/* AI Insights */}
          <Section title="Performance Insights">
            <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
              <ul className="space-y-1.5">
                {buildAbsoluteInsights(data, sectors, conc, lead).map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-cyan-500/60">▸</span><span>{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[10px] text-slate-600">
                Attribution reconstructs current holdings at historical prices over {data.dates.length} trading days; closed/trimmed positions and realized P&L are not included.
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Trade Attribution                                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "trading" && (
        <Section title="Trade Attribution" subtitle="Realized P&L, commissions, and swap from closed deals in the MT5 snapshot">
          <TradingAttribution trades={tradeAttrib} />
        </Section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: Monthly Calendar                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === "calendar" && (
        <Section title="Monthly Returns Calendar"
          subtitle="Reconstructed from current holdings at historical prices — green = positive, red = negative">
          {monthlyRets.length >= 2 ? (
            <MonthlyCalendar months={monthlyRets} />
          ) : (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center text-sm text-slate-500">
              Not enough monthly data. Requires at least 2 months of price history.
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ── Absolute-return insights (unchanged from original) ─────────────────────────

function buildAbsoluteInsights(
  data: ReturnType<typeof buildContribution>,
  sectors: ReturnType<typeof sectorAttribution>,
  conc: ReturnType<typeof contributionConcentration>,
  lead: ReturnType<typeof leadership>,
): string[] {
  const out: string[] = [];
  const byUsd = [...data.perPosition].sort((a, b) => b.contribUsd - a.contribUsd);
  const totalGains = conc.totalGains || 1;

  if (byUsd[0] && byUsd[0].contribUsd > 0) {
    const t = byUsd[0];
    out.push(`${t.symbol} contributed ${t.contribPct.toFixed(2)}% and accounted for ${((t.contribUsd / totalGains) * 100).toFixed(0)}% of portfolio gains.`);
  }
  const worst = byUsd[byUsd.length - 1];
  if (worst && worst.contribUsd < 0) {
    out.push(`${worst.symbol} reduced performance by ${Math.abs(worst.contribPct).toFixed(2)}% and was the largest detractor.`);
  }
  out.push(`Top 5 contributors generated ${conc.top5.toFixed(0)}% of total portfolio gains${conc.top5 > 70 ? " — gains are highly concentrated." : "."}`);

  const secSorted = [...sectors].sort((a, b) => b.contribUsd - a.contribUsd);
  if (secSorted[0]?.contribUsd > 0) {
    const s = secSorted[0];
    out.push(`${s.sector} generated ${((s.contribUsd / totalGains) * 100).toFixed(0)}% of gains while representing ${s.weight.toFixed(0)}% of capital.`);
  }
  const secWorst = secSorted[secSorted.length - 1];
  if (secWorst?.contribUsd < 0) {
    out.push(`${secWorst.sector} was the largest sector detractor, reducing returns by ${Math.abs(secWorst.contribPct).toFixed(2)}%.`);
  }
  out.push(`Win rate ${lead.winRate.toFixed(0)}% (${lead.winners}W / ${lead.losers}L) with a profit factor of ${Number.isFinite(lead.profitFactor) ? lead.profitFactor.toFixed(2) : "∞"}; average winner ${fmtPct(lead.avgWinnerRet)} vs average loser ${fmtPct(lead.avgLoserRet)}.`);

  const incep = (data.portfolioCum[data.portfolioCum.length - 1] / (data.baseValue || 1)) * 100;
  out.push(`Reconstructed portfolio return since inception is ${fmtPct(incep)} on a ${data.baseValue >= 1000 ? "$" + (data.baseValue / 1000).toFixed(0) + "k" : "$" + data.baseValue.toFixed(0)} base.`);

  if (lead.best) out.push(`${lead.best.symbol} is the strongest performer at ${fmtPct(lead.best.returnPct)}; ${lead.worst?.symbol ?? "—"} is the weakest at ${fmtPct(lead.worst?.returnPct ?? 0)}.`);

  return out.slice(0, 10);
}
