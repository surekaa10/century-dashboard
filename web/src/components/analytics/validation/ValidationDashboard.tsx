"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@/lib/types";
import { runValidation } from "@/lib/validation";
import type { Finding, Severity, Category } from "@/lib/validation";
import { Section, StatCard } from "../ui";

const SEV: Record<Severity, { label: string; dot: string; text: string; bg: string; border: string }> = {
  pass: { label: "Passed", dot: "#10b981", text: "text-emerald-400", bg: "bg-emerald-500/[0.07]", border: "border-emerald-500/30" },
  info: { label: "Info", dot: "#38bdf8", text: "text-sky-400", bg: "bg-sky-500/[0.07]", border: "border-sky-500/30" },
  warning: { label: "Warning", dot: "#fbbf24", text: "text-amber-400", bg: "bg-amber-500/[0.07]", border: "border-amber-500/30" },
  critical: { label: "Failed", dot: "#f43f5e", text: "text-rose-400", bg: "bg-rose-500/[0.07]", border: "border-rose-500/30" },
};

export default function ValidationDashboard({ snapshot }: { snapshot: Snapshot }) {
  const report = useMemo(
    () => runValidation(snapshot, snapshot.generatedAt || ""),
    [snapshot],
  );
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const scoreColor = report.score >= 99 ? "#10b981" : report.score >= 95 ? "#fbbf24" : "#f43f5e";
  const arc = (v: number) => {
    const a = ((-90 + (v / 100) * 180) * Math.PI) / 180;
    return `${(100 + 80 * Math.cos(a)).toFixed(1)},${(100 + 80 * Math.sin(a)).toFixed(1)}`;
  };

  const shown = report.findings.filter((f) => filter === "all" || f.severity === filter);
  const auditTime = report.generatedAt ? report.generatedAt.replace("T", " ").slice(0, 19) + " UTC" : "—";

  return (
    <div className="px-6 pb-10">
      <Section title="Calculation Integrity" subtitle="Independent re-derivation & cross-validation of every metric — runs on each snapshot refresh">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Integrity Score" value={`${report.score.toFixed(2)}%`} valueClass={report.score >= 99 ? "text-emerald-400" : report.score >= 95 ? "text-amber-400" : "text-rose-400"} hint={report.critical ? "action required" : report.warnings ? "review warnings" : "all clear"} />
          <StatCard label="Metrics Checked" value={String(report.checked)} />
          <StatCard label="Passed" value={String(report.passed + report.info)} valueClass="text-emerald-400" />
          <StatCard label="Warnings" value={String(report.warnings)} valueClass={report.warnings ? "text-amber-400" : "text-slate-100"} />
          <StatCard label="Critical Errors" value={String(report.critical)} valueClass={report.critical ? "text-rose-400" : "text-emerald-400"} />
          <StatCard label="Last Audit" value={auditTime.slice(11)} hint={auditTime.slice(0, 10)} />
        </div>
      </Section>

      <Section title="Validation Overview">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* score gauge */}
          <div className="flex items-center gap-5 rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4">
            <svg width="180" height="112" viewBox="0 0 200 120">
              <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round" />
              <path d={`M20,100 A80,80 0 0,1 ${arc(report.score)}`} fill="none" stroke={scoreColor} strokeWidth="14" strokeLinecap="round" />
              <text x="100" y="92" textAnchor="middle" fontSize="30" fontFamily="monospace" fontWeight="700" fill="#e2e8f0">{report.score.toFixed(1)}</text>
              <text x="100" y="110" textAnchor="middle" fontSize="11" fill="#64748b">/ 100 integrity</text>
            </svg>
            <div className="text-xs">
              <div className="mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SEV.pass.dot }} /> {report.passed} passed</div>
              <div className="mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SEV.info.dot }} /> {report.info} informational</div>
              <div className="mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SEV.warning.dot }} /> {report.warnings} warnings</div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: SEV.critical.dot }} /> {report.critical} critical</div>
            </div>
          </div>

          {/* category heatmap */}
          <div className="rounded-xl border border-cyan-500/10 bg-white/[0.012] p-4 lg:col-span-2">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Error Heatmap — validation by category</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.byCategory.map((c) => {
                const s = SEV[c.worst];
                return (
                  <div key={c.category} className={`rounded-lg border ${s.border} ${s.bg} p-2.5`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-200">{c.category}</span>
                      <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-400">{c.passed}/{c.total} passed</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section title="AI Auditor Feed" subtitle="Prioritized observations from the integrity engine">
        <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4">
          <ul className="space-y-1.5">
            {report.observations.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span style={{ color: SEV[o.severity].dot }}>●</span>
                <span className={o.severity === "pass" ? "text-slate-300" : SEV[o.severity].text}>{o.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Metric Validation Table" subtitle="Click any row for the formula, inputs, calculation steps, and recommended fix">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "critical", "warning", "info", "pass"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === k ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-slate-400 hover:text-slate-200"
              }`}>
              {k === "all" ? `All (${report.findings.length})` : `${SEV[k as Severity].label} (${report.findings.filter((f) => f.severity === k).length})`}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02] text-[9px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Metric</th>
                <th className="px-3 py-2 text-left">Expected</th>
                <th className="px-3 py-2 text-left">Calculated</th>
                <th className="px-3 py-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <ExplainerRow key={f.id} f={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} />
              ))}
              {!shown.length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No checks in this category.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[10px] text-slate-600">
          Audit re-runs automatically on every snapshot refresh (positions, prices, recalculation). Checks marked
          MT5 Reconciliation compare against the captured MT5 snapshot — the authoritative source for this account.
        </div>
      </Section>
    </div>
  );
}

function ExplainerRow({ f, open, onToggle }: { f: Finding; open: boolean; onToggle: () => void }) {
  const s = SEV[f.severity];
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.02]">
        <td className="px-3 py-2"><span className={`inline-flex items-center gap-1.5 ${s.text}`}><span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />{s.label}</span></td>
        <td className="px-3 py-2 text-slate-400">{f.category}</td>
        <td className="px-3 py-2 text-slate-200">{f.metric}</td>
        <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{f.expected ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{f.actual ?? "—"}</td>
        <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-400">{f.diff ?? ""}</td>
      </tr>
      {open && (
        <tr className="border-t border-white/[0.04] bg-white/[0.015]">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Field label="Formula / Expected" value={f.expected ?? "—"} mono />
                <Field label="Calculated" value={f.actual ?? "—"} mono />
                {f.diff && <Field label="Difference" value={f.diff} mono />}
              </div>
              <div>
                <Field label="Explanation" value={f.message} />
                {f.fix && <Field label="Recommended Fix" value={f.fix} />}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-[12px] text-slate-300 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

// re-export the category type for any consumer convenience
export type { Category };
