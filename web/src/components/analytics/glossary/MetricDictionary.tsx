"use client";

import { useMemo, useState } from "react";
import { GLOSSARY_LIST, searchMetrics } from "@/lib/metricsGlossary";
import type { MetricInfo, Tone } from "@/lib/metricsGlossary";
import { MetricModal } from "@/components/common/InfoIcon";
import { Section } from "../ui";

const TONE: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export default function MetricDictionary() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<MetricInfo | null>(null);
  const [cat, setCat] = useState<string>("All");

  const categories = useMemo(() => ["All", ...Array.from(new Set(GLOSSARY_LIST.map((m) => m.category)))], []);
  const results = useMemo(() => {
    const base = searchMetrics(q);
    return cat === "All" ? base : base.filter((m) => m.category === cat);
  }, [q, cat]);

  return (
    <div className="px-6 pb-10">
      <Section title="Metric Dictionary" subtitle="Search any metric for its definition, formula, interpretation and a worked example — the dashboard, self-documented">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search metrics — e.g. Sharpe, VaR, Drawdown, HHI…"
            className="mb-3 w-full rounded-lg border border-white/10 bg-[#0d1321] px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  cat === c ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {results.map((m) => (
            <button
              key={m.key}
              onClick={() => setOpen(m)}
              className="flex flex-col rounded-lg border border-white/[0.06] bg-white/[0.012] p-3.5 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.025]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-100">{m.title}</span>
                <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">{m.category}</span>
              </div>
              <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-400">{m.description}</span>
              {m.formula && <code className="mt-2 truncate rounded bg-black/30 px-1.5 py-1 font-mono text-[10.5px] text-cyan-200/80">{m.formula.split("\n")[0]}</code>}
              {m.bands?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.bands.slice(0, 3).map((b) => (
                    <span key={b.range} className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${TONE[b.tone]}`}>{b.label}</span>
                  ))}
                </div>
              ) : null}
              <span className="mt-2 text-[11px] text-sky-400">View detail →</span>
            </button>
          ))}
          {!results.length && (
            <div className="col-span-full rounded-lg border border-white/[0.06] bg-white/[0.012] p-8 text-center text-sm text-slate-500">
              No metric matches “{q}”. Try a shorter term.
            </div>
          )}
        </div>
        <div className="mt-3 text-[11px] text-slate-600">{results.length} of {GLOSSARY_LIST.length} metrics</div>
      </Section>

      {open && <MetricModal info={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
