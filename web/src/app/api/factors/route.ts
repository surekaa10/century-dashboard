import { NextResponse } from "next/server";

// Factor-proxy daily closes from Yahoo (no key, server-side). Style factors via
// ETFs, macro via ETFs/indices. Used to estimate portfolio factor betas.
// Degrades gracefully per-ticker.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TICKERS = [
  "SPY", "IWM", "IWF", "IWD", "MTUM", "QUAL", "USMV", // equity style
  "UUP", "GLD", "USO", "TLT", "^VIX", "TIP", "HYG",    // macro
];

async function fetchOne(sym: string): Promise<{ sym: string; dates: string[]; close: number[] }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`;
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (century-dashboard)" } });
    if (!res.ok) throw new Error(`${res.status}`);
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const c: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const dates: string[] = [];
    const close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (typeof c[i] === "number" && Number.isFinite(c[i])) {
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        close.push(c[i] as number);
      }
    }
    return { sym, dates, close };
  } catch {
    return { sym, dates: [], close: [] };
  }
}

export async function GET() {
  const results = await Promise.all(TICKERS.map(fetchOne));
  const out: Record<string, { dates: string[]; close: number[] }> = {};
  for (const r of results) out[r.sym] = { dates: r.dates, close: r.close };
  return NextResponse.json(out, { headers: { "Cache-Control": "s-maxage=3600" } });
}
