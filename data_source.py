"""
Data-source abstraction — the dashboard needs exactly five things, all
originally from MT5:

    account         : AccountInfo
    positions_df    : DataFrame
    today_realized  : float
    deals_df        : DataFrame
    symbol_rates    : dict[str, DataFrame]   # DatetimeIndex + 'Close' column

This module:
  • load_live()                  → fetch the five from a running MT5 terminal
  • serialize() / deserialize()  → those five  ⇄  a JSON-safe dict
  • load_snapshot_from_github()  → fetch + deserialize a snapshot (cloud path)

The pusher (on the Windows PC) uses load_live() + serialize().
The Streamlit Cloud frontend uses load_snapshot_from_github().
Run locally with neither configured → load_live() (unchanged behaviour).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from mt5_connector import MT5Connector, AccountInfo

SNAPSHOT_VERSION = 1


@dataclass
class PortfolioData:
    account:        Optional[AccountInfo]
    positions_df:   pd.DataFrame
    today_realized: float
    deals_df:       pd.DataFrame
    symbol_rates:   dict
    generated_at:   datetime          # tz-aware UTC — when MT5 data was captured
    ok:             bool = True
    error:          str  = ""


# ── Live source (local / pusher) ─────────────────────────────────────────────

def load_live() -> PortfolioData:
    """Pull the five data objects from a running MT5 terminal."""
    conn = MT5Connector()
    res  = conn.connect()
    now  = datetime.now(timezone.utc)
    if not res.ok:
        return PortfolioData(
            account=None, positions_df=pd.DataFrame(), today_realized=0.0,
            deals_df=pd.DataFrame(), symbol_rates={}, generated_at=now,
            ok=False, error=res.message,
        )
    try:
        account        = conn.get_account_info()
        positions_df   = conn.get_positions()
        today_realized = conn.get_daily_pnl()
        deals_df       = conn.get_deal_history()
        symbols        = positions_df["Symbol"].unique().tolist() if not positions_df.empty else []
        symbol_rates   = {s: conn.get_symbol_rates(s) for s in symbols}
        return PortfolioData(
            account=account, positions_df=positions_df, today_realized=today_realized,
            deals_df=deals_df, symbol_rates=symbol_rates, generated_at=now, ok=True,
        )
    finally:
        conn.disconnect()


# ── Serialization ─────────────────────────────────────────────────────────────

def _records(df: Optional[pd.DataFrame]) -> list:
    return [] if df is None or df.empty else df.to_dict(orient="records")


def _json_default(o):
    """Coerce numpy / datetime scalars so json.dumps never chokes."""
    if isinstance(o, datetime):
        return o.isoformat()
    if hasattr(o, "item"):          # numpy scalar
        return o.item()
    raise TypeError(f"Not JSON-serializable: {type(o)}")


def serialize(data: PortfolioData) -> dict:
    """PortfolioData → JSON-safe dict."""
    deals = data.deals_df.copy() if data.deals_df is not None else pd.DataFrame()
    if not deals.empty and "time" in deals.columns:
        deals["time"] = pd.to_datetime(deals["time"]).map(lambda t: t.isoformat())

    rates = {}
    for sym, rdf in (data.symbol_rates or {}).items():
        if rdf is None or rdf.empty or "Close" not in rdf.columns:
            continue
        idx = pd.to_datetime(rdf.index)
        rates[sym] = {
            "index": [t.isoformat() for t in idx],
            "Close": [float(x) for x in rdf["Close"].tolist()],
        }

    return {
        "version":        SNAPSHOT_VERSION,
        "generated_at":   data.generated_at.isoformat(),
        "account":        asdict(data.account) if data.account else None,
        "positions":      _records(data.positions_df),
        "today_realized": float(data.today_realized),
        "deals":          _records(deals),
        "symbol_rates":   rates,
        "ok":             data.ok,
        "error":          data.error,
    }


def dumps(payload: dict) -> str:
    """Compact JSON string, numpy-safe."""
    return json.dumps(payload, separators=(",", ":"), default=_json_default)


def deserialize(payload: dict) -> PortfolioData:
    """JSON-safe dict → PortfolioData."""
    account = AccountInfo(**payload["account"]) if payload.get("account") else None

    positions_df = pd.DataFrame(payload.get("positions", []))

    deals_df = pd.DataFrame(payload.get("deals", []))
    if not deals_df.empty and "time" in deals_df.columns:
        deals_df["time"] = pd.to_datetime(deals_df["time"])

    rates = {}
    for sym, blob in (payload.get("symbol_rates") or {}).items():
        idx = pd.to_datetime(blob["index"])
        rates[sym] = pd.DataFrame({"Close": blob["Close"]}, index=idx)

    gen = pd.to_datetime(payload.get("generated_at"))
    gen = gen.to_pydatetime() if gen is not None else datetime.now(timezone.utc)
    if gen.tzinfo is None:
        gen = gen.replace(tzinfo=timezone.utc)

    return PortfolioData(
        account=account, positions_df=positions_df,
        today_realized=float(payload.get("today_realized", 0.0)),
        deals_df=deals_df, symbol_rates=rates, generated_at=gen,
        ok=bool(payload.get("ok", True)), error=payload.get("error", ""),
    )


# ── Snapshot source (cloud frontend) ─────────────────────────────────────────

def load_snapshot_from_github(repo: str, token: str,
                              branch: str = "snapshot",
                              path: str = "snapshot.json") -> PortfolioData:
    """
    Fetch snapshot.json from a (private) GitHub repo branch via the Contents API
    and deserialize it. Raises on network/auth failure — caller handles display.
    """
    import requests  # lazy: not needed on the pusher path

    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    r = requests.get(url, headers=headers, params={"ref": branch}, timeout=20)
    r.raise_for_status()
    payload = json.loads(r.text)
    return deserialize(payload)
