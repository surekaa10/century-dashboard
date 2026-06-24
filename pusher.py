"""
pusher.py — runs on the Windows PC next to the MT5 terminal.

Every PUSH_INTERVAL seconds it pulls live MT5 data, serializes it, and PUTs
snapshot.json to the private GitHub repo on the `snapshot` branch (separate
from `main` so it never triggers a Streamlit Cloud rebuild).

Config — put these in a `.pusher.env` file next to this script (git-ignored):

    GH_TOKEN=github_pat_...        # fine-grained PAT, Contents: Read+Write on the repo
    GH_REPO=your-org/century-dashboard
    GH_BRANCH=snapshot             # optional (default: snapshot)
    PUSH_INTERVAL=60               # optional seconds (default: 60)

Run:
    py pusher.py            # loop forever
    py pusher.py --once     # single push (handy for testing)
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

import data_source

# When stdout is redirected to a file (e.g. the Startup-folder launcher),
# Python uses the locale encoding (cp1252 on Windows), which can't encode the
# arrow/middot in the status lines. Force UTF-8 so logging never crashes.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

_HERE = Path(__file__).parent
load_dotenv(_HERE / ".pusher.env", override=True)        # GH_* credentials
load_dotenv(_HERE / "Credentials.env", override=False)   # MT5 credentials (for load_live)

GH_TOKEN = os.environ.get("GH_TOKEN")
GH_REPO  = os.environ.get("GH_REPO")
BRANCH   = os.getenv("GH_BRANCH", "snapshot")
PATH     = os.getenv("SNAPSHOT_PATH", "snapshot.json")
INTERVAL = int(os.getenv("PUSH_INTERVAL", "60"))

if not GH_TOKEN or not GH_REPO:
    sys.exit("ERROR: GH_TOKEN and GH_REPO must be set (see .pusher.env). Aborting.")

_API_BASE = f"https://api.github.com/repos/{GH_REPO}"
_CONTENTS = f"{_API_BASE}/contents/{PATH}"
_HEADERS  = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def _ensure_branch() -> None:
    """Create the snapshot branch from the default branch head if it doesn't exist."""
    r = requests.get(f"{_API_BASE}/branches/{BRANCH}", headers=_HEADERS, timeout=15)
    if r.status_code == 200:
        return
    repo = requests.get(_API_BASE, headers=_HEADERS, timeout=15)
    repo.raise_for_status()
    default = repo.json()["default_branch"]
    ref = requests.get(f"{_API_BASE}/git/ref/heads/{default}", headers=_HEADERS, timeout=15)
    ref.raise_for_status()
    sha = ref.json()["object"]["sha"]
    create = requests.post(
        f"{_API_BASE}/git/refs", headers=_HEADERS,
        data=json.dumps({"ref": f"refs/heads/{BRANCH}", "sha": sha}), timeout=15,
    )
    create.raise_for_status()
    print(f"Created branch '{BRANCH}' from '{default}'.")


def _current_sha() -> str | None:
    r = requests.get(_CONTENTS, headers=_HEADERS, params={"ref": BRANCH}, timeout=15)
    if r.status_code == 200:
        return r.json().get("sha")
    return None


def push_once() -> None:
    data    = data_source.load_live()
    payload = data_source.serialize(data)
    content = data_source.dumps(payload).encode("utf-8")

    body = {
        "message": f"snapshot {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')}Z",
        "content": base64.b64encode(content).decode("ascii"),
        "branch":  BRANCH,
    }
    sha = _current_sha()
    if sha:
        body["sha"] = sha

    r = requests.put(_CONTENTS, headers=_HEADERS, data=json.dumps(body), timeout=30)
    r.raise_for_status()

    n      = 0 if data.positions_df is None or data.positions_df.empty else len(data.positions_df)
    status = "MT5 OK" if data.ok else f"MT5 FAIL: {data.error.splitlines()[0] if data.error else '?'}"
    print(f"[{datetime.now():%H:%M:%S}] pushed · {status} · {n} positions · {len(content)} bytes")


def main() -> None:
    print(f"Pusher → {GH_REPO}@{BRANCH}/{PATH}  every {INTERVAL}s  (Ctrl+C to stop)")
    _ensure_branch()
    while True:
        try:
            push_once()
        except Exception:
            traceback.print_exc()
        time.sleep(INTERVAL)


if __name__ == "__main__":
    if "--once" in sys.argv:
        _ensure_branch()
        push_once()
    else:
        main()
