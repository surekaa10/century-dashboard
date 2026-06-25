// Port of portfolio_overview.build_equity_from_deals: reconstruct the daily
// equity curve from the MT5 deal ledger. Each deal contributes
// profit + commission + swap; the running cumulative sum is the realized
// balance, forward-filled across non-trading days, with the final point
// anchored to current equity (so open floating P&L shows at the right edge).

import type { Deal } from "./types";

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

const dayKey = (iso: string): string => iso.slice(0, 10);

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function buildEquityFromDeals(deals: Deal[], currentEquity: number): EquityPoint[] {
  if (!deals.length) return [];

  const sorted = [...deals].sort((a, b) => a.time.localeCompare(b.time));

  // running cumulative net, take the last running value per calendar day
  let running = 0;
  const lastByDay = new Map<string, number>();
  for (const d of sorted) {
    running += d.profit + d.commission + d.swap;
    lastByDay.set(dayKey(d.time), running);
  }

  const firstDay = dayKey(sorted[0].time);
  const today = new Date().toISOString().slice(0, 10);

  // forward-fill from inception to today
  const out: EquityPoint[] = [];
  let cursor = new Date(firstDay + "T00:00:00Z");
  const end = new Date(today + "T00:00:00Z");
  let carry = lastByDay.get(firstDay) ?? 0;

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (lastByDay.has(key)) carry = lastByDay.get(key)!;
    out.push({ date: key, value: carry });
    cursor = addDays(cursor, 1);
  }

  // anchor the final point to current equity (includes open unrealized P&L)
  if (out.length) out[out.length - 1].value = currentEquity;
  return out;
}

const PERIOD_DAYS: Record<string, number> = {
  "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, All: 99999,
};

// Returns today's and yesterday's P&L in Eastern Time by diffing the equity curve.
export function buildDailyPnlET(
  deals: import("./types").Deal[],
  currentEquity: number,
): { todayPnl: number; yesterdayPnl: number; yesterdayDate: string } {
  const curve = buildEquityFromDeals(deals, currentEquity);
  if (curve.length < 2) return { todayPnl: 0, yesterdayPnl: 0, yesterdayDate: "" };

  // Get today and yesterday as YYYY-MM-DD in Eastern Time
  const etFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  function toYMD(d: Date): string {
    const p = etFmt.formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)!.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const now = new Date();
  const todayET = toYMD(now);
  const ydDate = new Date(now);
  ydDate.setDate(ydDate.getDate() - 1);
  const yesterdayET = toYMD(ydDate);

  // Walk curve to find equity at end of each day
  const valAt = (dateStr: string): number => {
    let last: number | undefined;
    for (const pt of curve) {
      if (pt.date <= dateStr) last = pt.value;
      else break;
    }
    return last ?? curve[0].value;
  };

  const todayStart   = valAt(yesterdayET);   // end of yesterday = start of today
  const yesterdayStart = valAt(
    toYMD(new Date(new Date(ydDate).setDate(ydDate.getDate() - 1))),
  );

  return {
    todayPnl:     currentEquity - todayStart,
    yesterdayPnl: todayStart - yesterdayStart,
    yesterdayDate: yesterdayET,
  };
}

export function filterByPeriod(curve: EquityPoint[], period: string): EquityPoint[] {
  const days = PERIOD_DAYS[period] ?? 30;
  if (days >= 99999 || !curve.length) return curve;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const key = cutoff.toISOString().slice(0, 10);
  const filtered = curve.filter((p) => p.date >= key);
  return filtered.length ? filtered : curve;
}
