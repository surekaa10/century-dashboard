"use client";

import { useEffect, useRef, useState } from "react";
import { getMetric } from "@/lib/metricsGlossary";
import type { MetricInfo, Tone } from "@/lib/metricsGlossary";

const TONE: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

// Subtle, discoverable info affordance. Hover/focus → tooltip (description, why,
// formula, interpretation + Learn More). Click / Enter → full detail modal.
export function InfoIcon({ metric, label, size = 13 }: { metric: string; label?: string; size?: number }) {
  const info = getMetric(metric);
  const ref = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [modal, setModal] = useState(false);
  if (!info) return null;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setTip({ x: r.left + r.width / 2, y: r.bottom + 8 });
  };
  const hide = () => setTip(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`About ${label ?? info.title}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.stopPropagation(); setModal(true); hide(); }}
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-500/40 text-slate-500 transition hover:border-cyan-400/70 hover:text-cyan-300 focus:border-cyan-400 focus:text-cyan-300 focus:outline-none"
        style={{ width: size + 3, height: size + 3, fontSize: size - 3, lineHeight: 1, verticalAlign: "middle" }}
      >
        <span style={{ fontStyle: "italic", fontFamily: "Georgia, serif", fontWeight: 700 }}>i</span>
      </button>

      {tip && <Tooltip info={info} x={tip.x} y={tip.y} onLearnMore={() => { setModal(true); hide(); }} />}
      {modal && <MetricModal info={info} onClose={() => setModal(false)} />}
    </>
  );
}

function Bands({ info }: { info: MetricInfo }) {
  if (!info.bands?.length) return info.interpretation ? <div className="text-[11px] text-slate-300">{info.interpretation}</div> : null;
  return (
    <div className="flex flex-col gap-1">
      {info.bands.map((b) => (
        <div key={b.range} className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${TONE[b.tone]}`}>{b.label}</span>
          <span className="font-mono text-[10px] text-slate-400">{b.range}</span>
        </div>
      ))}
    </div>
  );
}

function Tooltip({ info, x, y, onLearnMore }: { info: MetricInfo; x: number; y: number; onLearnMore: () => void }) {
  const W = 340;
  const left = typeof window !== "undefined" ? Math.min(Math.max(8, x - W / 2), window.innerWidth - W - 8) : x;
  return (
    <div
      className="info-tt dark-surface"
      style={{
        position: "fixed", left, top: y, zIndex: 60, width: W, maxWidth: "calc(100vw - 16px)",
        background: "#111827", border: "1px solid #3B82F6", borderRadius: 10, padding: "12px 14px",
        boxShadow: "0 18px 44px rgba(0,0,0,0.6), 0 0 16px rgba(59,130,246,0.25)", pointerEvents: "auto",
      }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="mb-1 text-[13px] font-bold text-white">{info.title}</div>
      <div className="text-[11.5px] leading-snug text-slate-300">{info.description}</div>

      <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Why it matters</div>
      <div className="text-[11.5px] leading-snug text-slate-300">{info.why}</div>

      {info.formula && (
        <>
          <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Formula</div>
          <pre className="mt-0.5 whitespace-pre-wrap rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-cyan-200">{info.formula}</pre>
        </>
      )}

      {(info.bands?.length || info.interpretation) && (
        <>
          <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Interpretation</div>
          <div className="mt-0.5"><Bands info={info} /></div>
        </>
      )}

      <button
        onClick={onLearnMore}
        className="mt-2.5 text-[11px] font-medium text-sky-400 hover:text-sky-300"
      >
        📖 Learn more
      </button>
    </div>
  );
}

export function MetricModal({ info, onClose }: { info: MetricInfo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(2,6,16,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="info-tt dark-surface w-full max-w-lg overflow-y-auto rounded-xl"
        style={{ maxHeight: "85vh", background: "#111827", border: "1px solid #3B82F6", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-3.5">
          <div>
            <div className="text-base font-bold text-white">{info.title}</div>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{info.category}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <Block label="Definition">{info.description}</Block>
          <Block label="Why it matters">{info.why}</Block>
          {info.formula && (
            <div>
              <Lbl>Formula</Lbl>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-black/40 px-3 py-2 font-mono text-[12px] text-cyan-200">{info.formula}</pre>
            </div>
          )}
          {(info.bands?.length || info.interpretation) && (
            <div><Lbl>Interpretation</Lbl><div className="mt-1"><Bands info={info} /></div></div>
          )}
          {info.benchmark && <Block label="Institutional benchmark">{info.benchmark}</Block>}
          {info.example && <Block label="Worked example">{info.example}</Block>}
          {info.mistakes && <Block label="Common mistakes">{info.mistakes}</Block>}
          {info.related?.length ? (
            <div>
              <Lbl>Related metrics</Lbl>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {info.related.map((k) => {
                  const r = getMetric(k);
                  return r ? <span key={k} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300">{r.title}</span> : null;
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{children}</div>;
}
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}
