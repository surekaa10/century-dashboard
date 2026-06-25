"use client";

import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { buildIntelligence, type Category, type Severity, type Insight } from "@/lib/intelligence";
import type { Benchmark } from "@/lib/analytics";

type Raw = Record<string, { dates: string[]; close: number[] }>;

const CAT_LABEL: Record<Category, string> = { risk: "Risk", performance: "Performance", concentration: "Concentration", diversification: "Diversification", factor: "Factor", exposure: "Exposure", drawdown: "Drawdown", stress: "Stress", warning: "Warning", opportunity: "Opportunity", trend: "Trend", recommendation: "Recommendation" };
const SEV_STYLE: Record<Severity, string> = { critical: "border-rose-500/40 bg-rose-500/15 text-rose-300", high: "border-orange-500/40 bg-orange-500/15 text-orange-300", medium: "border-amber-500/30 bg-amber-500/10 text-amber-300", low: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300" };
const SEV_DOT: Record<Severity, string> = { critical: "#f43f5e", high: "#fb923c", medium: "#fbbf24", low: "#22d3ee" };

export default function PortfolioIntelligence({ snapshot }: { snapshot: Snapshot }) {
  const [benchmark, setBenchmark] = useState<Benchmark | undefined>();
  const [factorRaw, setFactorRaw] = useState<Raw | undefined>();
  const [cat, setCat] = useState<Category | "all">("all");
  const [sev, setSev] = useState<Severity | "all">("all");
  const [q, setQ] = useState("");
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/benchmark", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive && b?.dates?.length) setBenchmark({ dates: b.dates, close: b.close }); }).catch(() => {});
    fetch("/api/factors", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (alive && j?.SPY) setFactorRaw(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const intel = useMemo(() => buildIntelligence(snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark, factorRaw), [snapshot.account, snapshot.positions, snapshot.symbolRates, benchmark, factorRaw]);

  const cats = useMemo(() => [...new Set(intel.insights.map((i) => i.category))], [intel.insights]);
  const filtered = useMemo(() => {
    const f = intel.insights.filter((i) =>
      (cat === "all" || i.category === cat) && (sev === "all" || i.severity === sev) &&
      (q === "" || (i.headline + i.detail).toLowerCase().includes(q.toLowerCase())));
    return [...f].sort((a, b) => (pinned.has(b.id) ? 1 : 0) - (pinned.has(a.id) ? 1 : 0));
  }, [intel.insights, cat, sev, q, pinned]);

  if (!intel.ok) return <div className="px-6 py-10 text-center text-slate-500">Insufficient data to generate portfolio intelligence.</div>;

  const statusUI = intel.status === "healthy" ? { color: "#10b981", t: "Healthy", c: "text-emerald-400" } : intel.status === "watchlist" ? { color: "#fbbf24", t: "Watchlist", c: "text-amber-400" } : { color: "#f43f5e", t: "Elevated Risk", c: "text-rose-400" };

  const copy = (text: string, id: string) => { navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1200); };
  const copyAll = () => copy(intel.brief + "\n\n" + intel.insights.map((i) => `[${i.severity.toUpperCase()}] ${i.headline} — ${i.detail}`).join("\n"), "all");

  return (
    <div className="px-6 pb-10">
      {/* status header */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/10 bg-gradient-to-b from-white/[0.03] to-transparent p-4">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: statusUI.color, boxShadow: `0 0 10px ${statusUI.color}66` }} />
          <div>
            <div className={`text-lg font-semibold ${statusUI.c}`}>{statusUI.t}</div>
            <div className="text-[11px] text-slate-500">Updated {new Date().toLocaleTimeString()} · auto-refresh on data update</div>
          </div>
        </div>
        <div className="flex gap-3 text-center">
          <Stat label="Active Insights" v={String(intel.nActive)} />
          <Stat label="High Priority" v={String(intel.nHighPriority)} cls={intel.nHighPriority ? "text-rose-400" : "text-slate-100"} />
          <Stat label="Health Score" v={`${intel.healthScore.toFixed(0)}`} />
        </div>
      </div>

      {/* daily brief */}
      <div className="mt-4 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.03] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/70">Executive Daily Brief</span>
          <div className="flex gap-2">
            <button onClick={() => copy(intel.brief, "brief")} className="rounded border border-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10">{copied === "brief" ? "Copied" : "Copy"}</button>
            <button onClick={() => window.print()} className="rounded border border-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/10">Export PDF</button>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-200">{intel.brief}</p>
      </div>

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setCat("all")} className={`rounded-full px-3 py-1 text-xs ${cat === "all" ? "bg-cyan-500/20 text-cyan-300" : "border border-white/10 text-slate-400 hover:text-slate-200"}`}>All ({intel.insights.length})</button>
        {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs ${cat === c ? "bg-cyan-500/20 text-cyan-300" : "border border-white/10 text-slate-400 hover:text-slate-200"}`}>{CAT_LABEL[c]}</button>)}
        <div className="ml-auto flex items-center gap-2">
          {(["all", "critical", "high", "medium", "low"] as const).map((s) => <button key={s} onClick={() => setSev(s)} className={`rounded px-2 py-1 text-[11px] capitalize ${sev === s ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>{s}</button>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40 rounded border border-cyan-500/15 bg-black/20 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40" />
          <button onClick={copyAll} className="rounded border border-cyan-500/20 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/10">{copied === "all" ? "Copied" : "Copy all"}</button>
        </div>
      </div>

      {/* feed */}
      <div className="mt-4 space-y-2">
        {filtered.map((i) => <Card key={i.id} i={i} pinned={pinned.has(i.id)} onPin={() => setPinned((p) => { const n = new Set(p); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} onCopy={() => copy(`${i.headline} — ${i.detail}`, i.id)} copied={copied === i.id} />)}
        {filtered.length === 0 && <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-8 text-center text-slate-500">No insights match the current filters.</div>}
      </div>
    </div>
  );
}

function Stat({ label, v, cls = "text-slate-100" }: { label: string; v: string; cls?: string }) {
  return <div className="rounded-lg bg-white/[0.02] px-3 py-1.5"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className={`font-mono text-lg font-semibold ${cls}`}>{v}</div></div>;
}

function Card({ i, pinned, onPin, onCopy, copied }: { i: Insight; pinned: boolean; onPin: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.012] p-3" style={{ borderLeftColor: SEV_DOT[i.severity], borderLeftWidth: 3 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SEV_DOT[i.severity] }} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">{i.headline}</span>
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${SEV_STYLE[i.severity]}`}>{i.severity}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-600">{CAT_LABEL[i.category]} · {i.confidence}% conf · {i.section}</span>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-slate-300">{i.detail}</p>
            <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[11px] text-slate-500">
              {i.metrics.map((m, k) => <span key={k}>{m.label}: <span className="text-slate-300">{m.value}</span></span>)}
            </div>
            {i.action && <div className="mt-1.5 text-[11px] text-cyan-400/80">→ {i.action}</div>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button onClick={onPin} title="Pin" className={`rounded px-1.5 py-0.5 text-xs ${pinned ? "text-amber-400" : "text-slate-600 hover:text-slate-300"}`}>{pinned ? "★" : "☆"}</button>
          <button onClick={onCopy} title="Copy" className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300">{copied ? "✓" : "⧉"}</button>
        </div>
      </div>
    </div>
  );
}
