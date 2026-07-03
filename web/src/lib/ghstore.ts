// Server-only tiny JSON store on the private GitHub repo, reusing the same
// GH_REPO/GH_TOKEN/GH_BRANCH the pusher already uses for snapshot.json. Lets the
// MVP persist small shared state (classifications, manual trades) with no extra
// backend. Swap for Mongo later by replacing these two primitives.

import "server-only";
import { getConfig } from "./snapshot";

export function ghConfigured(): boolean {
  const { repo, token } = getConfig();
  return Boolean(repo && token);
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// Reads decoded JSON + blob sha (sha is needed to update in place). sha is null
// when the file doesn't exist yet (first write creates it).
export async function readGhJson<T>(path: string, fallback: T): Promise<{ data: T; sha: string | null }> {
  const { repo, token, branch } = getConfig();
  if (!repo || !token) throw new Error("GH_REPO/GH_TOKEN not configured");
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
    headers: ghHeaders(token),
    cache: "no-store",
  });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`GitHub ${res.status} reading ${path}`);
  const body = (await res.json()) as { content?: string; sha: string };
  try {
    return { data: JSON.parse(Buffer.from(body.content ?? "", "base64").toString("utf8")) as T, sha: body.sha };
  } catch {
    return { data: fallback, sha: body.sha };
  }
}

async function putGhJson(path: string, data: unknown, sha: string | null, message: string): Promise<Response> {
  const { repo, token, branch } = getConfig();
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  return fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(token!),
    body: JSON.stringify({ message, content, branch, ...(sha ? { sha } : {}) }),
  });
}

// Read-modify-write with one retry on the 409 stale-sha race. `update` receives
// the current value and returns the next one. ponytail: last-write-wins per
// field, one retry — fine for MVP write volume; Mongo gives real transactions.
export async function updateGhJson<T>(path: string, fallback: T, message: string, update: (current: T) => T): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readGhJson<T>(path, fallback);
    const next = update(data);
    const res = await putGhJson(path, next, sha, message);
    if (res.ok) return;
    if (res.status !== 409) throw new Error(`GitHub ${res.status} writing ${path}`);
    // 409: another writer landed between our read and write — retry with fresh sha.
  }
  throw new Error(`write conflict on ${path}`);
}
