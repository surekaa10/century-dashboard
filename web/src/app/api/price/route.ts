import { NextResponse } from "next/server";

// Fetch current price + 1-year daily history for any Yahoo-listed ticker.
// Used exclusively by the simulation overlay — never called for live portfolio data.
// Pattern mirrors /api/benchmark (same Yahoo v8 chart endpoint, no API key needed).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.toUpperCase().trim() ?? "";
  if (!symbol) {
    return NextResponse.json({ error: "symbol param required" }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (century-dashboard)" },
    });
    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

    const json = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) throw new Error("No chart result — symbol may not exist on Yahoo Finance");

    const meta = r.meta ?? {};
    const ts: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];

    const dates: string[] = [];
    const close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        close.push(c);
      }
    }
    if (!close.length) throw new Error("No price history returned");

    // Prefer the live regular-market price from meta; fall back to last close
    const currentPrice: number =
      typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0
        ? meta.regularMarketPrice
        : close[close.length - 1];

    const fullName: string =
      meta.longName ?? meta.shortName ?? meta.symbol ?? symbol;

    return NextResponse.json({ symbol, fullName, currentPrice, dates, close });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { symbol, fullName: symbol, currentPrice: 0, dates: [], close: [], error: message },
      { status: 200 }, // 200 so client can show the error gracefully
    );
  }
}
