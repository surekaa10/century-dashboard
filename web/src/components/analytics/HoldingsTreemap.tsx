"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Enriched } from "@/lib/analytics";
import { parseOpenDate } from "@/lib/analytics";
import { fmtCompact, fmtMoney, fmtSigned, fmtPct } from "@/lib/format";

// ── geometry ───────────────────────────────────────────────────────────────────
interface Rect { x: number; y: number; w: number; h: number }
const HEIGHT = 720;

// Squarified treemap (Bruls, Huizing & van Wijk). Items must carry a non-negative `value`.
function squarify<T extends { value: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const out: (T & Rect)[] = [];
  const total = items.reduce((s, it) => s + it.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out;
  const area = rect.w * rect.h;
  const nodes = items
    .map((it) => ({ it, area: (it.value / total) * area }))
    .filter((n) => n.area > 0)
    .sort((a, b) => b.area - a.area);

  let { x, y, w, h } = rect;
  const worst = (row: { area: number }[], side: number) => {
    if (!row.length) return Infinity;
    let s = 0, mn = Infinity, mx = 0;
    for (const r of row) { s += r.area; mn = Math.min(mn, r.area); mx = Math.max(mx, r.area); }
    const s2 = s * s, side2 = side * side;
    return Math.max((side2 * mx) / s2, s2 / (side2 * mn));
  };
  const commit = (row: { it: T; area: number }[]) => {
    const s = row.reduce((a, b) => a + b.area, 0);
    if (s <= 0) return;
    const horizontal = w >= h;
    const side = horizontal ? h : w;       // row spans the shorter side
    const thick = s / side;
    if (horizontal) {
      let cy = y;
      for (const r of row) { const len = r.area / thick; out.push({ ...r.it, x, y: cy, w: thick, h: len }); cy += len; }
      x += thick; w -= thick;
    } else {
      let cx = x;
      for (const r of row) { const len = r.area / thick; out.push({ ...r.it, x: cx, y, w: len, h: thick }); cx += len; }
      y += thick; h -= thick;
    }
  };

  let row: { it: T; area: number }[] = [];
  let idx = 0;
  while (idx < nodes.length) {
    const side = Math.min(w, h);
    const next = nodes[idx];
    if (!row.length || worst(row, side) >= worst([...row, next], side)) { row.push(next); idx++; }
    else { commit(row); row = []; }
  }
  if (row.length) commit(row);
  return out;
}

// Cap any single share so no tile dominates; redistributes excess to the rest.
function capShares(vals: number[], cap = 0.28): number[] {
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return vals.map(() => 0);
  const shares = vals.map((v) => v / total);
  if (vals.length * cap <= 1) return shares;   // capping impossible / pointless
  for (let it = 0; it < 25; it++) {
    const over = shares.map((s, i) => (s > cap + 1e-9 ? i : -1)).filter((i) => i >= 0);
    if (!over.length) break;
    let excess = 0;
    for (const i of over) { excess += shares[i] - cap; shares[i] = cap; }
    const under = shares.map((s, i) => (s < cap - 1e-9 ? i : -1)).filter((i) => i >= 0);
    const underSum = under.reduce((a, i) => a + shares[i], 0);
    if (underSum <= 0) break;
    for (const i of under) shares[i] += (shares[i] / underSum) * excess;
  }
  return shares;
}

// ── colour scales ────────────────────────────────────────────────────────────
const DIVERGING = [[127, 29, 29], [220, 38, 38], [55, 65, 81], [22, 163, 74], [21, 128, 61]];
const SEQUENTIAL = [[15, 76, 92], [202, 138, 4], [185, 28, 28]];
function ramp(stops: number[][], t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const pos = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i, a = stops[i], b = stops[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
const divColor = (v: number, mag: number) => ramp(DIVERGING, mag > 0 ? (v / mag + 1) / 2 : 0.5);
const seqColor = (v: number, max: number) => ramp(SEQUENTIAL, max > 0 ? v / max : 0);

// ── metric config ────────────────────────────────────────────────────────────
type GroupKey = "sector" | "industry" | "assetClass";
type SizeKey = "marketValue" | "weight" | "risk" | "var";
type ColorKey = "daily" | "total" | "pnl" | "risk" | "vol";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "sector", label: "Sector" }, { key: "industry", label: "Industry" }, { key: "assetClass", label: "Asset Class" },
];
const SIZES: { key: SizeKey; label: string }[] = [
  { key: "marketValue", label: "Market Value" }, { key: "weight", label: "Portfolio Weight" },
  { key: "risk", label: "Risk Contribution" }, { key: "var", label: "VaR Contribution" },
];
const COLORS: { key: ColorKey; label: string; diverging: boolean }[] = [
  { key: "daily", label: "Daily Return", diverging: true }, { key: "total", label: "Total Return", diverging: true },
  { key: "pnl", label: "Unrealized P&L", diverging: true }, { key: "risk", label: "Risk Contribution", diverging: false },
  { key: "vol", label: "Volatility", diverging: false },
];

const sizeVal = (r: Enriched, k: SizeKey) =>
  k === "marketValue" ? Math.abs(r.marketValue) : k === "weight" ? r.weight : k === "risk" ? Math.max(0, r.contribToVolPct) : Math.max(0, r.componentVar);
const colorVal = (r: Enriched, k: ColorKey) =>
  k === "daily" ? r.dailyReturnPct : k === "total" ? (r.totalReturnPct || r.pnlPct) : k === "pnl" ? r.unrealizedPnl : k === "risk" ? r.contribToVolPct : r.volAnnual;
const groupVal = (r: Enriched, k: GroupKey) => (k === "sector" ? r.sector : k === "industry" ? r.industry : r.assetClass) || "Other";

// ── text fitting ─────────────────────────────────────────────────────────────
const CHAR = 0.6; // approx width per pt for the system sans stack
function truncate(text: string, maxW: number, font: number): string {
  const max = Math.floor(maxW / (font * CHAR));
  if (text.length <= max) return text;
  if (max <= 1) return "";
  return text.slice(0, max - 1) + "…";
}

interface Leaf { value: number; r: Enriched; cval: number }
type Placed = Leaf & Rect;

// ── component ────────────────────────────────────────────────────────────────
export function HoldingsTreemap({ rows }: { rows: Enriched[] }) {
  const [groupBy, setGroupBy] = useState<GroupKey>("sector");
  const [sizeBy, setSizeBy] = useState<SizeKey>("marketValue");
  const [colorBy, setColorBy] = useState<ColorKey>("total");

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => { for (const e of es) setWidth(e.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colorCfg = COLORS.find((c) => c.key === colorBy)!;

  // group → leaves, with dominance-capped sizing applied globally
  const { groups, mag, maxSeq } = useMemo(() => {
    const shares = capShares(rows.map((r) => sizeVal(r, sizeBy)));
    let m = 1, ms = 0;
    const byGroup = new Map<string, Leaf[]>();
    rows.forEach((r, i) => {
      const cval = colorVal(r, colorBy);
      m = Math.max(m, Math.abs(cval));
      ms = Math.max(ms, cval);
      const g = groupVal(r, groupBy);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push({ value: shares[i], r, cval });
    });
    const groups = [...byGroup.entries()]
      .map(([name, leaves]) => ({ name, leaves, value: leaves.reduce((s, l) => s + l.value, 0) }))
      .sort((a, b) => b.value - a.value);
    // diverging domain anchored to ±5 (return) / data max so small moves stay visible
    const mag = colorCfg.diverging ? Math.max(colorBy === "pnl" ? 1 : 5, m) : m;
    return { groups, mag, maxSeq: ms };
  }, [rows, groupBy, sizeBy, colorBy, colorCfg.diverging]);

  // total MV for true portfolio weights (header + insights), independent of sizeBy
  const totalMv = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.marketValue), 0), [rows]);

  const placedSectors = useMemo(() => {
    if (width <= 0) return [];
    const sectorRects = squarify(groups, { x: 0, y: 0, w: width, h: HEIGHT });
    return sectorRects.map((s) => {
      const header = s.w > 64 && s.h > 56 ? 19 : 0;
      const inner: Rect = { x: s.x + 2, y: s.y + header + 2, w: s.w - 4, h: s.h - header - 4 };
      const leaves = squarify(s.leaves, inner);
      const mv = s.leaves.reduce((a, l) => a + Math.abs(l.r.marketValue), 0);
      return { ...s, header, leaves, weight: totalMv ? (mv / totalMv) * 100 : 0 };
    });
  }, [groups, width, totalMv]);

  // hover tooltip
  const [hover, setHover] = useState<{ r: Enriched; x: number; y: number; now: number } | null>(null);

  return (
    <div className="rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
      <SummaryCards rows={rows} totalMv={totalMv} groupBy={groupBy} />

      {/* controls */}
      <div className="mb-3 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
        <Control label="Group By" value={groupBy} onChange={(v) => setGroupBy(v as GroupKey)} opts={GROUPS} />
        <Control label="Rectangle Size" value={sizeBy} onChange={(v) => setSizeBy(v as SizeKey)} opts={SIZES} />
        <Control label="Color By" value={colorBy} onChange={(v) => setColorBy(v as ColorKey)} opts={COLORS} />
      </div>

      {/* treemap */}
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} onMouseLeave={() => setHover(null)}>
            {placedSectors.map((s) => (
              <g key={s.name}>
                <rect x={s.x + 0.5} y={s.y + 0.5} width={Math.max(0, s.w - 1)} height={Math.max(0, s.h - 1)}
                  fill="rgba(255,255,255,0.018)" stroke="rgba(148,163,184,0.28)" strokeWidth={1} rx={5} />
                {s.header > 0 && (
                  <>
                    <text x={s.x + 7} y={s.y + 14} fill="#f8fafc" fontSize={11} fontWeight={700}
                      style={{ pointerEvents: "none" }}>
                      {truncate(s.name.toUpperCase(), s.w - 60, 11)}
                    </text>
                    <text x={s.x + s.w - 7} y={s.y + 14} textAnchor="end" fill="#94a3b8" fontSize={10.5} fontWeight={600}
                      style={{ pointerEvents: "none" }}>
                      {s.weight.toFixed(1)}%
                    </text>
                  </>
                )}
                {s.leaves.map((leaf) => (
                  <LeafTile key={leaf.r.symbol} leaf={leaf} colorCfg={colorCfg} mag={mag} maxSeq={maxSeq}
                    onMove={(x, y, now) => setHover({ r: leaf.r, x, y, now })} />
                ))}
              </g>
            ))}
          </svg>
        )}
        {hover && <HoverCard r={hover.r} x={hover.x} y={hover.y} totalMv={totalMv} nowMs={hover.now} />}
      </div>

      <Legend colorCfg={colorCfg} sizeLabel={SIZES.find((s) => s.key === sizeBy)!.label} />
      <Insights rows={rows} totalMv={totalMv} groupBy={groupBy} />
    </div>
  );
}

// ── leaf tile ────────────────────────────────────────────────────────────────
function LeafTile({ leaf, colorCfg, mag, maxSeq, onMove }: {
  leaf: Placed; colorCfg: typeof COLORS[number]; mag: number; maxSeq: number; onMove: (x: number, y: number, now: number) => void;
}) {
  const { x, y, w, h, r, cval } = leaf;
  if (w <= 1.5 || h <= 1.5) return null;
  const fill = colorCfg.diverging ? divColor(cval, mag) : seqColor(cval, maxSeq);
  const ret = r.totalReturnPct || r.pnlPct;

  // font scaled to tile, never overflowing
  const tf = Math.max(8, Math.min(20, Math.floor(Math.min((w - 8) / (r.symbol.length * 0.62), h * 0.44))));
  const showTicker = w >= 30 && h >= 16;
  const full = w >= 96 && h >= 58;
  const medium = !full && w >= 58 && h >= 36;
  const sub = Math.max(8, Math.min(12, Math.round(tf * 0.6)));
  const cx = x + 5;

  return (
    <g onMouseMove={(e) => onMove(e.clientX, e.clientY, Date.now())}>
      <rect x={x + 0.75} y={y + 0.75} width={Math.max(0, w - 1.5)} height={Math.max(0, h - 1.5)}
        fill={fill} stroke="#0b0f1a" strokeWidth={1.25} rx={3}
        className="transition-opacity duration-150 hover:opacity-80" />
      {showTicker && (
        <text x={cx} y={y + tf + 2} fill="#f8fafc" fontSize={tf} fontWeight={700}
          stroke="rgba(0,0,0,0.45)" strokeWidth={0.6} paintOrder="stroke" style={{ pointerEvents: "none" }}>
          {truncate(r.symbol, w - 9, tf)}
        </text>
      )}
      {full && (
        <>
          <text x={cx} y={y + tf + sub + 6} fill="rgba(248,250,252,0.92)" fontSize={sub} fontWeight={600} style={{ pointerEvents: "none" }}>
            {truncate("$" + fmtCompact(Math.abs(r.marketValue)), w - 9, sub)}
          </text>
          <text x={cx} y={y + tf + sub * 2 + 9} fill="rgba(226,232,240,0.78)" fontSize={sub} style={{ pointerEvents: "none" }}>
            {r.weight.toFixed(1)}%
          </text>
          <text x={cx} y={y + tf + sub * 3 + 12} fill={ret >= 0 ? "#86efac" : "#fda4af"} fontSize={sub} fontWeight={600} style={{ pointerEvents: "none" }}>
            {fmtPct(ret, 1)}
          </text>
        </>
      )}
      {medium && (
        <text x={cx} y={y + tf + sub + 6} fill={ret >= 0 ? "#86efac" : "#fda4af"} fontSize={sub} fontWeight={600} style={{ pointerEvents: "none" }}>
          {truncate(fmtPct(ret, 1), w - 9, sub)}
        </text>
      )}
    </g>
  );
}

// ── hover card ───────────────────────────────────────────────────────────────
function HoverCard({ r, x, y, totalMv, nowMs }: { r: Enriched; x: number; y: number; totalMv: number; nowMs: number }) {
  const ret = r.totalReturnPct || r.pnlPct;
  const open = parseOpenDate(r.openTime);
  const days = open && nowMs ? Math.max(0, Math.round((nowMs - new Date(open).getTime()) / 86400000)) : null;
  const flip = typeof window !== "undefined" && x > window.innerWidth - 280;
  return (
    <div style={{
      position: "fixed", left: flip ? x - 268 : x + 16, top: Math.max(8, y - 40), zIndex: 50,
      background: "#0b1220", border: "1px solid #2563eb", borderRadius: 10, padding: "11px 13px",
      minWidth: 248, boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 16px rgba(37,99,235,0.25)", pointerEvents: "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, paddingBottom: 7, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{r.symbol}</span>
        <span style={{ color: r.direction === "Long" ? "#34d399" : "#fb7185", fontSize: 10, fontWeight: 600 }}>{r.direction}</span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 10.5, marginBottom: 8 }}>{r.sector} · {r.industry}</div>
      <Row l="Market Value" v={"$" + fmtMoney(Math.abs(r.marketValue), 0)} />
      <Row l="Portfolio Weight" v={r.weight.toFixed(2) + "%"} />
      <Row l="Current Price" v={"$" + fmtMoney(r.currentPrice, 2)} />
      <Row l="Entry Price" v={"$" + fmtMoney(r.entryPrice, 2)} />
      <Row l="Total Return" v={fmtPct(ret, 2)} c={ret >= 0 ? "#34d399" : "#fb7185"} />
      <Row l="Today's Return" v={fmtPct(r.dailyReturnPct, 2)} c={r.dailyReturnPct >= 0 ? "#34d399" : "#fb7185"} />
      <Row l="Unrealized P&L" v={"$" + fmtSigned(r.unrealizedPnl, 0)} c={r.unrealizedPnl >= 0 ? "#34d399" : "#fb7185"} />
      <Row l="Risk Contribution" v={r.contribToVolPct.toFixed(1) + "%"} />
      <Row l="VaR Contribution" v={totalMv ? "$" + fmtMoney(r.componentVar, 0) : "—"} />
      <Row l="Holding Period" v={days === null ? "—" : `${days} days`} />
    </div>
  );
}
function Row({ l, v, c = "#fff" }: { l: string; v: string; c?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 4 }}>
      <span style={{ color: "#9ca3af", fontSize: 11 }}>{l}</span>
      <span style={{ color: c, fontSize: 12, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

// ── summary cards ────────────────────────────────────────────────────────────
function SummaryCards({ rows, totalMv, groupBy }: { rows: Enriched[]; totalMv: number; groupBy: GroupKey }) {
  const s = useMemo(() => {
    const byRet = [...rows].sort((a, b) => (b.totalReturnPct || b.pnlPct) - (a.totalReturnPct || a.pnlPct));
    const largest = [...rows].sort((a, b) => b.weight - a.weight)[0];
    const grp = new Map<string, number>();
    for (const r of rows) grp.set(groupVal(r, groupBy), (grp.get(groupVal(r, groupBy)) ?? 0) + Math.abs(r.marketValue));
    const topGrp = [...grp.entries()].sort((a, b) => b[1] - a[1])[0];
    const avg = rows.reduce((a, r) => a + (r.totalReturnPct || r.pnlPct), 0) / Math.max(1, rows.length);
    const best = byRet[0], worst = byRet[byRet.length - 1];
    return {
      largest, best, worst, avg,
      topGrpName: topGrp?.[0] ?? "—",
      topGrpPct: topGrp && totalMv ? (topGrp[1] / totalMv) * 100 : 0,
    };
  }, [rows, totalMv, groupBy]);

  const cards: [string, string, string?][] = [
    ["Total Market Value", "$" + fmtMoney(totalMv, 0)],
    ["Total Positions", String(rows.length)],
    ["Largest Holding", s.largest ? `${s.largest.symbol} · ${s.largest.weight.toFixed(1)}%` : "—"],
    [`Largest ${GROUPS.find((g) => g.key === groupBy)!.label}`, `${s.topGrpName} · ${s.topGrpPct.toFixed(1)}%`],
    ["Best Performer", s.best ? `${s.best.symbol} ${fmtPct(s.best.totalReturnPct || s.best.pnlPct, 1)}` : "—", "pos"],
    ["Worst Performer", s.worst ? `${s.worst.symbol} ${fmtPct(s.worst.totalReturnPct || s.worst.pnlPct, 1)}` : "—", "neg"],
    ["Avg Return", fmtPct(s.avg, 1), s.avg >= 0 ? "pos" : "neg"],
    ["Holdings Shown", String(rows.length)],
  ];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map(([label, value, tone]) => (
        <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
          <div className={`mt-0.5 truncate font-mono text-sm font-semibold ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-slate-100"}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── legend ───────────────────────────────────────────────────────────────────
function Legend({ colorCfg, sizeLabel }: { colorCfg: typeof COLORS[number]; sizeLabel: string }) {
  const stops = colorCfg.diverging ? DIVERGING : SEQUENTIAL;
  const grad = `linear-gradient(to right, ${stops.map((c, i) => `rgb(${c.join(",")}) ${(i / (stops.length - 1)) * 100}%`).join(", ")})`;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 text-[11px] text-slate-400">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">Color = {colorCfg.label}</span>
        <span>{colorCfg.diverging ? "Loss" : "Low"}</span>
        <span className="h-2.5 w-32 rounded" style={{ background: grad }} />
        <span>{colorCfg.diverging ? "Gain" : "High"}</span>
      </div>
      <div className="flex items-center gap-2"><span className="inline-block h-3 w-5 rounded border border-white/20 bg-white/10" /><span>Rectangle size = {sizeLabel}</span></div>
      <div className="text-slate-600">Largest tiles capped at 28% of area · text auto-scales & hides when tiles are too small</div>
    </div>
  );
}

// ── insights ─────────────────────────────────────────────────────────────────
function Insights({ rows, totalMv, groupBy }: { rows: Enriched[]; totalMv: number; groupBy: GroupKey }) {
  const lines = useMemo(() => {
    if (!rows.length) return [];
    const label = GROUPS.find((g) => g.key === groupBy)!.label.toLowerCase();
    const mv = new Map<string, number>(), pnl = new Map<string, number>(), risk = new Map<string, number>();
    for (const r of rows) {
      const g = groupVal(r, groupBy);
      mv.set(g, (mv.get(g) ?? 0) + Math.abs(r.marketValue));
      pnl.set(g, (pnl.get(g) ?? 0) + r.unrealizedPnl);
      risk.set(g, (risk.get(g) ?? 0) + Math.max(0, r.contribToVolPct));
    }
    const topMv = [...mv.entries()].sort((a, b) => b[1] - a[1])[0];
    const byW = [...rows].sort((a, b) => b.weight - a.weight);
    const top5 = byW.slice(0, 5).reduce((a, r) => a + r.weight, 0);
    const bestPnl = [...pnl.entries()].sort((a, b) => b[1] - a[1])[0];
    const totRisk = [...risk.values()].reduce((a, b) => a + b, 0);
    const topRisk = [...risk.entries()].sort((a, b) => b[1] - a[1])[0];
    const out: string[] = [];
    if (topMv && totalMv) out.push(`The ${topMv[0]} ${label} represents ${((topMv[1] / totalMv) * 100).toFixed(1)}% of portfolio value.`);
    if (byW[0]) out.push(`The largest holding (${byW[0].symbol}) accounts for ${byW[0].weight.toFixed(1)}% of invested capital.`);
    if (rows.length >= 5) out.push(`The top five holdings represent ${top5.toFixed(1)}% of the portfolio.`);
    if (bestPnl && bestPnl[1] > 0) out.push(`${bestPnl[0]} contributed the highest unrealized gains (${"$" + fmtSigned(bestPnl[1], 0)}).`);
    if (topRisk && totRisk > 0) out.push(`${topRisk[0]} contributes ${((topRisk[1] / totRisk) * 100).toFixed(0)}% of total portfolio risk.`);
    return out;
  }, [rows, totalMv, groupBy]);

  if (!lines.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Portfolio Insights</div>
      <ul className="space-y-1.5">
        {lines.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-300"><span className="text-cyan-500/60">▸</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}

// ── control ──────────────────────────────────────────────────────────────────
function Control({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: { key: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded border border-white/10 bg-[#0d1321] px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-500/50">
        {opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}
