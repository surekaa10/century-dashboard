"use client";

import type { Snapshot } from "@/lib/types";
import { agoLabel } from "@/lib/format";

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
    <header className="flex items-center justify-between border-b border-cyan-500/10 px-6 py-4">
      <div>
        <div className="text-lg font-semibold tracking-tight text-slate-100">
          Century Research
        </div>
        <div className="font-mono text-xs text-slate-400">{sub}</div>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono text-xs text-slate-500">
          {new Date().toLocaleString()}
        </span>
        {connected && !stale ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {acct ? `CONNECTED · ${acct.server}` : "CONNECTED"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            {stale ? "STALE" : "DISCONNECTED"}
          </span>
        )}
      </div>
    </header>
  );
}
