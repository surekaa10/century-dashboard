import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/universe/search?q=apple
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=true&enableNavLinks=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; century-dashboard/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Yahoo search ${res.status}`);

    const json = (await res.json()) as {
      quotes?: {
        symbol?: string;
        longname?: string;
        shortname?: string;
        exchDisp?: string;
        quoteType?: string;
        sector?: string;
      }[];
    };

    const results = (json.quotes ?? [])
      .filter((q) => q.symbol && q.quoteType !== "OPTION" && q.quoteType !== "FUTURE")
      .slice(0, 8)
      .map((q) => ({
        ticker:   q.symbol ?? "",
        name:     q.longname ?? q.shortname ?? q.symbol ?? "",
        exchange: q.exchDisp ?? "",
        type:     q.quoteType ?? "EQUITY",
        sector:   q.sector,
      }));

    return NextResponse.json({ results }, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (e: unknown) {
    return NextResponse.json({ results: [], error: String(e) }, { status: 200 });
  }
}
