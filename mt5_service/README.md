# MT5 live-quote bridge — start_all.bat

Brings up **Pipeline B** from `ARCHITECTURE.md`: the live-quote service
(`mt5_service.py` on `127.0.0.1:8765`) plus a **Cloudflare named tunnel** that
exposes it at a **stable** public URL for the Research Ballot app.

> The dashboards' snapshot daemon (`pusher.py`) is **not** part of this — it runs
> separately. `start_all.bat` is only the live-quote path.

## Files

| File | Committed? | What it is |
|------|-----------|------------|
| `start_all.bat` | yes | Launcher: starts the bridge, then the tunnel |
| `service.env.example` | yes | Template for the secrets/config below |
| `tunnel.yml.example` | yes | Template cloudflared named-tunnel config |
| `service.env` | **no (git-ignored)** | Real `MT5_SERVICE_KEY`, port, tunnel name, public URL |
| `tunnel.yml` | **no (git-ignored)** | Real tunnel UUID + credentials path + hostname |

## One-time setup (on the trading PC)

You need a Cloudflare account with a domain on Cloudflare. `cloudflared.exe` is
already in the repo root. Run these from the repo root — the login step opens a
browser, so run it yourself (e.g. type `! ...` in this session, or a terminal):

```bat
REM 1) authenticate cloudflared to your Cloudflare account (opens browser)
cloudflared.exe tunnel login

REM 2) create the named tunnel (prints a UUID and writes a creds JSON)
cloudflared.exe tunnel create mt5-bridge

REM 3) route a stable hostname to it (pick any subdomain on your CF domain)
cloudflared.exe tunnel route dns mt5-bridge mt5.yourdomain.com
```

Then:

1. Copy `tunnel.yml.example` → `tunnel.yml` and fill in the `<TUNNEL-UUID>`,
   the `credentials-file` path, and the `hostname` from step 3.
2. Copy `service.env.example` → `service.env` (a `service.env` with a freshly
   generated `MT5_SERVICE_KEY` is already in place) and set `PUBLIC_URL` to
   `https://mt5.yourdomain.com` and `TUNNEL_NAME=mt5-bridge`.

## Run it

```bat
mt5_service\start_all.bat
```

Two windows open (bridge + tunnel). Verify:

```bat
curl http://localhost:8765/health
curl https://mt5.yourdomain.com/health
```

Both should return `{"status":"connected","mt5_connected":true,...}`.

## Wire the Research Ballot app

In the Ballot app's Vercel env (apex-platform project), set:

- `MT5_SERVICE_URL = https://mt5.yourdomain.com`
- `MT5_SERVICE_KEY = ` *(the same value as in `service.env`)*

`/health` is public; `/quote/{symbol}` and `/quant/{symbol}` require the
`x-api-key` header to equal `MT5_SERVICE_KEY`.
