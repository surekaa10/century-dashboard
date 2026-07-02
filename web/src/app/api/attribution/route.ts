import { NextResponse } from "next/server";

// GET /api/attribution?benchmark=SPY
// Fetches 1 benchmark ETF + 13 sector ETFs from Yahoo Finance in parallel.
// Used by the Brinson-Fachler attribution engine on the front-end.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_BENCHMARKS: Record<string, string> = {
  SPY:  "S&P 500",
  QQQ:  "Nasdaq 100",
  URTH: "MSCI World",
  ACWI: "MSCI ACWI",
  IWM:  "Russell 2000",
};

const SECTOR_ETFS = ["XLK", "XLF", "XLV", "XLY", "XLC", "XLI", "XLP", "XLE", "XLB", "XLRE", "XLU", "GLD", "UUP"];

type PriceSeries = { dates: string[]; close: number[] };

async function fetchYahoo(ticker: string): Promise<PriceSeries> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; century-dashboard/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${ticker}`);

  const json = (await res.json()) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  };
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);

  const timestamps: number[] = result.timestamp ?? [];
  const rawClose: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  const dates: string[] = [];
  const close: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = rawClose[i];
    if (c != null && isFinite(c) && c > 0) {
      dates.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
      close.push(c);
    }
  }
  return { dates, close };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bmParam = (url.searchParams.get("benchmark") ?? "SPY").toUpperCase();
  const bmTicker = ALLOWED_BENCHMARKS[bmParam] ? bmParam : "SPY";
  const bmName = ALLOWED_BENCHMARKS[bmTicker];

  // Fetch benchmark + all sector ETFs in parallel
  const allTickers = [bmTicker, ...SECTOR_ETFS];
  const settled = await Promise.allSettled(allTickers.map(fetchYahoo));

  const [bmSettled, ...sectorSettled] = settled;
  const benchmark: PriceSeries =
    bmSettled.status === "fulfilled" ? bmSettled.value : { dates: [], close: [] };

  const sectorRates: Record<string, PriceSeries> = {};
  for (let i = 0; i < SECTOR_ETFS.length; i++) {
    const s = sectorSettled[i];
    if (s.status === "fulfilled") sectorRates[SECTOR_ETFS[i]] = s.value;
  }

  return NextResponse.json(
    { benchmark, sectorRates, benchmarkTicker: bmTicker, benchmarkName: bmName },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" } },
  );
}
