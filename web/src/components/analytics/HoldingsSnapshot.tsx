"use client";

import { useMemo, type ReactNode } from "react";
import type { PortfolioAnalytics, KpiPoint } from "@/lib/analytics";
import { fmtMoney, fmtCompact, pnlClass } from "@/lib/format";

// ── tiny SVG sparkline ─────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.filter((d) => Number.isFinite(d));
  if (pts.length < 2) return <div className="h-6" />;
  const w = 92;
  const h = 24;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const range = hi - lo || 1;
  const step = w / (pts.length - 1);
  const path = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - lo) / range) * h).toFixed(1)}`)
    .join(" ");
  const lastX = (w).toFixed(1);
  const lastY = (h - ((pts[pts.length - 1] - lo) / range) * h).toFixed(1);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={1.8} fill={color} />
    </svg>
  );
}

interface Delta {
  text: string;
  cls: string;
}

function KpiCard({
  label,
  tooltip,
  value,
  sub,
  badge,
  series,
  sparkColor,
  deltaDay,
  deltaMonth,
}: {
  label: string;
  tooltip: string;
  value: string;
  sub?: ReactNode;
  badge?: { text: string; cls: string };
  series: number[];
  sparkColor: string;
  deltaDay?: Delta;
  deltaMonth?: Delta;
}) {
  return (
    <div className="flex min-w-[180px] flex-1 flex-col rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.025] to-transparent px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <span className="cursor-help text-[10px] text-slate-600" title={tooltip}>ⓘ</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold text-slate-100">{value}</span>
        {badge && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.text}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
      <div className="mt-2 flex items-end justify-between">
        <div className="flex flex-col gap-0.5 text-[10px] font-mono">
          {deltaDay && <span className={deltaDay.cls}>{deltaDay.text} <span className="text-slate-600">1d</span></span>}
          {deltaMonth && <span className={deltaMonth.cls}>{deltaMonth.text} <span className="text-slate-600">{"≈1mo"}</span></span>}
        </div>
        <Sparkline data={series} color={sparkColor} />
      </div>
    </div>
  );
}

// ── delta formatters ────────────────────────────────────────────────────────────
const dMoney = (d: number, invert = false): Delta => ({
  text: `${d >= 0 ? "+" : "−"}$${fmtCompact(Math.abs(d))}`,
  cls: pnlClass(invert ? -d : d),
});
const dPts = (d: number, invert = false): Delta => ({
  text: `${d >= 0 ? "+" : ""}${d.toFixed(2)} pts`,
  cls: pnlClass(invert ? -d : d),
});
const dCount = (d: number): Delta => ({ text: `${d >= 0 ? "+" : ""}${d}`, cls: pnlClass(d) });
const dX = (d: number, invert = false): Delta => ({
  text: `${d >= 0 ? "+" : ""}${d.toFixed(2)}x`,
  cls: pnlClass(invert ? -d : d),
});

export default function HoldingsSnapshot({
  analytics,
  history,
  equity,
}: {
  analytics: PortfolioAnalytics;
  history: KpiPoint[];
  equity: number;
}) {
  const a = analytics;
  const eq = equity || 1;

  const series = useMemo(() => {
    const col = (f: (p: KpiPoint) => number) => history.map(f);
    return {
      nPos: col((p) => p.nPos),
      long: col((p) => p.long),
      short: col((p) => p.short),
      net: col((p) => p.net),
      gross: col((p) => p.gross),
      largest: col((p) => p.largestPct),
      avg: col((p) => p.avgPct),
      hhi: col((p) => p.hhi),
      effN: col((p) => p.effN),
    };
  }, [history]);

  const n = history.length;
  const moIdx = Math.max(0, n - 22);
  const delta = (s: number[]) => ({
    day: n >= 2 ? s[n - 1] - s[n - 2] : 0,
    month: n >= 2 ? s[n - 1] - s[moIdx] : 0,
    hasHist: n >= 2,
  });

  const dPos = delta(series.nPos);
  const dLong = delta(series.long);
  const dShort = delta(series.short);
  const dNet = delta(series.net);
  const dGross = delta(series.gross);
  const dLargest = delta(series.largest);
  const dAvg = delta(series.avg);
  const dHhi = delta(series.hhi);

  const largestSym =
    [...a.positions].sort((x, y) => y.weight - x.weight)[0]?.symbol ?? "—";
  const netPct = (a.netExposure / eq) * 100;
  const grossX = a.grossExposure / eq;

  const largeBadge =
    a.largestWeightPct > 10
      ? { text: ">10%", cls: "bg-rose-500/15 text-rose-400" }
      : a.largestWeightPct >= 5
        ? { text: "5–10%", cls: "bg-amber-500/15 text-amber-400" }
        : { text: "<5%", cls: "bg-emerald-500/15 text-emerald-400" };

  const hhiBadge =
    a.hhi > 0.1
      ? { text: "Concentrated", cls: "bg-rose-500/15 text-rose-400" }
      : a.hhi >= 0.05
        ? { text: "Moderate", cls: "bg-amber-500/15 text-amber-400" }
        : { text: "Diversified", cls: "bg-emerald-500/15 text-emerald-400" };

  const insights = useMemo(() => buildInsights(a, history, eq), [a, history, eq]);

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <KpiCard
          label="Positions" tooltip="Total active portfolio holdings."
          value={String(a.nPositions)} sub="active holdings"
          series={series.nPos} sparkColor="#38bdf8"
          deltaDay={dPos.hasHist ? dCount(dPos.day) : undefined}
          deltaMonth={dPos.hasHist ? dCount(dPos.month) : undefined}
        />
        <KpiCard
          label="Long Exposure" tooltip="Capital allocated to long positions (Σ market value of longs)."
          value={`$${fmtCompact(a.longExposure)}`}
          series={series.long} sparkColor="#10b981"
          deltaDay={dLong.hasHist ? dMoney(dLong.day) : undefined}
          deltaMonth={dLong.hasHist ? dMoney(dLong.month) : undefined}
        />
        <KpiCard
          label="Short Exposure" tooltip="Capital allocated to short positions (Σ |market value| of shorts)."
          value={`$${fmtCompact(a.shortExposure)}`}
          series={series.short} sparkColor="#f43f5e"
          deltaDay={dShort.hasHist ? dMoney(dShort.day, true) : undefined}
          deltaMonth={dShort.hasHist ? dMoney(dShort.month, true) : undefined}
        />
        <KpiCard
          label="Net Exposure" tooltip="Directional market exposure: Longs − Shorts. Green = net long, red = net short."
          value={`${a.netExposure >= 0 ? "" : "−"}$${fmtCompact(Math.abs(a.netExposure))}`}
          sub={<span className={pnlClass(a.netExposure)}>{netPct.toFixed(1)}% of equity · net {a.netExposure >= 0 ? "long" : "short"}</span>}
          series={series.net} sparkColor={a.netExposure >= 0 ? "#10b981" : "#f43f5e"}
          deltaDay={dNet.hasHist ? dMoney(dNet.day) : undefined}
          deltaMonth={dNet.hasHist ? dMoney(dNet.month) : undefined}
        />
        <KpiCard
          label="Gross Exposure" tooltip="Total portfolio exposure before netting: Longs + Shorts."
          value={`$${fmtCompact(a.grossExposure)}`}
          sub={`${grossX.toFixed(2)}x of equity`}
          series={series.gross} sparkColor="#22d3ee"
          deltaDay={dGross.hasHist ? dMoney(dGross.day) : undefined}
          deltaMonth={dGross.hasHist ? dMoney(dGross.month) : undefined}
        />
        <KpiCard
          label="Largest Position" tooltip="Largest portfolio holding by weight. Green <5%, amber 5–10%, red >10%."
          value={`${a.largestWeightPct.toFixed(1)}%`} sub={largestSym} badge={largeBadge}
          series={series.largest} sparkColor="#fbbf24"
          deltaDay={dLargest.hasHist ? dPts(dLargest.day, true) : undefined}
          deltaMonth={dLargest.hasHist ? dPts(dLargest.month, true) : undefined}
        />
        <KpiCard
          label="Avg Position Size" tooltip="Mean portfolio allocation: 100% / number of positions."
          value={`${a.avgPositionPct.toFixed(1)}%`} sub="per holding"
          series={series.avg} sparkColor="#a78bfa"
          deltaDay={dAvg.hasHist ? dPts(dAvg.day) : undefined}
          deltaMonth={dAvg.hasHist ? dPts(dAvg.month) : undefined}
        />
        <KpiCard
          label="Concentration (HHI)" tooltip="Herfindahl-Hirschman Index = Σ(weight²). Lower = more diversified."
          value={a.hhi.toFixed(3)} sub={`${a.effectiveN.toFixed(1)} effective holdings`} badge={hhiBadge}
          series={series.hhi} sparkColor="#fb923c"
          deltaDay={dHhi.hasHist ? dPts(dHhi.day * 100, true) : undefined}
          deltaMonth={dHhi.hasHist ? dPts(dHhi.month * 100, true) : undefined}
        />
      </div>

      {insights.length > 0 && (
        <div className="mt-4 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70">
            Portfolio Manager Insights
          </div>
          <ul className="space-y-1.5">
            {insights.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-cyan-500/60">▸</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[10px] text-slate-600">
            Deltas &amp; sparklines reconstruct current holdings at historical prices over {history.length || 0} trading days (open dates honoured); positions closed earlier aren&apos;t included.
          </div>
        </div>
      )}
    </div>
  );
}

function buildInsights(a: PortfolioAnalytics, history: KpiPoint[], eq: number): string[] {
  const out: string[] = [];
  const weights = [...a.positions].map((p) => p.weight).sort((x, y) => y - x);
  const top3 = weights.slice(0, 3).reduce((s, w) => s + w, 0);
  if (a.positions.length >= 3) out.push(`Top 3 holdings represent ${top3.toFixed(1)}% of gross portfolio capital.`);

  const n = history.length;
  if (n >= 3) {
    const span = n;
    const moIdx = Math.max(0, n - 22);
    const hhiNow = history[n - 1].hhi;
    const hhiMo = history[moIdx].hhi;
    if (hhiMo > 0) {
      const chg = ((hhiNow - hhiMo) / hhiMo) * 100;
      out.push(
        `Portfolio concentration ${chg >= 0 ? "increased" : "decreased"} ${Math.abs(chg).toFixed(0)}% over the last ${span} trading days (HHI ${hhiMo.toFixed(3)} → ${hhiNow.toFixed(3)}).`,
      );
    }
    const grossNowX = history[n - 1].gross / eq;
    const grossMoX = history[moIdx].gross / eq;
    if (grossMoX > 0 && Math.abs(grossNowX - grossMoX) > 0.01) {
      out.push(`Gross leverage ${grossNowX >= grossMoX ? "rose" : "fell"} from ${grossMoX.toFixed(2)}x to ${grossNowX.toFixed(2)}x over the period.`);
    }
    const effNow = history[n - 1].effN;
    const effMo = history[moIdx].effN;
    if (Math.abs(effNow - effMo) >= 0.5) {
      out.push(
        `Effective number of holdings ${effNow < effMo ? "declined" : "rose"} from ${effMo.toFixed(1)} to ${effNow.toFixed(1)}, indicating ${effNow < effMo ? "increased" : "reduced"} concentration.`,
      );
    }
    // net exposure percentile within the window
    const netSeries = history.map((p) => p.net);
    const netNow = netSeries[n - 1];
    const below = netSeries.filter((v) => v <= netNow).length;
    const pct = Math.round((below / netSeries.length) * 100);
    out.push(`Net exposure (${((a.netExposure / eq) * 100).toFixed(0)}% of equity, net ${a.netExposure >= 0 ? "long" : "short"}) sits in the ${pct}th percentile of the last ${span} days.`);
  }

  if (a.largestWeightPct > 10) {
    const sym = [...a.positions].sort((x, y) => y.weight - x.weight)[0]?.symbol ?? "";
    out.push(`Largest holding ${sym} is ${a.largestWeightPct.toFixed(1)}% of the book — above the 10% single-name concentration threshold.`);
  }

  return out.slice(0, 5);
}
