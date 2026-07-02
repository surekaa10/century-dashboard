"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import type { Snapshot } from "@/lib/types";
import {
  UNIVERSE_SEEDS,
  ASSET_CLASS_COLOR,
  type AssetClass,
  type GICSsector,
  type BatchQuote,
  type SecurityDetail,
  type SearchResult,
} from "@/lib/universe";

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  if (!n || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtLarge(n: number) {
  if (!n || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtVol(n: number) {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function pctColor(v: number) {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400";
}
function signBadge(v: number) {
  const cls = v > 0 ? "bg-emerald-500/15 text-emerald-400" : v < 0 ? "bg-red-500/15 text-red-400" : "bg-slate-500/15 text-slate-400";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-mono ${cls}`}>
      {v > 0 ? "+" : ""}{fmt(v, 2)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

function SearchBar({ onSelect }: { onSelect: (ticker: string) => void }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(`/api/universe/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data: { results: SearchResult[] }) => {
        setResults(data.results ?? []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(val), 280);
  };

  const pick = (ticker: string) => {
    setQuery(""); setResults([]); setOpen(false);
    onSelect(ticker);
  };

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 focus-within:border-cyan-500/60">
        <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={query}
          onChange={onChange}
          placeholder="Search securities — ticker, name, ISIN…"
          className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
        {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#0f1623] shadow-2xl">
          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => pick(r.ticker)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-white/5"
            >
              <span className="w-14 shrink-0 font-mono text-xs font-semibold text-cyan-400">{r.ticker}</span>
              <span className="flex-1 truncate text-slate-200">{r.name}</span>
              <span className="shrink-0 text-[10px] text-slate-600">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Security Card (grid tile) ────────────────────────────────────────────────

function SecurityCard({
  seed, quote, onClick, isSelected, inPortfolio,
}: {
  seed: { ticker: string; name: string; assetClass: AssetClass; sector: GICSsector; tags: string[] };
  quote?: BatchQuote;
  onClick: () => void;
  isSelected?: boolean;
  inPortfolio?: boolean;
}) {
  const colorClass = ASSET_CLASS_COLOR[seed.assetClass] ?? "text-slate-400 bg-slate-400/10";
  const wk52Pct = quote && quote.fiftyTwoWeekLow && quote.fiftyTwoWeekHigh
    ? ((quote.price - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100
    : null;

  return (
    <button
      onClick={onClick}
      className={`group relative w-full rounded-xl border p-4 text-left transition hover:border-cyan-500/40 hover:bg-white/[0.04] ${
        isSelected ? "border-cyan-500/60 bg-cyan-500/5" : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      {inPortfolio && (
        <span className="absolute right-3 top-3 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-400">
          HELD
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 font-mono text-xs font-bold text-slate-200">
          {seed.ticker.slice(0, 4)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold text-slate-100">{seed.ticker}</p>
          <p className="truncate text-[11px] text-slate-500">{seed.name}</p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          {quote ? (
            <>
              <p className="font-mono text-sm font-semibold text-slate-100">${fmt(quote.price)}</p>
              {signBadge(quote.changePct)}
            </>
          ) : (
            <div className="h-4 w-16 animate-pulse rounded bg-white/5" />
          )}
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>{seed.assetClass}</span>
      </div>

      {wk52Pct !== null && (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${Math.max(2, wk52Pct)}%` }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
            <span>${fmt(quote!.fiftyTwoWeekLow, 0)}</span>
            <span className="text-slate-500">52-wk</span>
            <span>${fmt(quote!.fiftyTwoWeekHigh, 0)}</span>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1">
        {seed.tags.slice(0, 3).map((t) => (
          <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">{t}</span>
        ))}
      </div>
    </button>
  );
}

// ─── Price Chart ──────────────────────────────────────────────────────────────

function PriceChart({ series }: { series: { dates: string[]; close: number[] } }) {
  const data = series.dates.map((d, i) => ({ d, v: series.close[i] }));
  if (data.length < 2) return <div className="flex h-32 items-center justify-center text-xs text-slate-600">No price data</div>;

  const first = data[0].v;
  const last  = data[data.length - 1].v;
  const up    = last >= first;
  const color = up ? "#34d399" : "#f87171";

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="d" hide />
        <YAxis hide domain={["auto", "auto"]} />
        <RTooltip
          content={({ payload }) => {
            if (!payload?.[0]) return null;
            const p = payload[0].payload as { d: string; v: number };
            return (
              <div className="rounded border border-white/10 bg-[#0f1623] px-2 py-1 text-xs text-slate-200">
                {p.d}: ${fmt(p.v)}
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#priceGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Analyst Recommendation Bar ───────────────────────────────────────────────

function RecBar({ recs }: { recs: SecurityDetail["analystRecs"] }) {
  if (!recs.length) return null;
  const r = recs[0];
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (!total) return null;
  const segments = [
    { label: "Strong Buy", count: r.strongBuy, color: "#10b981" },
    { label: "Buy",        count: r.buy,       color: "#34d399" },
    { label: "Hold",       count: r.hold,      color: "#94a3b8" },
    { label: "Sell",       count: r.sell,      color: "#f87171" },
    { label: "Str Sell",   count: r.strongSell,color: "#ef4444" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((seg) => (
          <div
            key={seg.label}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {segments.map((seg) => (
          <span key={seg.label} className="text-[10px] text-slate-500">
            <span style={{ color: seg.color }}>■</span> {seg.label} {seg.count}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

type DetailTab = "overview" | "financials" | "ownership" | "estimates" | "history";

function SecurityDetailPanel({
  ticker,
  portfolioTickers,
  onClose,
}: {
  ticker: string;
  portfolioTickers: Set<string>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SecurityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [dtab, setDtab]     = useState<DetailTab>("overview");

  useEffect(() => {
    setDetail(null); setError(null); setLoading(true); setDtab("overview");
    fetch(`/api/universe/quote?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: { quote?: SecurityDetail; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setDetail(d.quote ?? null);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [ticker]);

  const inPortfolio = portfolioTickers.has(ticker.toUpperCase());
  const d = detail;

  const recKeyColor: Record<string, string> = {
    "buy":          "text-emerald-400",
    "strong_buy":   "text-emerald-300",
    "hold":         "text-yellow-400",
    "sell":         "text-red-400",
    "strong_sell":  "text-red-300",
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/10 bg-[#070c17] shadow-2xl">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-xl font-bold text-slate-100">{ticker}</h2>
            {inPortfolio && (
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-400">IN PORTFOLIO</span>
            )}
          </div>
          {d && <p className="mt-0.5 text-sm text-slate-400">{d.name || ticker}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:text-slate-200">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      )}
      {error && <div className="flex-1 p-6 text-sm text-red-400">{error}</div>}

      {!loading && !error && d && (
        <>
          {/* Price strip */}
          <div className="shrink-0 border-b border-white/10 px-6 py-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-bold text-slate-100">
                {d.currency === "USD" ? "$" : d.currency + " "}{fmt(d.price)}
              </span>
              {signBadge(d.changePct)}
              <span className={`text-sm ${pctColor(d.change)}`}>
                {d.change > 0 ? "+" : ""}{fmt(d.change, 2)} today
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>52wk <span className="text-slate-400">${fmt(d.fiftyTwoWeekLow, 0)} – ${fmt(d.fiftyTwoWeekHigh, 0)}</span></span>
              <span>Mkt Cap <span className="text-slate-400">{fmtLarge(d.mktCap)}</span></span>
              <span>Vol <span className="text-slate-400">{fmtVol(d.volume)}</span></span>
              <span>P/E <span className="text-slate-400">{d.pe ? fmt(d.pe, 1) : "—"}</span></span>
              {d.dividend > 0 && <span>Div Yield <span className="text-slate-400">{fmt(d.dividendYield, 2)}%</span></span>}
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex shrink-0 gap-0.5 border-b border-white/10 px-6">
            {(["overview","financials","estimates","ownership","history"] as DetailTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setDtab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium capitalize transition ${
                  dtab === t ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">

            {dtab === "overview" && (
              <div className="space-y-5">
                {/* Price chart */}
                {d.priceSeries.dates.length > 1 && <PriceChart series={d.priceSeries} />}

                {/* KPI grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <KPICard label="Market Cap"     value={fmtLarge(d.mktCap)} />
                  <KPICard label="P/E (TTM)"      value={d.pe ? fmt(d.pe, 1) : "—"} />
                  <KPICard label="Fwd P/E"        value={d.forwardPE ? fmt(d.forwardPE, 1) : "—"} />
                  <KPICard label="EPS"            value={d.eps ? `$${fmt(d.eps)}` : "—"} />
                  <KPICard label="Beta"           value={d.beta ? fmt(d.beta, 2) : "—"} />
                  <KPICard label="Div Yield"      value={d.dividendYield > 0 ? `${fmt(d.dividendYield, 2)}%` : "—"} />
                  <KPICard label="Avg Volume"     value={fmtVol(d.avgVolume)} />
                  <KPICard label="Short Float"    value={d.shortFloat ? `${fmt(d.shortFloat, 1)}%` : "—"} />
                  <KPICard label="52-wk Range"    value={`$${fmt(d.fiftyTwoWeekLow, 0)}–$${fmt(d.fiftyTwoWeekHigh, 0)}`} />
                </div>

                {/* Analyst target */}
                {d.targetMean > 0 && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Analyst Consensus</p>
                    <div className="flex items-center gap-4">
                      <span className={`text-lg font-bold capitalize ${recKeyColor[d.recommendationKey] ?? "text-slate-300"}`}>
                        {d.recommendationKey.replace("_", " ")}
                      </span>
                      <div className="text-sm text-slate-400">
                        Target: <span className="font-mono font-semibold text-slate-200">${fmt(d.targetMean)}</span>
                        <span className="ml-1 text-xs text-slate-600">
                          (${fmt(d.targetLow)} – ${fmt(d.targetHigh)}) · {d.numAnalysts} analysts
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <RecBar recs={d.analystRecs} />
                    </div>
                  </div>
                )}

                {/* Description */}
                {d.description && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">About</p>
                    <p className="text-xs leading-relaxed text-slate-400 line-clamp-6">{d.description}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      {d.sector && <span>Sector: <span className="text-slate-400">{d.sector}</span></span>}
                      {d.industry && <span>Industry: <span className="text-slate-400">{d.industry}</span></span>}
                      {d.country && <span>Country: <span className="text-slate-400">{d.country}</span></span>}
                      {d.employees > 0 && <span>Employees: <span className="text-slate-400">{d.employees.toLocaleString()}</span></span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {dtab === "financials" && (
              <div className="space-y-5">
                {/* Margin KPIs */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <KPICard label="Revenue (TTM)"   value={fmtLarge(d.revenue)} sub={d.revenueGrowth ? `${d.revenueGrowth > 0 ? "+" : ""}${fmt(d.revenueGrowth, 1)}% YoY` : undefined} />
                  <KPICard label="Gross Margin"    value={d.grossMargin ? `${fmt(d.grossMargin, 1)}%` : "—"} />
                  <KPICard label="Oper. Margin"    value={d.operatingMargin ? `${fmt(d.operatingMargin, 1)}%` : "—"} />
                  <KPICard label="Net Margin"      value={d.netMargin ? `${fmt(d.netMargin, 1)}%` : "—"} />
                  <KPICard label="ROE"             value={d.roe ? `${fmt(d.roe, 1)}%` : "—"} />
                  <KPICard label="ROA"             value={d.roa ? `${fmt(d.roa, 1)}%` : "—"} />
                  <KPICard label="Debt / Equity"   value={d.debtToEquity ? fmt(d.debtToEquity, 2) : "—"} />
                  <KPICard label="Current Ratio"   value={d.currentRatio ? fmt(d.currentRatio, 2) : "—"} />
                  <KPICard label="Free Cash Flow"  value={fmtLarge(d.freeCashFlow)} />
                </div>

                {/* Income statement */}
                {d.income.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Income Statement (Annual)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] text-slate-500">
                            <th className="py-1.5 pr-4 text-left">Year</th>
                            <th className="py-1.5 pr-4 text-right">Revenue</th>
                            <th className="py-1.5 pr-4 text-right">Gross</th>
                            <th className="py-1.5 pr-4 text-right">Op. Income</th>
                            <th className="py-1.5 text-right">Net Income</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.income.map((r) => (
                            <tr key={r.date} className="border-b border-white/[0.04]">
                              <td className="py-1.5 pr-4 text-slate-400">{r.date.slice(0, 4)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-200">{fmtLarge(r.totalRevenue)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-200">{fmtLarge(r.grossProfit)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-200">{fmtLarge(r.operatingIncome)}</td>
                              <td className={`py-1.5 text-right font-mono ${r.netIncome >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtLarge(r.netIncome)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Cash flow bar chart */}
                {d.cashflow.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Cash Flow (Annual)</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={d.cashflow.slice().reverse()} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(0, 4)} tick={{ fill: "#64748b", fontSize: 10 }} />
                        <YAxis hide />
                        <RTooltip
                          formatter={(v: unknown) => fmtLarge(typeof v === "number" ? v : 0)}
                          contentStyle={{ background: "#0f1623", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, fontSize: 11 }}
                          labelStyle={{ color: "#94a3b8" }}
                        />
                        <Bar dataKey="operatingCashflow" name="Operating CF" fill="#34d399" radius={[3, 3, 0, 0]}>
                          {d.cashflow.slice().reverse().map((r) => (
                            <Cell key={r.date} fill={r.operatingCashflow >= 0 ? "#34d399" : "#f87171"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {dtab === "estimates" && (
              <div className="space-y-5">
                {/* Price target */}
                {d.targetMean > 0 && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">Price Target</p>
                    <div className="relative h-2 w-full rounded-full bg-white/5">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-cyan-500/40"
                        style={{ width: `${Math.min(100, Math.max(0, ((d.price - d.targetLow) / (d.targetHigh - d.targetLow)) * 100))}%` }}
                      />
                      <div
                        className="absolute top-[-4px] h-4 w-0.5 rounded-full bg-slate-300"
                        style={{ left: `${Math.min(100, Math.max(0, ((d.price - d.targetLow) / (d.targetHigh - d.targetLow)) * 100))}%` }}
                        title="Current price"
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                      <span>${fmt(d.targetLow)} Low</span>
                      <span className="text-slate-400">${fmt(d.targetMean)} Mean</span>
                      <span>${fmt(d.targetHigh)} High</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Upside: {((d.targetMean / d.price - 1) * 100) > 0 ? "+" : ""}{fmt((d.targetMean / d.price - 1) * 100, 1)}% from current
                    </p>
                  </div>
                )}

                {/* Recommendation trend bars */}
                {d.analystRecs.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Rating Trend</p>
                    <div className="space-y-3">
                      {d.analystRecs.map((r) => (
                        <div key={r.period}>
                          <p className="mb-1 text-[10px] text-slate-500">{r.period}</p>
                          <RecBar recs={[r]} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upgrade/downgrade history */}
                {d.upgrades.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Rating Changes</p>
                    <div className="space-y-1">
                      {d.upgrades.slice(0, 12).map((u, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                          <span className={`shrink-0 text-[10px] font-semibold ${
                            u.action === "up" ? "text-emerald-400" : u.action === "down" ? "text-red-400" : "text-slate-400"
                          }`}>
                            {u.action === "up" ? "▲" : u.action === "down" ? "▼" : "◆"}
                          </span>
                          <span className="w-28 shrink-0 truncate text-slate-400">{u.firm}</span>
                          <span className="flex-1 text-slate-200">{u.fromGrade || "—"} → {u.toGrade}</span>
                          <span className="shrink-0 text-[10px] text-slate-600">{u.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {dtab === "ownership" && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-2">
                  <KPICard label="Institutional" value={d.institutionalOwnership ? `${fmt(d.institutionalOwnership, 1)}%` : "—"} />
                  <KPICard label="Insider"       value={d.insiderOwnership ? `${fmt(d.insiderOwnership, 1)}%` : "—"} />
                  <KPICard label="Short Float"   value={d.shortFloat ? `${fmt(d.shortFloat, 1)}%` : "—"} />
                </div>

                {d.institutions.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Top Institutional Holders</p>
                    <div className="space-y-1">
                      {d.institutions.map((inst) => (
                        <div key={inst.name} className="flex items-center gap-3 rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                          <span className="flex-1 truncate text-slate-300">{inst.name}</span>
                          <span className="w-16 text-right font-mono text-slate-400">{fmtLarge(inst.shares)}</span>
                          <span className="w-12 text-right font-mono text-slate-200">{fmt(inst.pctHeld, 2)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {d.insiderTxs.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Recent Insider Transactions</p>
                    <div className="space-y-1">
                      {d.insiderTxs.map((tx, i) => (
                        <div key={i} className="rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-200">{tx.name}</span>
                            <span className="text-[10px] text-slate-600">{tx.date}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-slate-500">
                            <span>{tx.relation}</span>
                            <span className="text-slate-400">{tx.transactionDesc}</span>
                            <span className={tx.shares >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {tx.shares >= 0 ? "+" : ""}{fmtLarge(tx.shares)} shares
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {dtab === "history" && (
              <div className="space-y-4">
                {d.balance.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Balance Sheet (Annual)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] text-slate-500">
                            <th className="py-1.5 pr-4 text-left">Year</th>
                            <th className="py-1.5 pr-4 text-right">Total Assets</th>
                            <th className="py-1.5 pr-4 text-right">Total Liab.</th>
                            <th className="py-1.5 pr-4 text-right">Equity</th>
                            <th className="py-1.5 text-right">Cash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.balance.map((r) => (
                            <tr key={r.date} className="border-b border-white/[0.04]">
                              <td className="py-1.5 pr-4 text-slate-400">{r.date.slice(0, 4)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-200">{fmtLarge(r.totalAssets)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-300">{fmtLarge(r.totalLiabilities)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-emerald-400">{fmtLarge(r.totalEquity)}</td>
                              <td className="py-1.5 text-right font-mono text-slate-200">{fmtLarge(r.cash)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {d.cashflow.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">Cash Flow Statement (Annual)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] text-slate-500">
                            <th className="py-1.5 pr-4 text-left">Year</th>
                            <th className="py-1.5 pr-4 text-right">Operating CF</th>
                            <th className="py-1.5 pr-4 text-right">CapEx</th>
                            <th className="py-1.5 text-right">Free CF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.cashflow.map((r) => (
                            <tr key={r.date} className="border-b border-white/[0.04]">
                              <td className="py-1.5 pr-4 text-slate-400">{r.date.slice(0, 4)}</td>
                              <td className={`py-1.5 pr-4 text-right font-mono ${r.operatingCashflow >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtLarge(r.operatingCashflow)}</td>
                              <td className="py-1.5 pr-4 text-right font-mono text-slate-400">{fmtLarge(r.capitalExpenditures)}</td>
                              <td className={`py-1.5 text-right font-mono ${r.freeCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtLarge(r.freeCashFlow)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Compare Mode ─────────────────────────────────────────────────────────────

function CompareBar({
  tickers,
  quotes,
  onAdd,
  onRemove,
}: {
  tickers: string[];
  quotes: Record<string, BatchQuote>;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
}) {
  const [q, setQ] = useState("");

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-cyan-400">Compare Mode</span>
        <span className="text-xs text-slate-500">Select up to 4 securities</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tickers.map((t) => {
          const bq = quotes[t];
          return (
            <div key={t} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
              <span className="font-mono font-bold text-slate-200">{t}</span>
              {bq && (
                <>
                  <span className="font-mono text-slate-400">${fmt(bq.price)}</span>
                  {signBadge(bq.changePct)}
                </>
              )}
              <button onClick={() => onRemove(t)} className="ml-1 text-slate-600 hover:text-red-400">✕</button>
            </div>
          );
        })}
        {tickers.length < 4 && (
          <div className="flex items-center gap-1 rounded-lg border border-dashed border-white/10 px-3 py-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  onAdd(q.trim()); setQ("");
                }
              }}
              placeholder="Add ticker…"
              className="w-20 bg-transparent text-xs text-slate-400 outline-none placeholder:text-slate-700"
            />
          </div>
        )}
      </div>

      {tickers.length >= 2 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-slate-500">
                <th className="py-1.5 pr-4 text-left">Metric</th>
                {tickers.map((t) => (
                  <th key={t} className="py-1.5 pr-4 text-right font-mono text-slate-300">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Price",      fn: (q: BatchQuote) => `$${fmt(q.price)}` },
                { label: "Change %",   fn: (q: BatchQuote) => `${fmt(q.changePct, 2)}%` },
                { label: "Mkt Cap",    fn: (q: BatchQuote) => fmtLarge(q.mktCap) },
                { label: "P/E",        fn: (q: BatchQuote) => q.pe ? fmt(q.pe, 1) : "—" },
                { label: "52wk High",  fn: (q: BatchQuote) => `$${fmt(q.fiftyTwoWeekHigh, 0)}` },
                { label: "52wk Low",   fn: (q: BatchQuote) => `$${fmt(q.fiftyTwoWeekLow, 0)}` },
                { label: "Volume",     fn: (q: BatchQuote) => fmtVol(q.volume) },
              ].map((row) => (
                <tr key={row.label} className="border-b border-white/[0.04]">
                  <td className="py-1.5 pr-4 text-slate-500">{row.label}</td>
                  {tickers.map((t) => (
                    <td key={t} className="py-1.5 pr-4 text-right font-mono text-slate-200">
                      {quotes[t] ? row.fn(quotes[t]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

const WL_KEY = "universe_watchlist";
function loadWatchlist(): string[] {
  try { return JSON.parse(localStorage.getItem(WL_KEY) ?? "[]"); } catch { return []; }
}
function saveWatchlist(list: string[]) {
  try { localStorage.setItem(WL_KEY, JSON.stringify(list)); } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ViewMode = "grid" | "watchlist" | "compare";

export default function InvestmentUniverse({ snapshot }: { snapshot: Snapshot | null }) {
  const [viewMode, setViewMode]         = useState<ViewMode>("grid");
  const [filterClass, setFilterClass]   = useState<AssetClass | "All">("All");
  const [filterSector, setFilterSector] = useState<GICSsector | "All">("All");
  const [filterRegion, setFilterRegion] = useState<"All" | "US" | "Global" | "EM">("All");
  const [search, setSearch]             = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [batchQuotes, setBatchQuotes]   = useState<Record<string, BatchQuote>>({});
  const [watchlist, setWatchlist]       = useState<string[]>([]);
  const [compareTickers, setCompareTickers] = useState<string[]>([]);

  // Portfolio ticker set for "HELD" badges
  const portfolioTickers = useMemo(
    () => new Set((snapshot?.positions ?? []).map((p) => p.symbol.trim().toUpperCase())),
    [snapshot],
  );

  // Load watchlist from localStorage on mount
  useEffect(() => { setWatchlist(loadWatchlist()); }, []);

  // Fetch batch quotes for all seed tickers on mount
  useEffect(() => {
    const tickers = UNIVERSE_SEEDS.map((s) => s.ticker).join(",");
    fetch(`/api/universe/batch?symbols=${tickers}`)
      .then((r) => r.json())
      .then((d: { quotes?: BatchQuote[] }) => {
        const map: Record<string, BatchQuote> = {};
        for (const q of d.quotes ?? []) map[q.ticker] = q;
        setBatchQuotes(map);
      })
      .catch(() => {});
  }, []);

  // Re-fetch batch quotes when watchlist or compare changes
  useEffect(() => {
    const extra = [...watchlist, ...compareTickers].filter(
      (t) => !batchQuotes[t] && !UNIVERSE_SEEDS.find((s) => s.ticker === t),
    );
    if (!extra.length) return;
    fetch(`/api/universe/batch?symbols=${extra.join(",")}`)
      .then((r) => r.json())
      .then((d: { quotes?: BatchQuote[] }) => {
        const map: Record<string, BatchQuote> = {};
        for (const q of d.quotes ?? []) map[q.ticker] = q;
        setBatchQuotes((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
  }, [watchlist, compareTickers]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleWatchlist = (ticker: string) => {
    const next = watchlist.includes(ticker)
      ? watchlist.filter((t) => t !== ticker)
      : [...watchlist, ticker];
    setWatchlist(next);
    saveWatchlist(next);
  };

  // Filtered seeds
  const filteredSeeds = useMemo(() => {
    const q = search.toLowerCase();
    return UNIVERSE_SEEDS.filter((s) => {
      if (filterClass !== "All" && s.assetClass !== filterClass) return false;
      if (filterSector !== "All" && s.sector !== filterSector) return false;
      if (filterRegion !== "All") {
        if (filterRegion === "Global" && s.region !== "Global") return false;
        if (filterRegion === "EM" && s.region !== "EM") return false;
        if (filterRegion === "US" && s.region !== "US") return false;
      }
      if (q && !s.ticker.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q) && !s.tags.some((t) => t.includes(q))) return false;
      return true;
    });
  }, [filterClass, filterSector, filterRegion, search]);

  // Seeds shown in watchlist view
  const watchlistSeeds = useMemo(() => {
    const seedMap = new Map(UNIVERSE_SEEDS.map((s) => [s.ticker, s]));
    return watchlist.map((t) => seedMap.get(t) ?? { ticker: t, name: t, assetClass: "Equity" as AssetClass, sector: "Multi-Sector" as GICSsector, region: "US" as const, tags: [] });
  }, [watchlist]);

  const assetClasses: (AssetClass | "All")[] = ["All", "Equity", "ETF", "Crypto", "Fixed Income", "Commodity", "Macro / FX"];
  const regions: ("All" | "US" | "Global" | "EM")[] = ["All", "US", "Global", "EM"];

  const displaySeeds = viewMode === "watchlist" ? watchlistSeeds : filteredSeeds;

  return (
    <div className="relative px-4 py-4 sm:px-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Investment Universe</h1>
          <p className="text-xs text-slate-500">{UNIVERSE_SEEDS.length} securities · live prices · full fundamental detail</p>
        </div>
        <SearchBar onSelect={(t) => setSelectedTicker(t)} />
      </div>

      {/* ── View mode + filters ──────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* View mode toggle */}
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          {(["grid", "watchlist", "compare"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                viewMode === m ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {m === "watchlist" ? `Watchlist (${watchlist.length})` : m === "compare" ? `Compare (${compareTickers.length})` : "Browse"}
            </button>
          ))}
        </div>

        {/* Filters */}
        {viewMode === "grid" && (
          <div className="flex flex-wrap gap-2">
            {/* Search within grid */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter…"
              className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50 w-28"
            />
            {/* Asset class */}
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value as AssetClass | "All")}
              className="rounded-md border border-white/10 bg-[#070c17] px-2 py-1 text-xs text-slate-300 outline-none"
            >
              {assetClasses.map((c) => <option key={c} value={c}>{c === "All" ? "All Classes" : c}</option>)}
            </select>
            {/* Region */}
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value as typeof filterRegion)}
              className="rounded-md border border-white/10 bg-[#070c17] px-2 py-1 text-xs text-slate-300 outline-none"
            >
              {regions.map((r) => <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Compare bar ─────────────────────────────────────────────────────── */}
      {viewMode === "compare" && (
        <div className="mb-4">
          <CompareBar
            tickers={compareTickers}
            quotes={batchQuotes}
            onAdd={(t) => {
              if (!compareTickers.includes(t) && compareTickers.length < 4)
                setCompareTickers((p) => [...p, t]);
            }}
            onRemove={(t) => setCompareTickers((p) => p.filter((x) => x !== t))}
          />
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      {viewMode !== "compare" && displaySeeds.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-slate-600">
          {viewMode === "watchlist" ? "Your watchlist is empty. Star securities from the Browse tab." : "No securities match your filters."}
        </div>
      )}

      {viewMode !== "compare" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displaySeeds.map((seed) => (
            <div key={seed.ticker} className="relative">
              <SecurityCard
                seed={seed}
                quote={batchQuotes[seed.ticker]}
                onClick={() => setSelectedTicker(seed.ticker)}
                isSelected={selectedTicker === seed.ticker}
                inPortfolio={portfolioTickers.has(seed.ticker.toUpperCase())}
              />
              {/* Watchlist star */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleWatchlist(seed.ticker); }}
                className={`absolute right-3 bottom-3 text-sm transition ${
                  watchlist.includes(seed.ticker) ? "text-yellow-400" : "text-slate-700 hover:text-yellow-400"
                }`}
                title={watchlist.includes(seed.ticker) ? "Remove from watchlist" : "Add to watchlist"}
              >
                ★
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail panel (slide-in overlay) ─────────────────────────────────── */}
      {selectedTicker && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSelectedTicker(null)}
          />
          <SecurityDetailPanel
            ticker={selectedTicker}
            portfolioTickers={portfolioTickers}
            onClose={() => setSelectedTicker(null)}
          />
        </>
      )}
    </div>
  );
}
