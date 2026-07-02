// Simulated position overlay — purely in-memory scenario analysis.
// Sim positions are NEVER written to the database or alter live portfolio state.
// They flow through every existing calculation by being merged into the positions
// array before the existing pipeline runs.

import type { Position, SymbolRates } from "./types";

export interface SimPosition {
  id: string;
  symbol: string;
  fullName?: string;
  direction: "Long" | "Short";
  volume: number;
  entryPrice: number;
  currentPrice: number;
  notes?: string;
}

export interface PriceResult {
  symbol: string;
  fullName: string;
  currentPrice: number;
  dates: string[];
  close: number[];
  error?: string;
}

// Convert a SimPosition to a Position that can flow through all existing calcs.
export function simToPosition(s: SimPosition): Position {
  const qty = Math.abs(s.volume);
  const mv =
    s.direction === "Long"
      ? qty * s.currentPrice
      : -(qty * s.currentPrice);
  const pnl =
    s.direction === "Long"
      ? qty * (s.currentPrice - s.entryPrice)
      : qty * (s.entryPrice - s.currentPrice);

  return {
    symbol: s.symbol.toUpperCase(),
    fullName: s.fullName,
    direction: s.direction,
    volume: qty,
    entryPrice: s.entryPrice,
    currentPrice: s.currentPrice,
    unrealizedPnl: pnl,
    marketValue: mv,
    swap: 0,
    openTime: "Simulated",
    simulated: true,
  };
}

// Build a SymbolRates entry from a PriceResult so analytics can compute
// vol, beta, Sharpe, etc. for the simulated symbol.
export function simToRates(r: PriceResult): SymbolRates {
  if (!r.dates.length) return {};
  return { [r.symbol]: { dates: r.dates, close: r.close } };
}

// Simple id generator — avoids uuid dependency
export function makeSimId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Session storage — positions survive page refresh but are cleared when the
// browser tab closes. Production DB is never touched.
const SESSION_KEY = "century_sim_v1";

export function loadSimPositions(): SimPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SimPosition[]) : [];
  } catch {
    return [];
  }
}

export function saveSimPositions(positions: SimPosition[]): void {
  if (typeof window === "undefined") return;
  if (positions.length === 0) {
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(positions));
  }
}
