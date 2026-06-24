"use client";

import type { ReactNode } from "react";

export function Section({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-slate-200">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  valueClass = "text-slate-100",
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${valueClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 ${className}`}>
      {children}
    </div>
  );
}
