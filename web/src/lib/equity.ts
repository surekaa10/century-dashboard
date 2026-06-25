import type { Deal, Position, SymbolRates } from "./types";

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

// Parses MT5 openTime strings into YYYY-MM-DD.
// Handles "2026-06-10 09:32:00", "2026.06.10 09:32:00", "10 Jun 2026 09:32:00".
const OPEN_MONTHS: Record<string, string> = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};
function parseOpenDateMV(openTime: string): string {
  const s = openTime.trim();
  // ISO-like: "2026-06-10 ..." or "2026.06.10 ..."
  const isoMatch = s.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // Human: "10 Jun 2026 09:32"
  const parts = s.split(/\s+/);
  if (parts.length >= 3) {
    const mo = OPEN_MONTHS[parts[1].slice(0, 3).toLowerCase()];
    if (mo) return `${parts[2]}-${mo}-${parts[0].padStart(2, "0")}`;
  }
  return "";
}

// Builds the equity curve from the market value of open positions at historical
// prices (from symbolRates). Each raw fill is processed individually so that
// per-fill open dates are respected correctly — a second fill added to a symbol
// later does not retroactively inflate earlier dates. The price ratio approach
// (historicalPrice / currentPrice) avoids needing the MT5 contract size.
// The curve starts from the earliest fill open date (no leading zeros),
// and the final point is anchored to the actual sum of current marketValues.
// Builds the historical floating P&L curve. For each date, for every raw fill
// that was already open, computes dirSign*(historicalPrice - entryPrice)*qty,
// where qty = |marketValue| / currentPrice (avoids needing contract size).
// The final point is anchored to the actual sum of per-fill floating P&L.
export function buildPnlCurve(
  positions: Position[],
  rates: SymbolRates,
): EquityPoint[] {
  if (!positions.length) return [];

  const dateSet = new Set<string>();
  for (const p of positions) {
    for (const d of rates[p.symbol.trim()]?.dates ?? []) dateSet.add(d);
  }
  if (!dateSet.size) return [];

  const dates = [...dateSet].sort();

  const priceMaps = new Map<string, Map<string, number>>();
  for (const p of positions) {
    const sym = p.symbol.trim();
    if (priceMaps.has(sym)) continue;
    const r = rates[sym];
    if (!r) continue;
    const m = new Map<string, number>();
    r.dates.forEach((d, i) => m.set(d, r.close[i]));
    priceMaps.set(sym, m);
  }

  const fillOpenDates = positions.map((p) => parseOpenDateMV(p.openTime));
  const minOpenDate = fillOpenDates.filter((d) => d !== "").sort()[0] ?? dates[0];
  const startIdx = dates.findIndex((d) => d >= minOpenDate);
  const activeDates = startIdx >= 0 ? dates.slice(startIdx) : dates;

  const carry = new Map<string, number>();
  const out: EquityPoint[] = [];

  for (const date of activeDates) {
    for (const [sym, m] of priceMaps) {
      const v = m.get(date);
      if (v !== undefined) carry.set(sym, v);
    }

    let totalPnl = 0;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const od = fillOpenDates[i];
      if (od && od > date) continue;
      const sym = p.symbol.trim();
      const px = carry.get(sym);
      if (px === undefined || p.currentPrice <= 0) continue;
      const dirSign = p.direction === "Long" ? 1 : -1;
      const qty = Math.abs(p.marketValue) / p.currentPrice;
      totalPnl += dirSign * (px - p.entryPrice) * qty;
    }
    out.push({ date, value: totalPnl });
  }

  // Anchor last point to actual current floating P&L
  if (out.length > 0) {
    const currentPnl = positions.reduce((s, p) => {
      if (p.currentPrice <= 0) return s;
      const dirSign = p.direction === "Long" ? 1 : -1;
      const qty = Math.abs(p.marketValue) / p.currentPrice;
      return s + dirSign * (p.currentPrice - p.entryPrice) * qty;
    }, 0);
    out[out.length - 1].value = currentPnl;
  }

  return out;
}

export function buildEquityFromMarketValue(
  positions: Position[],
  rates: SymbolRates,
): EquityPoint[] {
  if (!positions.length) return [];

  // Collect all dates from symbolRates across held symbols
  const dateSet = new Set<string>();
  for (const p of positions) {
    for (const d of rates[p.symbol.trim()]?.dates ?? []) dateSet.add(d);
  }
  if (!dateSet.size) return [];

  const dates = [...dateSet].sort();

  // Build date→close maps per symbol (one map entry per unique symbol)
  const priceMaps = new Map<string, Map<string, number>>();
  for (const p of positions) {
    const sym = p.symbol.trim();
    if (priceMaps.has(sym)) continue;
    const r = rates[sym];
    if (!r) continue;
    const m = new Map<string, number>();
    r.dates.forEach((d, i) => m.set(d, r.close[i]));
    priceMaps.set(sym, m);
  }

  // Parse open date for every raw fill (not aggregated — preserves per-fill dates)
  const fillOpenDates = positions.map((p) => parseOpenDateMV(p.openTime));

  // Trim leading dates before the first fill opened (avoids long zero-value tail)
  const minOpenDate = fillOpenDates.filter((d) => d !== "").sort()[0] ?? dates[0];
  const startIdx = dates.findIndex((d) => d >= minOpenDate);
  const activeDates = startIdx >= 0 ? dates.slice(startIdx) : dates;

  const carry = new Map<string, number>(); // forward-filled price per symbol
  const out: EquityPoint[] = [];

  for (const date of activeDates) {
    // Forward-fill prices on this date
    for (const [sym, m] of priceMaps) {
      const v = m.get(date);
      if (v !== undefined) carry.set(sym, v);
    }

    // Sum market values for every fill open on this date
    let totalMv = 0;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const od = fillOpenDates[i];
      if (od && od > date) continue; // this fill not yet opened
      const sym = p.symbol.trim();
      const px = carry.get(sym);
      if (px === undefined || p.currentPrice <= 0) {
        totalMv += Math.abs(p.marketValue); // fallback: use current value
        continue;
      }
      // Scale by price ratio — correct regardless of contract size
      totalMv += Math.abs(p.marketValue) * (px / p.currentPrice);
    }
    out.push({ date, value: totalMv });
  }

  // Anchor last point to actual sum of current market values
  if (out.length > 0) {
    out[out.length - 1].value = positions.reduce((s, p) => s + Math.abs(p.marketValue), 0);
  }

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

// Computes yesterday's and today's unrealized P&L using symbolRates closes.
// Avoids the deals-based approach which breaks when no deals were recently closed.
export function buildYesterdayPnlFromRates(
  positions: Position[],
  rates: SymbolRates,
): { todayPnl: number; yesterdayPnl: number; yesterdayDate: string } {
  const etFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  function toYMD(d: Date): string {
    const parts = etFmt.formatToParts(d);
    const get = (t: string) => parts.find((x) => x.type === t)!.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  const now = new Date();
  const yesterdayET = toYMD(new Date(now.getTime() - 86400_000));
  const yd2ET = toYMD(new Date(now.getTime() - 2 * 86400_000));

  const priceAt = (sym: string, date: string): number | undefined => {
    const r = rates[sym];
    if (!r) return undefined;
    let last: number | undefined;
    for (let i = 0; i < r.dates.length; i++) {
      if (r.dates[i] <= date) last = r.close[i];
      else break;
    }
    return last;
  };

  let todayPnl = 0;
  let yesterdayPnl = 0;

  for (const p of positions) {
    const sym = p.symbol.trim();
    if (p.currentPrice <= 0) continue;
    const dirSign = p.direction === "Long" ? 1 : -1;
    const qty = Math.abs(p.marketValue) / p.currentPrice;

    const ydPrice = priceAt(sym, yesterdayET);
    const yd2Price = priceAt(sym, yd2ET);

    if (ydPrice !== undefined) {
      todayPnl += dirSign * (p.currentPrice - ydPrice) * qty;
    }
    if (ydPrice !== undefined && yd2Price !== undefined) {
      yesterdayPnl += dirSign * (ydPrice - yd2Price) * qty;
    }
  }

  return { todayPnl, yesterdayPnl, yesterdayDate: yesterdayET };
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
