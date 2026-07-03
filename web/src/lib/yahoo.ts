// Server-only Yahoo Finance auth. Yahoo's v7 quote, v1 search, and v10
// quoteSummary endpoints now require a cookie + crumb (they 401/500 without).
// The v8 chart endpoint does NOT — that's why /api/price still works crumb-free.
//
// We fetch a cookie from fc.yahoo.com (avoids the EU consent redirect), exchange
// it for a crumb, and cache both in module memory (survives across requests on a
// warm serverless instance). yahooFetch() appends the crumb, sends the cookie,
// and retries once with a fresh crumb on a 401.

import "server-only";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cache: { cookie: string; crumb: string; ts: number } | null = null;
const TTL_MS = 30 * 60 * 1000; // crumbs are good for a while; refresh every 30 min

async function bootstrap(): Promise<{ cookie: string; crumb: string }> {
  // 1. Cookie — fc.yahoo.com returns a Set-Cookie without the consent gate.
  const cRes = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, cache: "no-store" });
  const setCookies =
    typeof cRes.headers.getSetCookie === "function"
      ? cRes.headers.getSetCookie()
      : [cRes.headers.get("set-cookie")].filter((v): v is string => Boolean(v));
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Yahoo auth: no cookie");

  // 2. Crumb — plain-text token tied to the cookie.
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    cache: "no-store",
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<") || crumb.length > 40) throw new Error("Yahoo auth: no crumb");
  return { cookie, crumb };
}

async function auth(force = false): Promise<{ cookie: string; crumb: string }> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache;
  const fresh = await bootstrap();
  cache = { ...fresh, ts: Date.now() };
  return cache;
}

// Fetch a crumb-gated Yahoo URL. Pass the base URL WITHOUT a crumb param.
export async function yahooFetch(baseUrl: string): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { cookie, crumb } = await auth(attempt === 1); // 2nd try forces a fresh crumb
    const sep = baseUrl.includes("?") ? "&" : "?";
    res = await fetch(`${baseUrl}${sep}crumb=${encodeURIComponent(crumb)}`, {
      headers: { "User-Agent": UA, Cookie: cookie },
      cache: "no-store",
    });
    if (res.status !== 401) return res;
  }
  return res!;
}
