import { NextResponse } from "next/server";

// SPY daily closes from Yahoo's chart API (no key, server-side to avoid CORS).
// Used for beta-vs-SPY. Degrades gracefully: returns empty series on failure.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1y&interval=1d",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (century-dashboard)" } },
    );
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];

    const dates: string[] = [];
    const close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        close.push(c);
      }
    }
    if (!close.length) throw new Error("no SPY closes");

    return NextResponse.json(
      { symbol: "SPY", dates, close },
      { headers: { "Cache-Control": "s-maxage=3600" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ symbol: "SPY", dates: [], close: [], error: message });
  }
}
