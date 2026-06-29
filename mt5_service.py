"""
Local HTTP bridge so the Research-Ballot Next.js app can read live MT5 data.

The Next routes (app/api/mt5/*) proxy to this service at MT5_SERVICE_URL
(default http://localhost:8765) and expect:
    GET /health                  -> {status, mt5_connected}
    GET /quote/{symbol}          -> Mt5Quote          (x-api-key)
    GET /quant/{symbol}?dir=...  -> Mt5QuantData       (x-api-key)   [not built yet -> 501]

Runs on the Windows box that has the MT5 terminal (MetaTrader5 only runs there).
Single-threaded HTTPServer on purpose: MT5 is process-global state, so serializing
requests avoids races without needing a lock.

    py mt5_service.py            # serve on :8765
    py mt5_service.py --selfcheck

# ponytail: one persistent MT5 login reused across requests; reconnect on failure.
#           Upgrade to a pool only if a single Windows box can't keep up (it can).
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

import config
from mt5_connector import MT5Connector, mt5, _MT5_PKG

PORT = int(os.getenv("MT5_SERVICE_PORT", "8765"))
API_KEY = os.getenv("MT5_SERVICE_KEY", "")

# Lazily-created, reused connection. MT5 login is global to the process.
_conn: MT5Connector | None = None


def _get_conn() -> MT5Connector | None:
    """Connect once, reuse, reconnect if the session dropped."""
    global _conn
    if _conn is not None and mt5 is not None and mt5.account_info() is not None:
        return _conn
    c = MT5Connector()
    res = c.connect()
    if not res.ok:
        _conn = None
        return None
    _conn = c
    return _conn


def _shape_quote(tick, info, now_epoch: float) -> dict:
    """Pure tick/symbol-info -> Mt5Quote dict. Kept pure so it's testable."""
    bid, ask = float(tick.bid), float(tick.ask)
    mid = (bid + ask) / 2 if bid and ask else (bid or ask)
    dt = datetime.fromtimestamp(tick.time, tz=timezone.utc)
    # ponytail: "is the market open" via tick freshness (no clean MT5 API for it).
    #           Fresh tick (<2min) => OPEN. Good enough for a submission gate.
    is_open = (now_epoch - tick.time) < 120
    return {
        "symbol": info.name,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "spread": ask - bid,
        "server_time": dt.isoformat(),
        "market_status": "OPEN" if is_open else "CLOSED",
        "market_session": "Regular" if is_open else "Closed",
        "exchange": getattr(info, "exchange", "") or "—",
        "time_zone": "UTC (broker)",
        "digits": int(info.digits),
        "trading_day": dt.strftime("%Y-%m-%d"),
        "week_number": dt.isocalendar()[1],
        "description": getattr(info, "description", "") or info.name,
    }


def _quote(symbol: str) -> tuple[int, dict]:
    conn = _get_conn()
    if conn is None:
        return 503, {"detail": "MT5 not connected"}
    if not mt5.symbol_select(symbol, True):
        return 404, {"detail": f"Unknown symbol: {symbol}"}
    info = mt5.symbol_info(symbol)
    # First select on an unsubscribed symbol can return an empty tick before the
    # terminal pulls one — retry briefly instead of failing with a spurious 404.
    tick = mt5.symbol_info_tick(symbol)
    for _ in range(10):
        if tick is not None and (tick.bid or tick.ask):
            break
        time.sleep(0.1)
        tick = mt5.symbol_info_tick(symbol)
    if info is None or tick is None or (tick.bid == 0 and tick.ask == 0):
        return 404, {"detail": f"No quote for {symbol}"}
    return 200, _shape_quote(tick, info, datetime.now(tz=timezone.utc).timestamp())


def _health() -> tuple[int, dict]:
    conn = _get_conn()
    if conn is None:
        return 503, {"status": "disconnected", "mt5_connected": False}
    acct = mt5.account_info()
    return 200, {
        "status": "connected",
        "mt5_connected": acct is not None,
        "login": getattr(acct, "login", None),
        "server": getattr(acct, "server", None),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authed(self) -> bool:
        return not API_KEY or self.headers.get("x-api-key") == API_KEY

    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        parts = [p for p in u.path.split("/") if p]

        if parts == ["health"]:
            return self._send(*_health())

        if not self._authed():
            return self._send(401, {"detail": "bad api key"})

        if len(parts) == 2 and parts[0] == "quote":
            return self._send(*_quote(parts[1].upper()))

        if len(parts) == 2 and parts[0] == "quant":
            # ponytail: ~50-field TA engine not built yet; frontend skips a non-200.
            #           Build from MT5Connector.get_symbol_rates when needed.
            return self._send(501, {"detail": "quant not implemented yet"})

        return self._send(404, {"detail": "not found"})

    def log_message(self, *args) -> None:  # quieter; comment out to debug
        pass


def _selfcheck() -> None:
    class T:  # fake tick
        bid, ask, time = 100.0, 100.5, int(datetime.now(tz=timezone.utc).timestamp())

    class I:  # fake symbol_info
        name, digits, exchange, description = "TEST", 2, "NASDAQ", "Test Co"

    q = _shape_quote(T(), I(), datetime.now(tz=timezone.utc).timestamp())
    assert q["mid"] == 100.25, q["mid"]
    assert round(q["spread"], 2) == 0.5, q["spread"]
    assert q["market_status"] == "OPEN", q["market_status"]
    assert q["digits"] == 2 and q["symbol"] == "TEST"
    stale = _shape_quote(T(), I(), datetime.now(tz=timezone.utc).timestamp() + 300)
    assert stale["market_status"] == "CLOSED", stale["market_status"]
    print("selfcheck OK")


if __name__ == "__main__":
    import sys

    if "--selfcheck" in sys.argv:
        _selfcheck()
    elif not _MT5_PKG:
        print("MetaTrader5 not importable — run this on the Windows box with the MT5 terminal.")
        sys.exit(1)
    else:
        print(f"MT5 bridge on http://localhost:{PORT}  (api-key {'set' if API_KEY else 'OFF'})")
        HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
