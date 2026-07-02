// Portfolio book segregation — Investment vs Trading virtual books.
// Classification is stored in localStorage (client) so it persists across
// refreshes without requiring any backend changes.

import type { Position } from "./types";

export type BookType = "investment" | "trading";
export type BookView = "investment" | "trading" | "combined";

export interface BookConfig {
  classifications: Record<string, BookType>; // symbol → book
  tradingCapital: number;                     // virtual capital allocated to trading book
}

export interface TradingKpis {
  tradingCapital: number;
  capitalUsed: number;
  capitalRemaining: number;
  utilizationPct: number;
  openPnl: number;
  openPnlPct: number;
  swapCharges: number;
  openTrades: number;   // unique symbols
}

const STORAGE_KEY = "century_book_config_v1";

export const DEFAULT_BOOK_CONFIG: BookConfig = {
  classifications: {},
  tradingCapital: 10_000,
};

export function loadBookConfig(): BookConfig {
  if (typeof window === "undefined") return DEFAULT_BOOK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOOK_CONFIG;
    const parsed = JSON.parse(raw) as Partial<BookConfig>;
    return {
      classifications: parsed.classifications ?? {},
      tradingCapital: parsed.tradingCapital ?? 10_000,
    };
  } catch {
    return DEFAULT_BOOK_CONFIG;
  }
}

export function saveBookConfig(config: BookConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

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

export function buildTradingKpis(
  tradingPositions: Position[],
  tradingCapital: number,
): TradingKpis {
  const capitalUsed = tradingPositions.reduce(
    (s, p) => s + Math.abs(p.marketValue),
    0,
  );
  const openPnl = tradingPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const swapCharges = tradingPositions.reduce((s, p) => s + p.swap, 0);

  // Cost basis for P&L %
  const costBasis = tradingPositions.reduce((s, p) => {
    if (p.currentPrice <= 0) return s;
    const qty = Math.abs(p.marketValue) / p.currentPrice;
    return s + p.entryPrice * qty;
  }, 0);

  const uniqueSymbols = new Set(tradingPositions.map((p) => p.symbol.trim())).size;

  return {
    tradingCapital,
    capitalUsed,
    capitalRemaining: tradingCapital - capitalUsed,
    utilizationPct: tradingCapital > 0 ? (capitalUsed / tradingCapital) * 100 : 0,
    openPnl,
    openPnlPct: costBasis > 0 ? (openPnl / costBasis) * 100 : 0,
    swapCharges,
    openTrades: uniqueSymbols,
  };
}
