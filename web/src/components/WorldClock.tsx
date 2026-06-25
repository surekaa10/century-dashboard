"use client";

import { useEffect, useState } from "react";

// Financial-hub world clock for the overview. Live local time plus each city's
// equity-market session status (green = open). Times use Intl with an explicit
// timeZone so they're correct regardless of where the dashboard is viewed.
interface ClockCfg {
  city: string;
  tz: string;
  abbr: string;
  market: { name: string; days: number[]; open: number; close: number }; // minutes from local midnight
}

const CLOCKS: ClockCfg[] = [
  // DFM trades Sun–Thu 10:00–15:00 GST
  { city: "Dubai", tz: "Asia/Dubai", abbr: "GST", market: { name: "DFM", days: [0, 1, 2, 3, 4], open: 10 * 60, close: 15 * 60 } },
  // NSE trades Mon–Fri 09:15–15:30 IST
  { city: "Mumbai", tz: "Asia/Kolkata", abbr: "IST", market: { name: "NSE", days: [1, 2, 3, 4, 5], open: 9 * 60 + 15, close: 15 * 60 + 30 } },
  // NYSE trades Mon–Fri 09:30–16:00 ET
  { city: "New York", tz: "America/New_York", abbr: "ET", market: { name: "NYSE", days: [1, 2, 3, 4, 5], open: 9 * 60 + 30, close: 16 * 60 } },
];

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parts(tz: string, ms: number) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(ms);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const hh = get("hour") === "24" ? "00" : get("hour");
  return { weekday: get("weekday"), hh, mm: get("minute"), ss: get("second") };
}
function dateLabel(tz: string, ms: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "2-digit", month: "short" }).format(ms);
}

export default function WorldClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setTimeout(tick, 0);          // populate immediately (deferred, not during render)
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, []);

  return (
    <div className="px-6 pt-4">
      <div className="flex flex-wrap items-stretch gap-3">
        {CLOCKS.map((c) => {
          const t = now ? parts(c.tz, now) : { weekday: "", hh: "--", mm: "--", ss: "--" };
          const mins = now ? (+t.hh) * 60 + (+t.mm) : -1;
          const wd = WD[t.weekday] ?? -1;
          const open = now > 0 && c.market.days.includes(wd) && mins >= c.market.open && mins < c.market.close;
          return (
            <div key={c.city} className="flex min-w-[150px] flex-1 items-center gap-3 rounded-xl border border-cyan-500/10 bg-white/[0.012] px-4 py-2.5">
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {c.city} <span className="text-slate-600">{c.abbr}</span>
                </div>
                <div className="font-mono text-xl font-semibold tabular-nums text-slate-100">
                  {t.hh}:{t.mm}<span className="text-sm text-slate-500">:{t.ss}</span>
                </div>
                <div className="text-[10px] text-slate-600">{now ? dateLabel(c.tz, now) : "—"}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                  open ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-500/30 bg-slate-500/10 text-slate-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-emerald-400" : "bg-slate-500"}`} style={open ? { boxShadow: "0 0 6px #34d399" } : undefined} />
                  {c.market.name}
                </span>
                <span className="text-[9px] text-slate-600">{open ? "Open" : "Closed"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
