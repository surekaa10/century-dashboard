# Architecture

There is **one source of truth** — the MetaTrader 5 terminal on the Windows
trading PC (Century Financial account `910001`) — feeding **two separate apps**
through **two different pipelines**.

## The data origin

The MT5 terminal holds live prices, open positions, and trade history. A Python
access layer (`mt5_connector.py`) reads it; `data_source.py` packages it into a
tidy bundle (account, positions, today's P&L, deal history, price histories).

## Pipeline A — the Portfolio Dashboard (batch, every 60s)

- `pusher.py` runs in a loop on the PC: pull live data → flatten to JSON →
  commit `snapshot.json` to a dedicated **`snapshot`** GitHub branch (kept off
  `main` so it never triggers rebuilds).
- Two read-only frontends consume that snapshot:
  - **Streamlit dashboard** (`dashboard.py`) on Streamlit Cloud.
  - **Next.js dashboard** (`web/`) on Vercel — its `/api/snapshot` route fetches
    the file from GitHub (token stays server-side) and the browser polls every 30s.
- Run locally with no cloud secrets, `dashboard.py` skips GitHub and reads MT5
  directly.

## Pipeline B — the Research Ballot (live, on demand)

- `mt5_service.py` is a small HTTP service (port 8765) wrapping the same
  connector, exposing live `/health` and `/quote`.
- `cloudflared` tunnels it to a public URL.
- The **Research Ballot** app (separate `apex-platform` repo, Vercel) calls it
  through `/api/mt5/*` so analysts get a live price the moment they submit/score
  an idea. This app has its own database + login/MFA for the research-voting
  workflow — MT5 only supplies the live price.

**Entry points:** `dashboard.py` (Streamlit), `web/` page → API routes (Next
dashboard), Research Ballot login → dashboard pages, plus two background daemons
on the PC: `pusher.py` and `mt5_service.py`.

## Flowchart

```mermaid
flowchart TD
    subgraph PC["🖥️ Trading PC (Windows, always on)"]
        MT5["Trading terminal<br/>(live prices, open trades, history)"]
        CONN["Data reader<br/>collects account, positions & price history"]
        MT5 --> CONN

        subgraph PUSH["Publisher (runs every 60 seconds)"]
            P1["Take a fresh snapshot of the portfolio"]
            P2["Save it as a single data file"]
        end
        CONN --> P1 --> P2

        subgraph BRIDGE["Live price service (answers on demand)"]
            B1["Wait for a price request"]
            B2["Look up the live quote & send it back"]
        end
        CONN --> B1 --> B2
    end

    STORE["📦 Snapshot store<br/>(private GitHub 'snapshot' branch)"]
    P2 -->|"upload latest snapshot"| STORE

    TUNNEL["🔌 Secure public doorway<br/>(tunnel + secret key)"]
    B2 -->|"live quote"| TUNNEL

    subgraph CLOUD["☁️ Cloud apps"]
        subgraph DASHA["Portfolio Dashboard A (Streamlit)"]
            D1["Download newest snapshot"]
            D2["Run risk & performance analytics"]
            D3["Show charts & tables"]
            D1 --> D2 --> D3
        end

        subgraph DASHB["Portfolio Dashboard B (Next.js / Vercel)"]
            W1["Browser asks for latest data every 30s"]
            W2["Server fetches snapshot (key stays hidden)"]
            W3["Render dashboard tabs & KPIs"]
            W1 --> W2 --> W3
        end

        subgraph BALLOT["Research Ballot app (Vercel)"]
            L1["Analyst logs in (password + MFA)"]
            L2["Open a trade idea / submit form"]
            L3["Request live price for the ticker"]
            L4["Stamp the idea with the live quote"]
            L5["Save idea & votes in its own database"]
            L1 --> L2 --> L3
            L4 --> L5
        end
    end

    STORE -->|"read snapshot"| D1
    STORE -->|"read snapshot"| W2
    L3 -->|"price request"| TUNNEL
    TUNNEL -->|"live quote"| L4

    subgraph PEOPLE["👥 Users"]
        U1["Risk / PM team<br/>watch the portfolio"]
        U2["Research analysts<br/>submit & vote on ideas"]
    end

    D3 --> U1
    W3 --> U1
    L5 --> U2

    classDef src fill:#1e293b,stroke:#38bdf8,color:#e2e8f0
    classDef store fill:#422006,stroke:#f59e0b,color:#fde68a
    classDef app fill:#0f291e,stroke:#22c55e,color:#bbf7d0
    class MT5,CONN src
    class STORE,TUNNEL store
    class DASHA,DASHB,BALLOT app
```

## Label → file map

| Diagram step | Actual code |
|---|---|
| Trading terminal / Data reader | MT5 terminal · `mt5_connector.py`, `data_source.py` |
| Publisher (every 60s) | `pusher.py` |
| Live price service | `mt5_service.py` (port 8765) |
| Secure public doorway | `cloudflared` tunnel + `MT5_SERVICE_KEY` |
| Snapshot store | GitHub `snapshot` branch → `snapshot.json` |
| Dashboard A | `dashboard.py` (Streamlit Cloud) |
| Dashboard B | `web/` → `app/api/snapshot/route.ts` (Vercel) |
| Research Ballot app | `apex-platform` repo → `app/api/mt5/*`, Prisma DB, auth |
