import { NextResponse } from "next/server";
import { fetchSnapshot, getConfig, normalizePayload } from "@/lib/snapshot";
import { readFile } from "fs/promises";
import { join } from "path";

// Always run fresh — the browser polls this for live data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { repo, token } = getConfig();

  // Dev fallback: if credentials aren't configured, serve the local fixture.
  if (!repo || !token) {
    try {
      const raw = await readFile(join(process.cwd(), "public", "snapshot.local.json"), "utf8");
      const normalized = normalizePayload(JSON.parse(raw) as Record<string, unknown>);
      return NextResponse.json(normalized, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json(
        { ok: false, error: "Snapshot source not configured — set GH_REPO and GH_TOKEN in .env.local" },
        { status: 502 },
      );
    }
  }

  try {
    const snapshot = await fetchSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
