import { NextResponse } from "next/server";
import { ghConfigured, readGhJson, updateGhJson } from "@/lib/ghstore";

// Manually-recorded closed trades, backed by the GitHub snapshot pipeline.
// These supplement MT5 deal history for trades missing from the snapshot
// (e.g. the Gold loss, pre-dashboard trades, broker data gaps).
// GET  /api/manual-trades → {trades, source}
// POST /api/manual-trades ← snake_case trade fields → {trade}
//
// Stores manual_trades.json on the same repo/branch as snapshot.json, so trades
// are shared across all users with no extra backend. Falls back to empty if GH
// is unset.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILE = process.env.MANUAL_TRADES_PATH ?? "manual_trades.json";

export interface ManualTrade {
  id: string;
  symbol: string;
  direction: "Long" | "Short";
  volume: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  openTime: string;
  closeTime: string;
  note?: string;
}

const EMPTY: ManualTrade[] = [];

export async function GET() {
  if (!ghConfigured()) return NextResponse.json({ trades: [], source: "fallback" });
  try {
    const { data } = await readGhJson<ManualTrade[]>(FILE, EMPTY);
    const trades = [...data].sort((a, b) => b.closeTime.localeCompare(a.closeTime));
    return NextResponse.json({ trades, source: "github" });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ trades: [], source: "error", error });
  }
}

export async function POST(req: Request) {
  if (!ghConfigured()) {
    return NextResponse.json({ error: "GH_REPO/GH_TOKEN not configured" }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      symbol: string; direction: string; volume: number;
      entry_price: number; exit_price: number; realized_pnl: number;
      open_time: string; close_time: string; note?: string | null;
    };
    const { symbol, direction, volume, entry_price, exit_price, realized_pnl, open_time, close_time } = body;
    if (!symbol || !direction || !volume || entry_price == null || exit_price == null || realized_pnl == null || !open_time || !close_time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trade: ManualTrade = {
      // Time-based id; multiple adds in one ms get a random suffix. Not for crypto.
      id: `mt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      symbol: String(symbol).toUpperCase().trim(),
      direction: direction === "Short" ? "Short" : "Long",
      volume,
      entryPrice: entry_price,
      exitPrice: exit_price,
      realizedPnl: realized_pnl,
      openTime: open_time,
      closeTime: close_time,
      note: body.note ?? undefined,
    };

    await updateGhJson<ManualTrade[]>(FILE, EMPTY, `manual trade ${trade.symbol}`, (cur) => [...cur, trade]);
    return NextResponse.json({ trade });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
