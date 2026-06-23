# Century Research — Portfolio Risk Dashboard

Live MT5 portfolio risk dashboard (Streamlit). Because the `MetaTrader5`
package only works on Windows with the MT5 terminal running, the app is split
into two halves:

```
┌─ Windows PC (MT5 terminal) ─┐        ┌─ Streamlit Community Cloud ─┐
│  pusher.py  ── snapshot ────┼─ GitHub┼──▶ dashboard.py (public URL) │
│  (loops every 60s)          │ private│    reads snapshot, no MT5    │
└─────────────────────────────┘  repo  └─────────────────────────────┘
                              `snapshot` branch
```

- **`pusher.py`** runs on the trading PC, pulls live MT5 data, and pushes
  `snapshot.json` to the private GitHub repo on the **`snapshot`** branch.
- **`dashboard.py`** runs free on Streamlit Cloud, reads the snapshot, and runs
  the exact same analytics. Run it locally with no GitHub secrets and it talks
  to MT5 directly (unchanged behaviour).

Secrets (`Credentials.env`, tokens) are **git-ignored** and never leave your PC.

---

## Files

| File | Runs on | Purpose |
|------|---------|---------|
| `dashboard.py` | Cloud + local | Streamlit UI |
| `data_source.py` | both | live-MT5 ⇄ JSON-snapshot abstraction |
| `pusher.py` | Windows PC | publishes snapshots to GitHub |
| `mt5_connector.py` / `config.py` | both | MT5 access + config |
| `position_analytics.py` / `portfolio_overview.py` | both | analytics/charts |
| `requirements.txt` | Cloud | frontend deps (no MetaTrader5) |
| `requirements-pusher.txt` | Windows PC | pusher deps (with MetaTrader5) |

---

## One-time setup

### 1. Create the private GitHub repo and push this folder
```powershell
cd C:\Users\devanshi.agrawal\century-dashboard
git init
git add .
git commit -m "Century portfolio dashboard"
git branch -M main
# create an EMPTY private repo on github.com first, then:
git remote add origin https://github.com/<you>/century-dashboard.git
git push -u origin main
```

### 2. Create a fine-grained Personal Access Token
GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate:
- **Repository access:** only `century-dashboard`
- **Permissions → Contents:** **Read and write**
- Copy the `github_pat_...` value.

(Optionally make a second **Read-only** token for the cloud frontend.)

### 3. Configure + run the pusher (on the trading PC)
```powershell
copy .pusher.env.example .pusher.env   # then edit GH_TOKEN / GH_REPO
py -m pip install -r requirements-pusher.txt
py pusher.py --once                    # smoke test — should print "pushed"
py pusher.py                           # run the loop
```
The pusher auto-creates the `snapshot` branch on first run.

### 4. Deploy the frontend on Streamlit Community Cloud
1. Go to https://share.streamlit.io → **New app** → pick this repo,
   branch **`main`**, main file **`dashboard.py`**.
2. **Advanced settings → Secrets** — paste (see `secrets.toml.example`):
   ```toml
   GH_REPO   = "<you>/century-dashboard"
   GH_TOKEN  = "github_pat_..."   # the Read token
   GH_BRANCH = "snapshot"
   ```
3. Deploy. The app reads the latest snapshot; the header shows
   "updated Ns ago" and flags **STALE** if older than 5 min.

### 5. Keep the pusher running (Windows Task Scheduler)
Run on logon so the snapshot stays fresh:
```powershell
$py  = (Get-Command py).Source
$dir = "C:\Users\devanshi.agrawal\century-dashboard"
$act = New-ScheduledTaskAction -Execute $py -Argument "pusher.py" -WorkingDirectory $dir
$trg = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Century Dashboard Pusher" -Action $act -Trigger $trg
```

---

## Run locally (live MT5, no cloud)
```powershell
py -m streamlit run dashboard.py
```
With no `GH_*` secrets present it connects straight to the MT5 terminal.

## Notes
- The snapshot lives on the **`snapshot`** branch on purpose — Streamlit Cloud
  redeploys on every push to its tracked branch (`main`), so frequent snapshot
  commits must not land there.
- Snapshot freshness = pusher interval (default 60s) + cloud cache (30s).
