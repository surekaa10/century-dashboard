import { NextResponse } from "next/server";

// Benchmark daily closes from Yahoo's chart API (no key, server-side to avoid
// CORS). Used for beta / alpha / tracking error. Degrades gracefully: returns an
// empty series on failure. Pass ?symbol=SPY|QQQ|URTH (default SPY).
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Allow-list of supported benchmark proxies → Yahoo ticker + display name.
const BENCHMARKS: Record<string, { ticker: string; name: string }> = {
  SPY: { ticker: "SPY", name: "S&P 500" },
  QQQ: { ticker: "QQQ", name: "Nasdaq 100" },
  URTH: { ticker: "URTH", name: "MSCI World" },
  ACWI: { ticker: "ACWI", name: "MSCI ACWI" },
  IWM: { ticker: "IWM", name: "Russell 2000" },
};

export async function GET(req: Request) {
  const key = (new URL(req.url).searchParams.get("symbol") ?? "SPY").toUpperCase();
  const bench = BENCHMARKS[key] ?? BENCHMARKS.SPY;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${bench.ticker}?range=1y&interval=1d`,
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
    if (!close.length) throw new Error("no closes");

    return NextResponse.json(
      { symbol: bench.ticker, name: bench.name, dates, close },
      { headers: { "Cache-Control": "s-maxage=3600" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ symbol: bench.ticker, name: bench.name, dates: [], close: [], error: message });
  }
}
