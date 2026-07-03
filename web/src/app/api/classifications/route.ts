import { NextResponse } from "next/server";
import { ghConfigured, readGhJson, updateGhJson } from "@/lib/ghstore";

// Persistent position classifications backed by the GitHub snapshot pipeline.
// GET  /api/classifications  → {classifications, riskBudget, source}
// POST /api/classifications  ← {classifications, riskBudget}
//
// Stores classifications.json on the same private repo/branch the pusher writes
// snapshot.json to, so the same GH_TOKEN/GH_REPO already in prod makes
// classifications consistent across all devices, browsers, and users — no extra
// backend needed for the MVP. Falls back (source:"fallback") if GH is unset, so
// the client keeps working with localStorage only.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FILE = process.env.CLASSIFICATIONS_PATH ?? "classifications.json";

type BookType = "investment" | "trading";
interface Store {
  classifications: Record<string, BookType>;
  riskBudget: number;
}
const EMPTY: Store = { classifications: {}, riskBudget: 10_000 };

export async function GET() {
  if (!ghConfigured()) return NextResponse.json({ ...EMPTY, source: "fallback" });
  try {
    const { data } = await readGhJson<Store>(FILE, EMPTY);
    return NextResponse.json({
      classifications: data.classifications ?? {},
      riskBudget: typeof data.riskBudget === "number" ? data.riskBudget : 10_000,
      source: "github",
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // 200 → client treats as graceful degradation to localStorage.
    return NextResponse.json({ ...EMPTY, source: "error", error }, { status: 200 });
  }
}

export async function POST(req: Request) {
  if (!ghConfigured()) return NextResponse.json({ ok: false, reason: "GH_REPO/GH_TOKEN not configured" });
  const body = (await req.json()) as { classifications?: Record<string, BookType>; riskBudget?: number };
  try {
    // Merge so one client's save never clobbers symbols another client set.
    await updateGhJson<Store>(FILE, EMPTY, "classifications update", (cur) => ({
      classifications: { ...cur.classifications, ...(body.classifications ?? {}) },
      riskBudget: typeof body.riskBudget === "number" ? body.riskBudget : cur.riskBudget,
    }));
    return NextResponse.json({ ok: true, source: "github" });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error }, { status: 200 });
  }
}
