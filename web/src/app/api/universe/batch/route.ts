import { NextResponse } from "next/server";
import { yahooFetch } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/universe/batch?symbols=AAPL,MSFT,NVDA,...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return NextResponse.json({ quotes: [] });

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,trailingPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,longName,shortName,currency,fullExchangeName`;
    const res = await yahooFetch(url);
    if (!res.ok) throw new Error(`Yahoo batch ${res.status}`);

    const json = (await res.json()) as {
      quoteResponse?: {
        result?: {
          symbol?: string;
          longName?: string;
          shortName?: string;
          regularMarketPrice?: number;
          regularMarketChange?: number;
          regularMarketChangePercent?: number;
          regularMarketVolume?: number;
          marketCap?: number;
          trailingPE?: number;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
          currency?: string;
          fullExchangeName?: string;
        }[];
      };
    };

    const quotes = (json.quoteResponse?.result ?? []).map((q) => ({
      ticker:           q.symbol ?? "",
      name:             q.longName ?? q.shortName ?? q.symbol ?? "",
      price:            q.regularMarketPrice ?? 0,
      change:           q.regularMarketChange ?? 0,
      changePct:        q.regularMarketChangePercent ?? 0,
      mktCap:           q.marketCap ?? 0,
      volume:           q.regularMarketVolume ?? 0,
      pe:               q.trailingPE ?? 0,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow:  q.fiftyTwoWeekLow ?? 0,
      currency:         q.currency ?? "USD",
      exchange:         q.fullExchangeName ?? "",
    }));

    return NextResponse.json({ quotes }, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (e: unknown) {
    return NextResponse.json({ quotes: [], error: String(e) });
  }
}
