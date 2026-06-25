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
      <div className="min-w-0">
        <div className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
          Century Research
        </div>
        <div className="truncate font-mono text-[11px] text-slate-400 sm:text-xs">{sub}</div>
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
