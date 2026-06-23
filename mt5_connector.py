"""
MT5 connection layer.
Handles initialise / login / data fetch / shutdown.
Caller must always call .disconnect() (use try/finally).
"""

from __future__ import annotations

import sys
import traceback
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pandas as pd
import config

# ── MT5 import — catch everything, record exact failure ───────────────────────

mt5              = None
_MT5_PKG         = False
_IMPORT_EXC_TYPE = None   # e.g. "ModuleNotFoundError"
_IMPORT_EXC_MSG  = None
_IMPORT_TB       = None
_MT5_VERSION     = None

try:
    import MetaTrader5 as mt5          # noqa: F401  (re-bound above)
    _MT5_PKG     = True
    _MT5_VERSION = getattr(mt5, "__version__", "unknown")
except Exception as _exc:             # DO NOT narrow to ImportError
    _IMPORT_EXC_TYPE = type(_exc).__name__
    _IMPORT_EXC_MSG  = str(_exc)
    _IMPORT_TB       = traceback.format_exc()


# ── DTOs ──────────────────────────────────────────────────────────────────────

@dataclass
class AccountInfo:
    name:         str
    server:       str
    currency:     str
    leverage:     int
    balance:      float
    equity:       float
    margin:       float
    free_margin:  float
    margin_level: float


@dataclass
class ConnectionResult:
    ok:      bool
    message: str = ""


# ── Diagnostics ───────────────────────────────────────────────────────────────

def get_import_diagnostics() -> dict:
    """Return everything known from the import-time attempt."""
    return {
        "python_exe":     sys.executable,
        "python_version": sys.version,
        "import_ok":      _MT5_PKG,
        "exc_type":       _IMPORT_EXC_TYPE,
        "exc_msg":        _IMPORT_EXC_MSG,
        "traceback":      _IMPORT_TB,
        "mt5_version":    _MT5_VERSION,
    }


def run_full_diagnostics() -> dict:
    """
    Attempt every MT5 step and record the result of each one.
    Calls mt5.shutdown() when finished.
    Safe to call at any time — does not affect the main connect() lifecycle.
    """
    diag = get_import_diagnostics()
    diag["steps"] = []

    def step(label: str, fn):
        try:
            result = fn()
            diag["steps"].append((label, True, repr(result)))
            return result
        except Exception as exc:
            tb = traceback.format_exc()
            diag["steps"].append((label, False, f"{type(exc).__name__}: {exc}\n{tb}"))
            return None

    if not _MT5_PKG:
        diag["steps"].append(
            ("import MetaTrader5", False,
             f"{_IMPORT_EXC_TYPE}: {_IMPORT_EXC_MSG}\n{_IMPORT_TB}")
        )
        return diag

    diag["steps"].append(("import MetaTrader5", True, f"version {_MT5_VERSION}"))

    init_ok = step("mt5.initialize()", mt5.initialize)
    step("mt5.last_error()", mt5.last_error)

    if init_ok:
        step("mt5.terminal_info()", mt5.terminal_info)
        step("mt5.account_info()",  mt5.account_info)

        # Try login with configured credentials
        if config.MT5_LOGIN and config.MT5_SERVER:
            login_ok = step(
                f"mt5.login({config.MT5_LOGIN}, server={config.MT5_SERVER!r})",
                lambda: mt5.login(
                    config.MT5_LOGIN,
                    password=config.MT5_PASSWORD,
                    server=config.MT5_SERVER,
                ),
            )
            step("mt5.last_error() after login", mt5.last_error)
            if login_ok:
                step("mt5.account_info() after login", mt5.account_info)

        try:
            mt5.shutdown()
            diag["steps"].append(("mt5.shutdown()", True, "OK"))
        except Exception as exc:
            diag["steps"].append(("mt5.shutdown()", False, str(exc)))

    return diag


# ── Connector ─────────────────────────────────────────────────────────────────

class MT5Connector:
    """
    Single-use connector per Streamlit rerun.
    Instantiate → connect() → fetch data → disconnect().
    """

    def __init__(self) -> None:
        self._connected = False
        self.error: str = ""

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def connect(self) -> ConnectionResult:
        if not _MT5_PKG:
            # Only say "not installed" for genuine ModuleNotFoundError
            if _IMPORT_EXC_TYPE in ("ModuleNotFoundError", "ImportError"):
                msg = (
                    "MetaTrader5 package not installed.\n"
                    f"  {_IMPORT_EXC_TYPE}: {_IMPORT_EXC_MSG}\n"
                    "  Run:  py -m pip install MetaTrader5"
                )
            else:
                msg = (
                    f"MetaTrader5 import raised {_IMPORT_EXC_TYPE}: {_IMPORT_EXC_MSG}\n"
                    "(Package is present but failed to load — see diagnostics below)"
                )
            self.error = msg
            return ConnectionResult(False, msg)

        if not config.MT5_LOGIN or not config.MT5_SERVER:
            self.error = "MT5 credentials missing in Credentials.env"
            return ConnectionResult(False, self.error)

        if not mt5.initialize():
            self.error = f"mt5.initialize() returned False  ·  last_error={mt5.last_error()}"
            return ConnectionResult(False, self.error)

        if not mt5.login(
            config.MT5_LOGIN,
            password=config.MT5_PASSWORD,
            server=config.MT5_SERVER,
        ):
            err = mt5.last_error()
            mt5.shutdown()
            self.error = f"mt5.login() failed  ·  last_error={err}"
            return ConnectionResult(False, self.error)

        self._connected = True
        return ConnectionResult(True, "Connected")

    def disconnect(self) -> None:
        if _MT5_PKG and self._connected:
            mt5.shutdown()
        self._connected = False

    # ── Data fetchers ──────────────────────────────────────────────────────

    def get_account_info(self) -> Optional[AccountInfo]:
        if not self._connected:
            return None
        raw = mt5.account_info()
        if raw is None:
            return None
        return AccountInfo(
            name         = raw.name,
            server       = raw.server,
            currency     = raw.currency,
            leverage     = raw.leverage,
            balance      = raw.balance,
            equity       = raw.equity,
            margin       = raw.margin,
            free_margin  = raw.margin_free,
            margin_level = raw.margin_level if raw.margin > 0 else 0.0,
        )

    def get_positions(self) -> pd.DataFrame:
        if not self._connected:
            return pd.DataFrame()
        raw = mt5.positions_get()
        if not raw:
            return pd.DataFrame()

        rows = []
        for p in raw:
            rows.append({
                "Symbol":         p.symbol,
                "Direction":      "Long" if p.type == 0 else "Short",
                "Volume":         p.volume,
                "Entry Price":    p.price_open,
                "Current Price":  p.price_current,
                "Unrealized P&L": round(p.profit, 2),
                "Market Value":   round(p.volume * p.price_current, 2),
                "Swap":           round(p.swap, 2),
                "Open Time":      datetime.fromtimestamp(p.time).strftime("%d %b %Y  %H:%M"),
            })

        return pd.DataFrame(rows)

    def get_daily_pnl(self) -> float:
        """
        Returns today's REALIZED P&L only — deals that CLOSED today.

        MT5 field lineage:
          history_deals_get(today, now) → deal.profit + deal.commission + deal.swap
          Only closing entries (entry != 0) and non-balance ops (type != 2) are counted.

        Floating P&L on open positions comes separately from get_positions()
        via position.profit and position.swap — it must NOT be mixed here.
        """
        if not self._connected:
            return 0.0
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        deals = mt5.history_deals_get(today, datetime.now())
        if not deals:
            return 0.0
        realized = sum(
            d.profit
            + getattr(d, "commission", 0.0)
            + getattr(d, "swap",       0.0)
            for d in deals
            if d.type != 2    # skip deposit/withdrawal balance ops
            and d.entry != 0  # skip position-opening entries (profit = 0)
        )
        return round(realized, 2)

    def get_deal_history(self, from_date: datetime = None) -> pd.DataFrame:
        """
        Fetch full deal history from MT5.
        Includes balance operations (deposits) and all trade deal closings.
        from_date defaults to 2020-01-01 to capture account inception.
        """
        if not self._connected or not _MT5_PKG:
            return pd.DataFrame()
        if from_date is None:
            from_date = datetime(2020, 1, 1)
        try:
            deals = mt5.history_deals_get(from_date, datetime.now())
        except Exception:
            return pd.DataFrame()
        if not deals:
            return pd.DataFrame()

        rows = []
        for d in deals:
            rows.append({
                "ticket":     d.ticket,
                "time":       datetime.fromtimestamp(d.time),
                "symbol":     getattr(d, "symbol", ""),
                "type":       d.type,    # 0=buy 1=sell 2=balance
                "entry":      d.entry,   # 0=in 1=out 2=inout 3=turn
                "volume":     getattr(d, "volume", 0.0),
                "price":      getattr(d, "price",  0.0),
                "profit":     d.profit,
                "commission": getattr(d, "commission", 0.0),
                "swap":       getattr(d, "swap",       0.0),
            })

        df = pd.DataFrame(rows)
        if not df.empty:
            df = df.sort_values("time").reset_index(drop=True)
        return df

    def get_symbol_rates(self, symbol: str, count: int = 252) -> pd.DataFrame:
        """
        Fetch daily OHLCV from the MT5 terminal for one symbol.
        Returns DataFrame with DatetimeIndex and a 'close' column.
        """
        if not self._connected or not _MT5_PKG:
            return pd.DataFrame()
        try:
            rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, count)
            if rates is None or len(rates) == 0:
                return pd.DataFrame()
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s")
            df = df.rename(columns={"time": "date"}).set_index("date")
            df.index = df.index.tz_localize(None)
            return df[["close"]].rename(columns={"close": "Close"})
        except Exception:
            return pd.DataFrame()
