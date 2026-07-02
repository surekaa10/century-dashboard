import { NextResponse } from "next/server";

// GET /api/manual-trades — returns all manually-recorded closed trades from Supabase.
// These supplement MT5 deal history for trades that are missing from the snapshot
// (e.g. pre-dashboard trades, broker data gaps).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_ANON = process.env.SUPABASE_ANON_KEY ?? "";

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

export async function GET() {
  if (!SB_URL || !SB_ANON) {
    return NextResponse.json({ trades: [], source: "fallback" });
  }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/manual_trades?select=id,symbol,direction,volume,entry_price,exit_price,realized_pnl,open_time,close_time,note&order=close_time.desc`,
      {
        headers: {
          apikey: SB_ANON,
          Authorization: `Bearer ${SB_ANON}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) throw new Error(`Supabase ${res.status}`);

    const rows = (await res.json()) as {
      id: string;
      symbol: string;
      direction: string;
      volume: number;
      entry_price: number;
      exit_price: number;
      realized_pnl: number;
      open_time: string;
      close_time: string;
      note: string | null;
    }[];

    const trades: ManualTrade[] = rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      direction: (r.direction as "Long" | "Short"),
      volume: r.volume,
      entryPrice: r.entry_price,
      exitPrice: r.exit_price,
      realizedPnl: r.realized_pnl,
      openTime: r.open_time,
      closeTime: r.close_time,
      note: r.note ?? undefined,
    }));

    return NextResponse.json({ trades, source: "supabase" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ trades: [], source: "error", error: message });
  }
}

type RawRow = {
  id: string;
  symbol: string;
  direction: string;
  volume: number;
  entry_price: number;
  exit_price: number;
  realized_pnl: number;
  open_time: string;
  close_time: string;
  note: string | null;
};

function rowToTrade(r: RawRow): ManualTrade {
  return {
    id: r.id,
    symbol: r.symbol,
    direction: r.direction as "Long" | "Short",
    volume: r.volume,
    entryPrice: r.entry_price,
    exitPrice: r.exit_price,
    realizedPnl: r.realized_pnl,
    openTime: r.open_time,
    closeTime: r.close_time,
    note: r.note ?? undefined,
  };
}

export async function POST(req: Request) {
  if (!SB_URL || !SB_ANON) {
    return NextResponse.json({ error: "Supabase not configured — set SUPABASE_URL and SUPABASE_ANON_KEY" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as {
      symbol: string;
      direction: string;
      volume: number;
      entry_price: number;
      exit_price: number;
      realized_pnl: number;
      open_time: string;
      close_time: string;
      note?: string | null;
    };

    const { symbol, direction, volume, entry_price, exit_price, realized_pnl, open_time, close_time } = body;
    if (!symbol || !direction || !volume || entry_price == null || exit_price == null || realized_pnl == null || !open_time || !close_time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const res = await fetch(`${SB_URL}/rest/v1/manual_trades`, {
      method: "POST",
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        symbol: String(symbol).toUpperCase().trim(),
        direction,
        volume,
        entry_price,
        exit_price,
        realized_pnl,
        open_time,
        close_time,
        note: body.note ?? null,
      }),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);

    const rows = (await res.json()) as RawRow[];
    return NextResponse.json({ trade: rowToTrade(rows[0]) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
