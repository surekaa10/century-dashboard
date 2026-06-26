"use client";

import { Fragment, useEffect, useState } from "react";

interface BallotIdea {
  id: string;
  ticker: string;
  dir: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  hold: string;
  posSize: number;
  conv: number;
  expRet: number;
  rr: number;
  finalScore: number;
  totalCredits: number;
  rank: number;
  approvalStatus: "APPROVED" | "PENDING" | "REVIEW";
  thesis: string;
  sector: string;
}

interface BallotData {
  weekId: string;
  generatedAt: string;
  totalMarketCredits: number;
  ideasCount: number;
  source: string;
  ideas: BallotIdea[];
}

function DirBadge({ dir }: { dir: string }) {
  const cls =
    dir === "LONG"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : "border-rose-500/30 bg-rose-500/10 text-rose-400";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider ${cls}`}>
      {dir}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : status === "PENDING"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-sky-500/30 bg-sky-500/10 text-sky-400";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

function ConvBars({ conv }: { conv: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-1.5 rounded-sm ${i < conv ? "bg-cyan-400/70" : "bg-slate-700/50"}`}
        />
      ))}
    </div>
  );
}

function CreditBar({ credits, max }: { credits: number; max: number }) {
  const pct = Math.min(100, (credits / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-700/50">
        <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-slate-300">{credits.toLocaleString()}</span>
    </div>
  );
}

function ScoreCell({ score }: { score: number }) {
  const cls =
    score >= 85 ? "text-emerald-400" : score >= 70 ? "text-cyan-400" : "text-slate-400";
  return <span className={`font-mono text-[13px] font-semibold ${cls}`}>{score.toFixed(1)}</span>;
}

const COLS = ["Rank", "Ticker", "Dir", "Sector", "Entry", "Target", "Stop", "Exp Ret", "R:R", "Conv", "Credits", "Score", "Status"];

export default function ResearchBallot() {
  const [data, setData] = useState<BallotData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ballot", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: BallotData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 font-mono text-xs text-slate-500">
        Loading ballot…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 font-mono text-xs text-rose-400">
        Failed to load ballot data
      </div>
    );
  }

  const maxCredits = data.ideas[0]?.totalCredits ?? 1;
  const approved = data.ideas.filter((i) => i.approvalStatus === "APPROVED").length;
  const totalExpRet = (
    data.ideas.filter((i) => i.approvalStatus === "APPROVED").reduce((a, i) => a + i.expRet * i.posSize, 0) /
    data.ideas.filter((i) => i.approvalStatus === "APPROVED").reduce((a, i) => a + i.posSize, 0)
  ).toFixed(1);

  return (
    <div className="space-y-4 px-6 py-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            Research Ballot · Prediction Market
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
            {data.weekId} · {data.ideasCount} ideas · {data.totalMarketCredits.toLocaleString()} credits cast · {approved} approved
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-cyan-500/10 bg-white/[0.012] px-3 py-1.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Wtd Exp Ret (approved)</div>
            <div className="font-mono text-sm font-semibold text-emerald-400">+{totalExpRet}%</div>
          </div>
          <a
            href={data.source}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/8 px-3 py-1.5 font-mono text-[11px] font-semibold text-sky-400 transition hover:border-sky-400/50 hover:bg-sky-500/15 hover:text-sky-300"
          >
            <svg width="10" height="10" viewBox="0 0 32 32" className="shrink-0">
              <polygon points="16,2 30,28 2,28" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
              <circle cx="16" cy="16" r="3.5" fill="#38bdf8" />
            </svg>
            Open APEX Platform
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-cyan-500/10 bg-white/[0.012]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cyan-500/10">
              {COLS.map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.ideas.map((idea) => (
              <Fragment key={idea.id}>
                <tr
                  className={`cursor-pointer border-b border-cyan-500/5 transition hover:bg-cyan-500/5 ${
                    expanded === idea.id ? "bg-cyan-500/5" : ""
                  }`}
                  onClick={() => setExpanded(expanded === idea.id ? null : idea.id)}
                >
                  <td className="px-3 py-2.5 font-mono text-[13px] font-bold text-slate-500">
                    #{idea.rank}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-sm font-bold text-slate-100">
                    {idea.ticker}
                  </td>
                  <td className="px-3 py-2.5">
                    <DirBadge dir={idea.dir} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                    {idea.sector}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-slate-300">
                    {idea.entry.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-emerald-400">
                    {idea.target.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-rose-400">
                    {idea.stop.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-[12px] font-semibold ${idea.dir === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>
                    {idea.dir === "SHORT" ? "-" : "+"}{idea.expRet.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-slate-300">
                    {idea.rr.toFixed(2)}x
                  </td>
                  <td className="px-3 py-2.5">
                    <ConvBars conv={idea.conv} />
                  </td>
                  <td className="px-3 py-2.5">
                    <CreditBar credits={idea.totalCredits} max={maxCredits} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreCell score={idea.finalScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={idea.approvalStatus} />
                  </td>
                </tr>

                {expanded === idea.id && (
                  <tr className="border-b border-cyan-500/10 bg-slate-900/40">
                    <td colSpan={13} className="px-5 py-3">
                      <div className="flex flex-wrap items-start gap-6">
                        <div className="flex-1 min-w-[200px]">
                          <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Thesis
                          </div>
                          <div className="font-mono text-xs leading-relaxed text-slate-300">
                            {idea.thesis}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 shrink-0">
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Hold</div>
                            <div className="mt-0.5 font-mono text-xs text-slate-200">{idea.hold}</div>
                          </div>
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Pos Size</div>
                            <div className="mt-0.5 font-mono text-xs text-slate-200">{idea.posSize}%</div>
                          </div>
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Conviction</div>
                            <div className="mt-0.5 font-mono text-xs text-cyan-300">{idea.conv}/10</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-right font-mono text-[10px] text-slate-600">
        Sourced from APEX Research Platform · {data.weekId} · click any row to expand thesis · Score = 40% PM + 25% Skill + 20% R/R + 15% Quant
      </div>
    </div>
  );
}
