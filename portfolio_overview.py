"""
Portfolio Overview — hero metrics, equity curve, theme allocation.
Pure pandas + Plotly. No Streamlit imports.

Data priority:
  1. MT5 deal history (actual account P&L)
  2. yfinance price reconstruction (fallback, labelled "Estimated")
"""
from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
from datetime import datetime, timedelta

try:
    import yfinance as yf
    _YF = True
except ImportError:
    _YF = False

# ── Theme / sector mapping ────────────────────────────────────────────────────

THEMES: dict[str, str] = {
    "NVDA":     "Semiconductors",
    "DRAM":     "Semiconductors",
    "AVGO":     "Semiconductors",
    "MSFT":     "Technology",
    "AMZN":     "Technology",
    "GOOGL":    "Technology",
    "LLY":      "Healthcare",
    "RHM.DE":   "Defence",
    "GC=F":     "Commodities",
    "DX-Y.NYB": "Macro / FX",
}

THEME_COLORS: dict[str, str] = {
    "Semiconductors": "#a78bfa",
    "Technology":     "#38bdf8",
    "Healthcare":     "#10b981",
    "Defence":        "#fb923c",
    "Commodities":    "#fbbf24",
    "Macro / FX":     "#94a3b8",
    "Other":          "#475569",
}

# ── GICS classification ───────────────────────────────────────────────────────
# Manual overrides for instruments yfinance can't reliably classify
# (futures, FX indices, non-US equities).  For any symbol NOT listed here,
# get_gics_info() falls back to yf.Ticker(sym).info so new positions
# auto-classify without any code change.

_GICS_OVERRIDES: dict[str, tuple[str, str, str]] = {
    # symbol → (GICS Sector, GICS Industry Group, GICS Industry)
    "NVDA":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "AVGO":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "DRAM":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "AMD":      ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "QCOM":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "INTC":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductors"),
    "TSM":      ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductor Equipment"),
    "ASML":     ("Information Technology", "Semiconductors & Semiconductor Equipment", "Semiconductor Equipment"),
    "MSFT":     ("Information Technology", "Software & Services",                      "Systems Software"),
    "ORCL":     ("Information Technology", "Software & Services",                      "Application Software"),
    "CRM":      ("Information Technology", "Software & Services",                      "Application Software"),
    "AAPL":     ("Information Technology", "Technology Hardware & Equipment",           "Technology Hardware, Storage & Peripherals"),
    "DELL":     ("Information Technology", "Technology Hardware & Equipment",           "Technology Hardware, Storage & Peripherals"),
    "HPQ":      ("Information Technology", "Technology Hardware & Equipment",           "Technology Hardware, Storage & Peripherals"),
    "AMZN":     ("Consumer Discretionary", "Consumer Discretionary Distribution & Retail", "Internet & Direct Marketing Retail"),
    "TSLA":     ("Consumer Discretionary", "Automobiles & Components",                  "Automobile Manufacturers"),
    "GOOGL":    ("Communication Services", "Media & Entertainment",                    "Interactive Media & Services"),
    "GOOG":     ("Communication Services", "Media & Entertainment",                    "Interactive Media & Services"),
    "META":     ("Communication Services", "Media & Entertainment",                    "Interactive Media & Services"),
    "NFLX":     ("Communication Services", "Media & Entertainment",                    "Movies & Entertainment"),
    "DIS":      ("Communication Services", "Media & Entertainment",                    "Movies & Entertainment"),
    "LLY":      ("Health Care",            "Pharmaceuticals, Biotechnology & Life Sciences", "Pharmaceuticals"),
    "PFE":      ("Health Care",            "Pharmaceuticals, Biotechnology & Life Sciences", "Pharmaceuticals"),
    "AMGN":     ("Health Care",            "Pharmaceuticals, Biotechnology & Life Sciences", "Biotechnology"),
    "MRNA":     ("Health Care",            "Pharmaceuticals, Biotechnology & Life Sciences", "Biotechnology"),
    "UNH":      ("Health Care",            "Health Care Equipment & Services",              "Managed Health Care"),
    "JPM":      ("Financials",             "Banks",                                         "Diversified Banks"),
    "BAC":      ("Financials",             "Banks",                                         "Diversified Banks"),
    "GS":       ("Financials",             "Diversified Financials",                        "Investment Banking & Brokerage"),
    "MS":       ("Financials",             "Diversified Financials",                        "Investment Banking & Brokerage"),
    "BLK":      ("Financials",             "Diversified Financials",                        "Asset Management & Custody Banks"),
    "RHM.DE":   ("Industrials",            "Capital Goods",                                 "Aerospace & Defence"),
    "BA":       ("Industrials",            "Capital Goods",                                 "Aerospace & Defence"),
    "RTX":      ("Industrials",            "Capital Goods",                                 "Aerospace & Defence"),
    "LMT":      ("Industrials",            "Capital Goods",                                 "Aerospace & Defence"),
    "CAT":      ("Industrials",            "Capital Goods",                                 "Construction Machinery & Heavy Trucks"),
    "XOM":      ("Energy",                 "Energy",                                        "Integrated Oil & Gas"),
    "CVX":      ("Energy",                 "Energy",                                        "Integrated Oil & Gas"),
    "GC=F":     ("Commodities",            "Precious Metals",                               "Gold"),
    "SI=F":     ("Commodities",            "Precious Metals",                               "Silver"),
    "CL=F":     ("Commodities",            "Energy",                                        "Crude Oil"),
    "NG=F":     ("Commodities",            "Energy",                                        "Natural Gas"),
    "DX-Y.NYB": ("Macro / FX",            "Currency Index",                                "US Dollar Index"),
    "ES=F":     ("Macro / FX",            "Equity Index",                                  "S&P 500 Futures"),
    "NQ=F":     ("Macro / FX",            "Equity Index",                                  "Nasdaq 100 Futures"),
    "YM=F":     ("Macro / FX",            "Equity Index",                                  "DJIA Futures"),
    "EURUSD=X": ("Macro / FX",            "Currency",                                      "EUR/USD"),
    "GBPUSD=X": ("Macro / FX",            "Currency",                                      "GBP/USD"),
    "USDJPY=X": ("Macro / FX",            "Currency",                                      "USD/JPY"),
}


def get_gics_info(symbol: str) -> tuple[str, str, str]:
    """
    Return (GICS Sector, GICS Industry Group, GICS Industry) for a symbol.
    Priority: _GICS_OVERRIDES → yfinance .info lookup → ("Other", "Other", "Other").
    Callers should cache the result (e.g. @st.cache_data in dashboard.py).
    """
    override = _GICS_OVERRIDES.get(symbol)
    if override is not None:
        if len(override) == 3:
            return override
        return override[0], override[1], override[1]   # backcompat if 2-tuple slipped in

    # Try stripping common MT5 broker suffixes (e.g. "NVDAm" → "NVDA")
    stripped = symbol.rstrip("m").rstrip(".r").rstrip(".e")
    if stripped != symbol and stripped in _GICS_OVERRIDES:
        return get_gics_info(stripped)

    if _YF:
        try:
            info          = yf.Ticker(symbol).info
            sector        = (info.get("sector")        or "").strip() or "Other"
            industry_grp  = (info.get("industryDisp")  or info.get("industry") or "").strip() or sector
            industry      = (info.get("industry")      or "").strip() or industry_grp
            if sector != "Other":
                return sector, industry_grp, industry
        except Exception:
            pass
    return "Other", "Other", "Other"

PERIODS: dict[str, int] = {
    "1D": 1, "1W": 7, "1M": 30,
    "3M": 90, "6M": 180, "1Y": 365, "All": 9999,
}

# ── Chart constants ───────────────────────────────────────────────────────────

_CARD  = "#0d1321"
_GRID  = "rgba(255,255,255,0.04)"
_TEXT  = "#94a3b8"
_HDR   = "#e2e8f0"
_GREEN = "#10b981"
_RED   = "#f43f5e"
_FONT  = dict(family="JetBrains Mono, monospace", color=_TEXT, size=11)


# ── Hero metrics ──────────────────────────────────────────────────────────────

def compute_hero_metrics(
    positions_df: pd.DataFrame,
    account,
    today_realized: float = 0.0,
) -> dict:
    """
    All live metrics sourced directly from MT5. Data lineage:

    portfolio_value    → account_info().equity
    cash_balance       → account_info().balance
    floating_pnl       → sum(position.profit)          via positions_get()
    total_swap         → sum(position.swap)             via positions_get()
    net_pnl            → sum(position.profit + .swap)   via positions_get()
    allocated_capital  → sum(position.volume × position.price_open)
    today_realized     → sum(deal.profit+commission+swap for closing deals today)
    return_on_equity   → floating_pnl / equity × 100   (derived)
    return_on_allocated→ floating_pnl / allocated × 100 (derived)
    """
    empty = {
        "portfolio_value": 0.0, "allocated_capital": 0.0,
        "cash_balance": 0.0, "floating_pnl": 0.0, "net_pnl": 0.0,
        "total_swap": 0.0, "today_realized": today_realized,
        "return_on_equity": 0.0, "return_on_allocated": 0.0,
        "n_holdings": 0, "currency": "USD",
    }
    if account is None:
        return empty

    if positions_df.empty:
        return {
            **empty,
            "portfolio_value": account.equity,
            "cash_balance":    account.balance,
            "currency":        account.currency,
        }

    # MT5 positions_get() fields
    allocated    = (positions_df["Volume"] * positions_df["Entry Price"]).sum()
    floating_pnl = positions_df["Unrealized P&L"].sum()   # position.profit only
    total_swap   = positions_df["Swap"].sum()              # position.swap only
    net_pnl      = floating_pnl + total_swap               # profit + swap

    equity = account.equity

    return {
        "portfolio_value":    round(equity,       2),
        "cash_balance":       round(account.balance, 2),
        "allocated_capital":  round(allocated,    2),
        "floating_pnl":       round(floating_pnl, 2),   # position.profit
        "total_swap":         round(total_swap,   2),   # position.swap
        "net_pnl":            round(net_pnl,      2),   # profit + swap
        "today_realized":     round(today_realized, 2), # closed deals today
        "return_on_equity":   round(floating_pnl / equity   * 100, 4) if equity   > 0 else 0.0,
        "return_on_allocated":round(floating_pnl / allocated* 100, 4) if allocated> 0 else 0.0,
        "n_holdings":         int(positions_df["Symbol"].nunique()),
        "currency":           account.currency,
    }


# ── MT5 deal-history equity curve ─────────────────────────────────────────────

def build_equity_from_deals(
    deals_df: pd.DataFrame,
    current_equity: float,
) -> tuple[pd.DataFrame, bool]:
    """
    Build the account equity curve from MT5 deal history.

    Each deal contributes: profit + commission + swap
    (balance-operation deals, type=2, carry the deposit amount in profit).

    The running cumulative sum gives the realized balance at each moment.
    Today's last value is anchored to current_equity so unrealized P&L is
    visible at the right-hand edge of the chart.

    Returns (equity_df, is_real).
    equity_df columns: date (Timestamp), value (float).
    is_real = True  → sourced from actual MT5 history.
    is_real = False → no deals found; caller should use fallback.
    """
    if deals_df is None or deals_df.empty:
        return pd.DataFrame(), False

    df = deals_df.copy()
    df["date"] = pd.to_datetime(df["time"]).dt.normalize()

    # Net financial impact of each deal (profit already nets commissions in MT5
    # but commission + swap are separate fields — add all three)
    df["net"] = df["profit"] + df["commission"] + df["swap"]
    df = df.sort_values("time")
    df["running"] = df["net"].cumsum()

    # Last running value for each calendar day
    daily = df.groupby("date")["running"].last()

    # Forward-fill across weekends / public holidays to today
    today     = pd.Timestamp.now().normalize()
    inception = daily.index.min()
    full_idx  = pd.date_range(inception, today, freq="D")
    daily     = daily.reindex(full_idx).ffill()

    # Anchor the final point to current equity (includes open unrealised P&L)
    daily.iloc[-1] = current_equity

    result = pd.DataFrame({"date": daily.index, "value": daily.values}).dropna()
    return result, True


# ── yfinance fallback (labelled as estimated) ─────────────────────────────────

def _fetch_yf_prices(symbols: list[str], days: int = 365) -> pd.DataFrame:
    """Download daily close prices from yfinance for the given symbols."""
    if not _YF or not symbols:
        return pd.DataFrame()

    end   = datetime.now()
    start = end - timedelta(days=days + 10)
    frames: dict[str, pd.Series] = {}

    for sym in symbols:
        try:
            hist = yf.Ticker(sym).history(start=start, end=end)
            if not hist.empty and "Close" in hist.columns:
                s = hist["Close"].dropna()
                if len(s) >= 2:
                    frames[sym] = s
        except Exception:
            pass

    if not frames:
        return pd.DataFrame()

    df = pd.DataFrame(frames)
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return df.ffill().bfill()


def build_equity_from_prices(
    positions_df: pd.DataFrame,
    account_balance: float,
    prices_df: pd.DataFrame,
) -> tuple[pd.DataFrame, bool]:
    """
    Fallback: reconstruct portfolio value from yfinance prices + current holdings.
    value(t) = account_balance - allocated_capital + Σ(vol_i × price_i(t))
    Returns (equity_df, False).  is_real always False — this is estimated.
    """
    if positions_df.empty or prices_df.empty:
        return pd.DataFrame(), False

    symbols = positions_df["Symbol"].unique().tolist()
    avail   = [s for s in symbols if s in prices_df.columns]
    if not avail:
        return pd.DataFrame(), False

    sub          = positions_df[positions_df["Symbol"].isin(avail)]
    vol_by_sym   = sub.groupby("Symbol")["Volume"].sum()
    entry_by_sym = sub.groupby("Symbol").apply(
        lambda g: (g["Entry Price"] * g["Volume"]).sum() / g["Volume"].sum()
    )

    allocated      = (vol_by_sym * entry_by_sym).sum()
    cash_component = account_balance - allocated

    port_series = (
        prices_df[avail]
        .multiply(vol_by_sym.reindex(avail), axis="columns")
        .sum(axis=1)
        + cash_component
    )

    result = (
        pd.DataFrame({"date": port_series.index, "value": port_series.values})
        .dropna()
        .reset_index(drop=True)
    )
    return result, False


def get_equity_curve(
    deals_df: pd.DataFrame,
    positions_df: pd.DataFrame,
    account_balance: float,
    current_equity: float,
    symbol_rates: dict,         # {symbol: DataFrame(Close)} from MT5
) -> tuple[pd.DataFrame, bool]:
    """
    Master function: try MT5 deal history first, fall back to price reconstruction.
    Returns (equity_df, is_real).
    """
    # Primary: MT5 deal history
    equity_df, is_real = build_equity_from_deals(deals_df, current_equity)
    if is_real and not equity_df.empty:
        return equity_df, True

    # Fallback: price-based reconstruction
    # Merge MT5 symbol rates + yfinance for any gaps
    if not positions_df.empty:
        symbols = positions_df["Symbol"].unique().tolist()

        # Build price DataFrame: MT5 rates first
        price_frames: dict[str, pd.Series] = {}
        for sym in symbols:
            if sym in symbol_rates and not symbol_rates[sym].empty:
                df_r = symbol_rates[sym]
                if "Close" in df_r.columns:
                    price_frames[sym] = df_r["Close"]

        # Fill remaining from yfinance
        missing = [s for s in symbols if s not in price_frames]
        if missing:
            yf_prices = _fetch_yf_prices(missing, days=365)
            for sym in missing:
                if sym in yf_prices.columns:
                    price_frames[sym] = yf_prices[sym]

        if price_frames:
            prices_df = pd.DataFrame(price_frames)
            prices_df.index = pd.to_datetime(prices_df.index).tz_localize(None)
            prices_df = prices_df.ffill().bfill()
            equity_df, _ = build_equity_from_prices(
                positions_df, account_balance, prices_df
            )
            if not equity_df.empty:
                return equity_df, False

    return pd.DataFrame(), False


# ── Period filtering ──────────────────────────────────────────────────────────

def filter_by_period(equity_df: pd.DataFrame, period: str) -> pd.DataFrame:
    if equity_df.empty:
        return equity_df
    days = PERIODS.get(period, 365)
    if days >= 9999:
        return equity_df
    cutoff   = pd.Timestamp.now().normalize() - pd.Timedelta(days=days)
    filtered = equity_df[equity_df["date"] >= cutoff].reset_index(drop=True)
    return filtered if not filtered.empty else equity_df


# ── Charts ────────────────────────────────────────────────────────────────────

def chart_equity_curve(
    equity_df: pd.DataFrame,
    period: str = "1M",
    is_estimated: bool = False,
    display_mode: str = "value",   # "value" → Portfolio Value ($)  |  "return" → Period Return (%)
) -> go.Figure:
    """
    Spline area chart with 3-layer glow and tight Y-axis auto-scale.
    Renders 4 traces: fill area → wide glow → inner glow → main line.
    Y-axis zooms to the visible data range so small moves are visible.
    """
    fig = go.Figure()

    if equity_df.empty:
        msg = (
            "Estimated Historical Portfolio Performance — price data unavailable"
            if is_estimated else
            "No account history available"
        )
        fig.update_layout(
            paper_bgcolor=_CARD, plot_bgcolor=_CARD, height=360, font=_FONT,
            margin=dict(l=8, r=8, t=8, b=32),
            annotations=[dict(
                text=msg, showarrow=False,
                font=dict(color=_TEXT, size=12),
                x=0.5, y=0.5, xref="paper", yref="paper",
            )],
        )
        return fig

    df        = filter_by_period(equity_df, period)
    start_val = df["value"].iloc[0]
    end_val   = df["value"].iloc[-1]
    is_pos    = end_val >= start_val
    tick_fmt  = "%d %b" if period in ("1D", "1W", "1M") else "%b '%y"
    pct_chg   = (df["value"] / start_val - 1) * 100

    if is_pos:
        line_col  = _GREEN
        glow_wide = "rgba(16,185,129,0.05)"
        glow_mid  = "rgba(16,185,129,0.12)"
        fill_col  = "rgba(16,185,129,0.07)"
    else:
        line_col  = _RED
        glow_wide = "rgba(244,63,94,0.05)"
        glow_mid  = "rgba(244,63,94,0.12)"
        fill_col  = "rgba(244,63,94,0.07)"

    # Y-axis data and formatting for the selected mode
    if display_mode == "return":
        y_data    = pct_chg
        alt_data  = df["value"]
        y_line1   = "Return: <b>%{y:+.2f}%</b>"
        y_line2   = "Value: $%{customdata:,.0f}"
        y_prefix  = ""
        y_suffix  = "%"
        y_fmt     = "+.2f"
        ref_y     = 0.0
    else:
        y_data    = df["value"]
        alt_data  = pct_chg
        y_line1   = "Value: <b>$%{y:,.0f}</b>"
        y_line2   = "Return: %{customdata:+.2f}%"
        y_prefix  = "$"
        y_suffix  = ""
        y_fmt     = ",.0f"
        ref_y     = start_val

    # Tight Y-axis range — clips zero-anchored fill to make small moves visible
    y_min = float(y_data.min())
    y_max = float(y_data.max())
    y_rng = y_max - y_min or abs(y_max) * 0.01 or 1.0
    pad   = y_rng * 0.20
    y_range = [y_min - pad, y_max + pad]

    # ── Trace 1: filled area (invisible line so only the fill shows) ──────────
    fig.add_trace(go.Scatter(
        x=df["date"], y=y_data,
        mode="lines",
        line=dict(color="rgba(0,0,0,0)", width=0, shape="spline"),
        fill="tozeroy",
        fillcolor=fill_col,
        hoverinfo="skip",
        showlegend=False,
    ))

    # ── Trace 2: wide glow halo ───────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=df["date"], y=y_data,
        mode="lines",
        line=dict(color=glow_wide, width=24, shape="spline"),
        hoverinfo="skip",
        showlegend=False,
    ))

    # ── Trace 3: inner glow ───────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=df["date"], y=y_data,
        mode="lines",
        line=dict(color=glow_mid, width=10, shape="spline"),
        hoverinfo="skip",
        showlegend=False,
    ))

    # ── Trace 4: main spline line (carries the hover tooltip) ─────────────────
    fig.add_trace(go.Scatter(
        x=df["date"], y=y_data,
        mode="lines",
        line=dict(color=line_col, width=2.5, shape="spline"),
        name="",
        customdata=alt_data,
        hovertemplate=(
            "<b>%{x|%d %b %Y}</b><br>"
            + y_line1 + "<br>"
            + y_line2
            + "<extra></extra>"
        ),
    ))

    # Baseline reference line
    fig.add_hline(
        y=ref_y,
        line=dict(color="rgba(255,255,255,0.07)", width=1, dash="dot"),
    )

    if is_estimated:
        fig.add_annotation(
            text="ESTIMATED — yfinance price reconstruction",
            x=0.5, y=0.96, xref="paper", yref="paper",
            showarrow=False,
            font=dict(color="rgba(244,63,94,0.50)", size=10,
                      family="JetBrains Mono, monospace"),
            align="center",
        )

    fig.update_layout(
        paper_bgcolor=_CARD,
        plot_bgcolor=_CARD,
        font=_FONT,
        height=360,
        margin=dict(l=8, r=8, t=8, b=32),
        dragmode="zoom",
        xaxis=dict(
            gridcolor=_GRID, zerolinecolor=_GRID, color=_TEXT,
            showgrid=False, tickformat=tick_fmt,
            showspikes=True,
            spikecolor="rgba(56,189,248,0.4)",
            spikethickness=1,
            spikedash="solid",
            spikemode="across+toaxis",
            spikesnap="cursor",
            fixedrange=False,
        ),
        yaxis=dict(
            gridcolor=_GRID, zerolinecolor="rgba(255,255,255,0.06)", color=_TEXT,
            tickprefix=y_prefix, ticksuffix=y_suffix, tickformat=y_fmt,
            side="right",
            showgrid=True,
            range=y_range,
            fixedrange=False,
            showspikes=True,
            spikecolor="rgba(56,189,248,0.2)",
            spikethickness=1,
            spikedash="dot",
            spikemode="across+toaxis",
        ),
        hovermode="x unified",
        hoverdistance=50,
        spikedistance=1000,
        showlegend=False,
    )
    return fig


def chart_sector_sunburst(
    agg_df: pd.DataFrame,
    gics_lookup: dict,   # {symbol: (sector, industry_group, industry)}
) -> go.Figure:
    """
    GICS Sunburst: Portfolio → Sector → Industry Group → Industry → Symbol.
    Size = market value.  Colour = P&L % (red → dark neutral → green).
    Click a sector/industry slice to drill down; double-click to reset.
    New positions auto-classify via get_gics_info() — no code change needed.
    """
    if agg_df.empty:
        return go.Figure()

    total_mv   = agg_df["Market Value"].sum()
    total_pnl  = agg_df["Unrealized P&L"].sum()
    root_pct   = total_pnl / total_mv * 100 if total_mv else 0

    # Build hierarchy: sector → industry_group → industry → [(sym, mv, pnl, pnl_pct, weight)]
    hierarchy: dict = {}
    for _, row in agg_df.iterrows():
        sym  = row["Symbol"]
        mv   = row["Market Value"]
        pnl  = row["Unrealized P&L"]
        pct  = row["P&L %"]
        wt   = row["Weight %"]
        gics = gics_lookup.get(sym, ("Other", "Other", "Other"))
        sector       = gics[0]
        industry_grp = gics[1]
        industry     = gics[2] if len(gics) > 2 else gics[1]
        (hierarchy
            .setdefault(sector, {})
            .setdefault(industry_grp, {})
            .setdefault(industry, [])
            .append((sym, mv, pnl, pct, wt))
        )

    ids, labels, parents, values, pnl_pcts, hover_html = [], [], [], [], [], []

    # Root node
    ids.append("__root__")
    labels.append("Portfolio")
    parents.append("")
    values.append(total_mv)
    pnl_pcts.append(root_pct)
    hover_html.append(
        f"<b>Portfolio</b><br>"
        f"MV: ${total_mv:,.0f}<br>"
        f"P&L: ${total_pnl:+,.2f}  ({root_pct:+.2f}%)"
    )

    for sector, ig_map in sorted(hierarchy.items()):
        s_mv  = sum(mv  for ig in ig_map.values() for inds in ig.values() for _, mv,  _, _, _ in inds)
        s_pnl = sum(pnl for ig in ig_map.values() for inds in ig.values() for _, _,  pnl, _, _ in inds)
        s_pct = s_pnl / s_mv * 100 if s_mv else 0
        s_id  = f"s|{sector}"

        ids.append(s_id)
        labels.append(sector)
        parents.append("__root__")
        values.append(s_mv)
        pnl_pcts.append(s_pct)
        hover_html.append(
            f"<b>{sector}</b><br>"
            f"MV: ${s_mv:,.0f}  ({s_mv/total_mv*100:.1f}% of portfolio)<br>"
            f"P&L: ${s_pnl:+,.2f}  ({s_pct:+.2f}%)"
        )

        for industry_grp, ind_map in sorted(ig_map.items()):
            ig_mv  = sum(mv  for inds in ind_map.values() for _, mv,  _, _, _ in inds)
            ig_pnl = sum(pnl for inds in ind_map.values() for _, _,  pnl, _, _ in inds)
            ig_pct = ig_pnl / ig_mv * 100 if ig_mv else 0
            ig_id  = f"ig|{sector}|{industry_grp}"

            ids.append(ig_id)
            labels.append(industry_grp)
            parents.append(s_id)
            values.append(ig_mv)
            pnl_pcts.append(ig_pct)
            hover_html.append(
                f"<b>{industry_grp}</b><br>"
                f"MV: ${ig_mv:,.0f}  ({ig_mv/total_mv*100:.1f}%)<br>"
                f"P&L: ${ig_pnl:+,.2f}  ({ig_pct:+.2f}%)"
            )

            for industry, syms in sorted(ind_map.items()):
                ind_mv  = sum(mv  for _, mv,  _, _, _ in syms)
                ind_pnl = sum(pnl for _, _,  pnl, _, _ in syms)
                ind_pct = ind_pnl / ind_mv * 100 if ind_mv else 0
                ind_id  = f"ind|{sector}|{industry_grp}|{industry}"

                # Only add an industry node if it's distinct from the industry group
                if industry != industry_grp:
                    ids.append(ind_id)
                    labels.append(industry)
                    parents.append(ig_id)
                    values.append(ind_mv)
                    pnl_pcts.append(ind_pct)
                    hover_html.append(
                        f"<b>{industry}</b><br>"
                        f"MV: ${ind_mv:,.0f}  ({ind_mv/total_mv*100:.1f}%)<br>"
                        f"P&L: ${ind_pnl:+,.2f}  ({ind_pct:+.2f}%)"
                    )
                    sym_parent = ind_id
                else:
                    sym_parent = ig_id

                for sym, mv, pnl, pct, wt in sorted(syms, key=lambda x: -x[1]):
                    ids.append(f"sym|{sector}|{industry_grp}|{industry}|{sym}")
                    labels.append(sym)
                    parents.append(sym_parent)
                    values.append(mv)
                    pnl_pcts.append(pct)
                    hover_html.append(
                        f"<b>{sym}</b><br>"
                        f"MV: ${mv:,.0f}  ({wt:.1f}%)<br>"
                        f"P&L: ${pnl:+,.2f}  ({pct:+.2f}%)"
                    )

    max_abs = max((abs(v) for v in pnl_pcts), default=1.0) or 1.0
    colorscale = [
        [0.00, "#f43f5e"],
        [0.40, "#1a1f35"],
        [0.50, "#0d1321"],
        [0.60, "#0d2818"],
        [1.00, "#10b981"],
    ]

    fig = go.Figure(go.Sunburst(
        ids=ids,
        labels=labels,
        parents=parents,
        values=values,
        branchvalues="total",
        marker=dict(
            colors=pnl_pcts,
            colorscale=colorscale,
            cmin=-max_abs,
            cmid=0,
            cmax=max_abs,
            line=dict(color="#060a14", width=2),
            showscale=False,
        ),
        customdata=hover_html,
        hovertemplate="%{customdata}<extra></extra>",
        insidetextorientation="radial",
        textfont=dict(color="#e2e8f0", size=11, family="Inter, sans-serif"),
        maxdepth=4,
        leaf=dict(opacity=0.9),
    ))

    fig.update_layout(
        paper_bgcolor=_CARD,
        font=_FONT,
        height=420,
        margin=dict(l=0, r=0, t=46, b=0),
        title=dict(
            text="GICS  Sector → Industry Group → Industry  (size = MV · colour = P&L %)",
            font=dict(color=_HDR, size=13, family="Inter, sans-serif"),
            x=0, pad=dict(l=4),
        ),
    )
    return fig


def chart_theme_donut(positions_df: pd.DataFrame) -> go.Figure:
    """Donut chart of market-value allocation by investment theme."""
    if positions_df.empty:
        return go.Figure()

    df = positions_df.copy()
    df["Theme"]         = df["Symbol"].map(THEMES).fillna("Other")
    df["_market_value"] = df["Volume"] * df["Current Price"]

    theme_totals = (
        df.groupby("Theme")["_market_value"]
        .sum()
        .reset_index()
        .rename(columns={"_market_value": "Market Value"})
        .sort_values("Market Value", ascending=False)
    )

    colors = [THEME_COLORS.get(t, THEME_COLORS["Other"]) for t in theme_totals["Theme"]]
    total  = theme_totals["Market Value"].sum()

    fig = go.Figure(go.Pie(
        labels=theme_totals["Theme"],
        values=theme_totals["Market Value"],
        hole=0.60,
        marker=dict(colors=colors, line=dict(color="#060a14", width=2)),
        textinfo="none",
        direction="clockwise",
        sort=True,
        hovertemplate=(
            "<b>%{label}</b><br>$%{value:,.0f} · %{percent}"
            "<extra></extra>"
        ),
    ))

    fig.update_layout(
        paper_bgcolor=_CARD,
        font=_FONT,
        height=380,
        margin=dict(l=0, r=110, t=46, b=8),
        showlegend=True,
        legend=dict(
            font=dict(color=_TEXT, size=11),
            orientation="v", x=1.0, y=0.5,
            bgcolor="rgba(0,0,0,0)",
            itemsizing="constant",
        ),
        title=dict(
            text="Allocation by Theme",
            font=dict(color=_HDR, size=13, family="Inter, sans-serif"),
            x=0, pad=dict(l=4),
        ),
        annotations=[dict(
            text=f"<b>${total / 1e3:.0f}K</b>",
            x=0.36, y=0.5,
            showarrow=False,
            font=dict(color=_HDR, size=18, family="JetBrains Mono, monospace"),
            xref="paper", yref="paper", align="center",
        )],
    )
    return fig
