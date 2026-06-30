// Server-only: fetches snapshot.json from the private GitHub repo and normalizes
// it. The GitHub token never leaves the server (read here, in a Route Handler).

import "server-only";
import type { Account, Deal, Position, Snapshot, SymbolRates } from "./types";

const num = (v: unknown, d = 0): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};

function normalizeAccount(a: Record<string, unknown> | null): Account | null {
  if (!a) return null;
  return {
    name: String(a.name ?? ""),
    server: String(a.server ?? ""),
    currency: String(a.currency ?? "USD"),
    leverage: num(a.leverage),
    balance: num(a.balance),
    credit: num(a.credit),
    equity: num(a.equity),
    margin: num(a.margin),
    freeMargin: num(a.free_margin),
    marginLevel: num(a.margin_level),
  };
}

function normalizePositions(rows: Record<string, unknown>[]): Position[] {
  return (rows ?? []).map((r) => ({
    symbol: String(r["Symbol"] ?? ""),
    direction: (r["Direction"] === "Short" ? "Short" : "Long") as "Long" | "Short",
    volume: num(r["Volume"]),
    entryPrice: num(r["Entry Price"]),
    currentPrice: num(r["Current Price"]),
    unrealizedPnl: num(r["Unrealized P&L"]),
    marketValue: num(r["Market Value"]),
    swap: num(r["Swap"]),
    openTime: String(r["Open Time"] ?? ""),
    fullName: r["Full Name"] != null ? String(r["Full Name"]) : undefined,
    path: r["Path"] != null ? String(r["Path"]) : undefined,
  }));
}

function normalizeDeals(rows: Record<string, unknown>[]): Deal[] {
  return (rows ?? []).map((r) => ({
    ticket: num(r["ticket"]),
    time: String(r["time"] ?? ""),
    symbol: String(r["symbol"] ?? ""),
    type: num(r["type"]),
    entry: num(r["entry"]),
    volume: num(r["volume"]),
    price: num(r["price"]),
    profit: num(r["profit"]),
    commission: num(r["commission"]),
    swap: num(r["swap"]),
  }));
}

export function getConfig() {
  const repo = process.env.GH_REPO;
  const token = process.env.GH_TOKEN;
  const branch = process.env.GH_BRANCH ?? "snapshot";
  const path = process.env.SNAPSHOT_PATH ?? "snapshot.json";
  return { repo, token, branch, path };
}

export function normalizePayload(payload: Record<string, unknown>): Snapshot {
  return {
    ok: Boolean((payload.ok as boolean) ?? true),
    error: String(payload.error ?? ""),
    generatedAt: String(payload.generated_at ?? ""),
    account: normalizeAccount((payload.account as Record<string, unknown>) ?? null),
    positions: normalizePositions((payload.positions as Record<string, unknown>[]) ?? []),
    deals: normalizeDeals((payload.deals as Record<string, unknown>[]) ?? []),
    todayRealized: num(payload.today_realized),
    symbolRates: normalizeRates((payload.symbol_rates as Record<string, { index?: string[]; Close?: number[] }>) ?? {}),
  };
}

export async function fetchSnapshot(): Promise<Snapshot> {
  const { repo, token, branch, path } = getConfig();
  if (!repo || !token) {
    throw new Error(
      "Snapshot source not configured — set GH_REPO and GH_TOKEN in the environment.",
    );
  }

  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${res.statusText} fetching ${repo}@${branch}/${path}`);
  }

  const payload = JSON.parse(await res.text());
  return normalizePayload(payload as Record<string, unknown>);
}

function normalizeRates(raw: Record<string, { index?: string[]; Close?: number[] }>): SymbolRates {
  const out: SymbolRates = {};
  for (const [sym, blob] of Object.entries(raw ?? {})) {
    const dates = (blob?.index ?? []).map((d) => String(d).slice(0, 10));
    const close = (blob?.Close ?? []).map((c) => num(c));
    if (dates.length && dates.length === close.length) out[sym] = { dates, close };
  }
  return out;
}
