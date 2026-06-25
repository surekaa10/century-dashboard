"use client";

import type { ReactNode } from "react";
import { InfoIcon } from "@/components/common/InfoIcon";

export function Section({
  title,
  subtitle,
  children,
  right,
  info,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
  info?: string; // glossary key — renders an info icon next to the title
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-slate-200">
            {title}
            {info && <InfoIcon metric={info} label={title} />}
          </h2>
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
  info,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  info?: string; // glossary key — renders an info icon next to the label
}) {
  return (
    <div className="rounded-lg border border-cyan-500/10 bg-white/[0.012] px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
        {info && <InfoIcon metric={info} label={label} size={11} />}
      </div>
      <div className={`mt-1 font-mono text-base font-semibold ${valueClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

export function Sparkline({ data, color, width = 92, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  const pts = data.filter((d) => Number.isFinite(d));
  if (pts.length < 2) return <div style={{ height }} />;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const range = hi - lo || 1;
  const step = width / (pts.length - 1);
  const path = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((v - lo) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={width} cy={(height - ((pts[pts.length - 1] - lo) / range) * height).toFixed(1)} r={1.8} fill={color} />
    </svg>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-cyan-500/10 bg-white/[0.012] p-4 ${className}`}>
      {children}
    </div>
  );
}
