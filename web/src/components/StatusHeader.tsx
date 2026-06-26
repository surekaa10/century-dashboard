"use client";

import type { Snapshot } from "@/lib/types";
import { agoLabel } from "@/lib/format";
import ThemeToggle from "./ThemeToggle";

export default function StatusHeader({
  snapshot,
  ageSeconds,
}: {
  snapshot: Snapshot | null;
  ageSeconds: number | null;
}) {
  const connected = Boolean(snapshot?.ok && snapshot?.account);
  const stale = ageSeconds !== null && ageSeconds > 300;
  const acct = snapshot?.account;

  let sub = "Connecting…";
  if (connected && ageSeconds !== null) {
    sub = `Snapshot · updated ${agoLabel(ageSeconds)}${stale ? " · ⚠ STALE" : ""}`;
  } else if (snapshot && !connected) {
    sub = snapshot.error || "No data";
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b border-cyan-500/10 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            Century Research
          </div>
          <div className="truncate font-mono text-[11px] text-slate-400 sm:text-xs">{sub}</div>
        </div>
        <a
          href="https://apex-platform-steel.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex shrink-0 items-center gap-1.5 rounded-md border border-sky-500/25 bg-sky-500/8 px-2.5 py-1.5 transition hover:border-sky-400/50 hover:bg-sky-500/15"
          title="Open Research Ballot"
        >
          <svg width="12" height="12" viewBox="0 0 32 32" className="shrink-0 opacity-70 group-hover:opacity-100">
            <polygon points="16,2 30,28 2,28" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="3.5" fill="#38bdf8" />
          </svg>
          <span className="font-mono text-[10px] font-semibold tracking-wider text-sky-400 group-hover:text-sky-300">
            BALLOT
          </span>
        </a>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <span className="hidden font-mono text-xs text-slate-500 lg:inline">
          {new Date().toLocaleString()}
        </span>
        <ThemeToggle />
        {connected && !stale ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="hidden sm:inline">{acct ? `CONNECTED · ${acct.server}` : "CONNECTED"}</span>
            <span className="sm:hidden">LIVE</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            {stale ? "STALE" : "OFFLINE"}
          </span>
        )}
      </div>
    </header>
  );
}
