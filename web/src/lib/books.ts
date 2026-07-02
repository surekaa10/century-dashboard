// Portfolio book segregation — Investment vs Trading virtual books.
//
// PERSISTENCE MODEL (fixed):
//   1. On app load  → fetch from /api/classifications (Supabase) → merge into state
//   2. On change    → save to localStorage (instant) + POST to /api/classifications (persistent)
//   This makes classifications consistent across all devices, browsers, and users.
//
// RISK BUDGET (corrected):
//   $10,000 is the MAXIMUM ALLOWABLE LOSS for the trading book — NOT the trading capital.
//   tradingCapital = actual market value of trading positions (derived from positions array)
//   riskBudget     = ceiling on cumulative losses ($10,000 by default)

import type { Position } from "./types";

export type BookType = "investment" | "trading";
export type BookView = "investment" | "trading" | "combined" | "simulated";

export interface BookConfig {
  classifications: Record<string, BookType>; // symbol → book, stored in Supabase
  riskBudget: number;                        // max allowable loss on trading book (NOT capital)
}

export interface TradingKpis {
  riskBudget: number;         // max loss ceiling ($10,000 default)
  riskUsed: number;           // current unrealized loss (how much of the budget is at risk)
  riskRemaining: number;      // riskBudget − riskUsed
  riskUtilizationPct: number; // riskUsed / riskBudget — how close to the loss limit
  capitalExposed: number;     // actual market value of trading positions (≠ riskBudget)
  openPnl: number;            // total unrealized P&L across trading positions
  openPnlPct: number;         // openPnl / costBasis
  swapCharges: number;
  openTrades: number;         // unique symbols
}

const STORAGE_KEY = "century_book_config_v2"; // v2: renamed tradingCapital → riskBudget

export const DEFAULT_BOOK_CONFIG: BookConfig = {
  classifications: {},
  riskBudget: 10_000,
};

// ── Local (localStorage) helpers ──────────────────────────────────────────────

export function loadBookConfig(): BookConfig {
  if (typeof window === "undefined") return DEFAULT_BOOK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check v1 key for backward compatibility (tradingCapital → riskBudget rename)
      const v1 = localStorage.getItem("century_book_config_v1");
      if (v1) {
        const p = JSON.parse(v1) as { classifications?: Record<string, BookType>; tradingCapital?: number };
        return { classifications: p.classifications ?? {}, riskBudget: p.tradingCapital ?? 10_000 };
      }
      return DEFAULT_BOOK_CONFIG;
    }
    const parsed = JSON.parse(raw) as Partial<BookConfig>;
    return {
      classifications: parsed.classifications ?? {},
      riskBudget: parsed.riskBudget ?? 10_000,
    };
  } catch {
    return DEFAULT_BOOK_CONFIG;
  }
}

export function saveBookConfig(config: BookConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ── Server (Supabase via /api/classifications) helpers ────────────────────────

export async function loadBookConfigFromServer(): Promise<BookConfig | null> {
  try {
    const res = await fetch("/api/classifications", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      classifications?: Record<string, BookType>;
      riskBudget?: number;
      source?: string;
    };
    if (data.source === "fallback" || data.source === "error") return null;
    return {
      classifications: data.classifications ?? {},
      riskBudget: data.riskBudget ?? 10_000,
    };
  } catch {
    return null;
  }
}

export async function saveBookConfigToServer(config: BookConfig): Promise<void> {
  try {
    await fetch("/api/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classifications: config.classifications,
        riskBudget: config.riskBudget,
      }),
    });
  } catch {
    // Non-fatal — localStorage already has the latest value
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

export function getBook(symbol: string, config: BookConfig): BookType {
  return config.classifications[symbol.trim()] ?? "investment";
}

export function filterByBook(
  positions: Position[],
  config: BookConfig,
  book: BookView,
): Position[] {
  if (book === "combined") return positions;
  return positions.filter((p) => getBook(p.symbol, config) === book);
}

// ── Trading KPI calculation (corrected semantics) ─────────────────────────────

export function buildTradingKpis(
  tradingPositions: Position[],
  riskBudget: number,
): TradingKpis {
  const capitalExposed = tradingPositions.reduce(
    (s, p) => s + Math.abs(p.marketValue),
    0,
  );

  const openPnl = tradingPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const swapCharges = tradingPositions.reduce((s, p) => s + p.swap, 0);

  // Cost basis for P&L%
  const costBasis = tradingPositions.reduce((s, p) => {
    if (p.currentPrice <= 0) return s;
    const qty = Math.abs(p.marketValue) / p.currentPrice;
    return s + p.entryPrice * qty;
  }, 0);

  // Risk used = the current unrealized loss (the portion of the risk budget being consumed).
  // If positions are profitable, riskUsed = 0 (no budget consumed).
  const riskUsed = Math.max(0, -(openPnl + swapCharges));

  const uniqueSymbols = new Set(tradingPositions.map((p) => p.symbol.trim())).size;

  return {
    riskBudget,
    riskUsed,
    riskRemaining: Math.max(0, riskBudget - riskUsed),
    riskUtilizationPct: riskBudget > 0 ? (riskUsed / riskBudget) * 100 : 0,
    capitalExposed,
    openPnl,
    openPnlPct: costBasis > 0 ? (openPnl / costBasis) * 100 : 0,
    swapCharges,
    openTrades: uniqueSymbols,
  };
}
