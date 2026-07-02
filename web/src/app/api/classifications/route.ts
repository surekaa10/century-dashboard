import { NextResponse } from "next/server";

// Persistent position classifications backed by Supabase.
// GET  /api/classifications  → {classifications, riskBudget}
// POST /api/classifications  ← {classifications, riskBudget}
//
// Falls back gracefully if SUPABASE_URL / SUPABASE_SERVICE_KEY are not set,
// returning empty data so the app continues working with localStorage only.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SB_URL = process.env.SUPABASE_URL ?? "";
const SB_ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? "";

function sbHeaders(key: string) {
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

function supabaseAvailable() {
  return SB_URL && SB_ANON && SB_SERVICE;
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!supabaseAvailable()) {
    return NextResponse.json({ classifications: {}, riskBudget: 10_000, source: "fallback" });
  }

  try {
    const [booksRes, settingsRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/position_books?select=symbol,portfolio_type`, {
        headers: sbHeaders(SB_ANON),
        cache: "no-store",
      }),
      fetch(`${SB_URL}/rest/v1/portfolio_settings?key=eq.risk_budget&select=value`, {
        headers: sbHeaders(SB_ANON),
        cache: "no-store",
      }),
    ]);

    const books = booksRes.ok ? (await booksRes.json()) as { symbol: string; portfolio_type: string }[] : [];
    const settings = settingsRes.ok ? (await settingsRes.json()) as { value: string }[] : [];

    const classifications: Record<string, "investment" | "trading"> = {};
    for (const row of books) {
      if (row.portfolio_type === "investment" || row.portfolio_type === "trading") {
        classifications[row.symbol] = row.portfolio_type;
      }
    }

    const riskBudget = settings.length > 0 ? Number(settings[0].value) || 10_000 : 10_000;

    return NextResponse.json({ classifications, riskBudget, source: "supabase" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { classifications: {}, riskBudget: 10_000, source: "error", error: message },
      { status: 200 }, // 200 so client treats this as graceful degradation
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!supabaseAvailable()) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured" });
  }

  const body = (await req.json()) as {
    classifications?: Record<string, string>;
    riskBudget?: number;
  };

  try {
    const ops: Promise<Response>[] = [];

    // Upsert all symbol classifications into position_books
    if (body.classifications && Object.keys(body.classifications).length > 0) {
      const rows = Object.entries(body.classifications).map(([symbol, portfolio_type]) => ({
        symbol,
        portfolio_type,
      }));

      ops.push(
        fetch(`${SB_URL}/rest/v1/position_books`, {
          method: "POST",
          headers: {
            ...sbHeaders(SB_SERVICE),
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(rows),
        }),
      );
    }

    // Upsert risk_budget into portfolio_settings
    if (typeof body.riskBudget === "number") {
      ops.push(
        fetch(`${SB_URL}/rest/v1/portfolio_settings`, {
          method: "POST",
          headers: {
            ...sbHeaders(SB_SERVICE),
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify([{ key: "risk_budget", value: String(body.riskBudget) }]),
        }),
      );
    }

    await Promise.all(ops);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
