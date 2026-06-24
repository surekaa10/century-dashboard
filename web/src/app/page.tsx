"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/types";
import StatusHeader from "@/components/StatusHeader";
import KpiStrip from "@/components/KpiStrip";
import PositionsTable from "@/components/PositionsTable";
import EquityCurve from "@/components/EquityCurve";
import AllocationDonut from "@/components/AllocationDonut";

const POLL_MS = 30_000;

export default function Page() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        const data = (await res.json()) as Snapshot;
        if (alive) setSnapshot(data);
      } catch {
        if (alive)
          setSnapshot({
            ok: false,
            error: "Network error",
            generatedAt: "",
            account: null,
            positions: [],
            deals: [],
            todayRealized: 0,
          });
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const ageSeconds = snapshot?.generatedAt
    ? Math.max(0, (now - new Date(snapshot.generatedAt).getTime()) / 1000)
    : null;

  const account = snapshot?.account ?? null;

  return (
    <main className="min-h-screen bg-[#060a14] text-slate-200">
      <StatusHeader snapshot={snapshot} ageSeconds={ageSeconds} />

      {account ? (
        <>
          <KpiStrip
            account={account}
            positions={snapshot!.positions}
            todayRealized={snapshot!.todayRealized}
          />
          <div className="grid grid-cols-1 gap-4 px-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EquityCurve deals={snapshot!.deals} currentEquity={account.equity} />
            </div>
            <AllocationDonut positions={snapshot!.positions} />
          </div>
          <div className="px-6 py-4">
            <PositionsTable positions={snapshot!.positions} />
          </div>
          <footer className="px-6 py-6 text-center font-mono text-[11px] text-slate-600">
            Century Research · reads snapshot.json · auto-refresh 30s
          </footer>
        </>
      ) : (
        <div className="flex h-[60vh] items-center justify-center px-6">
          <div className="max-w-lg rounded-lg border border-rose-500/20 bg-rose-500/5 p-6 text-center">
            <div className="mb-2 text-sm font-semibold text-rose-300">
              {snapshot ? "Could not load snapshot" : "Loading…"}
            </div>
            {snapshot?.error && (
              <div className="font-mono text-xs text-slate-400">{snapshot.error}</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
