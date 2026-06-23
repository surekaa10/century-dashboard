"""
Century Research — Portfolio Risk Dashboard  v1
Run:  streamlit run dashboard.py
"""

from __future__ import annotations
import os
import sys
import time
from datetime import datetime, timezone
import pandas as pd
import streamlit as st

import data_source
from config import REFRESH_INTERVAL_DEFAULT
from mt5_connector import MT5Connector, AccountInfo, run_full_diagnostics, get_import_diagnostics
from position_analytics import (
    aggregate_positions, exposure_summary,
    chart_weight_bar, chart_treemap, chart_winners_losers,
    chart_correlation_heatmap,
)
from portfolio_overview import (
    compute_hero_metrics, get_equity_curve,
    chart_equity_curve, chart_sector_sunburst, get_gics_info,
)

# ── GICS lookup cache (network call — cached 1 hour) ─────────────────────────

@st.cache_data(ttl=3600, show_spinner=False)
def _get_gics_cached(symbols_tuple: tuple) -> dict:
    """Resolve GICS sector/industry for each symbol; yfinance fallback for unknowns."""
    return {sym: get_gics_info(sym) for sym in symbols_tuple}


# ── Page config (must be first Streamlit call) ────────────────────────────────

st.set_page_config(
    page_title = "Century Research · Risk Dashboard",
    page_icon  = "📊",
    layout     = "wide",
    initial_sidebar_state = "collapsed",
)

# ── CSS ───────────────────────────────────────────────────────────────────────

STYLES = """
<style>
/* ── Global ── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.stApp {
    background: linear-gradient(160deg, #060a14 0%, #080c18 50%, #06090f 100%);
}

.main .block-container {
    padding: 1.4rem 2.2rem 2rem 2.2rem;
    max-width: 100%;
}

/* ── Header band ── */
.hdr-band {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(56,189,248,0.12);
    padding-bottom: 14px;
    margin-bottom: 24px;
}
.hdr-title {
    font-size: 20px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: 0.3px;
}
.hdr-sub {
    font-size: 11px;
    color: #475569;
    margin-top: 2px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}
.hdr-right {
    display: flex;
    align-items: center;
    gap: 14px;
}
.ts {
    font-size: 11px;
    color: #475569;
    font-family: 'JetBrains Mono', monospace;
}

/* ── Status badge ── */
.badge-connected {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(16,185,129,0.08);
    border: 1px solid rgba(16,185,129,0.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #10b981;
    letter-spacing: 0.4px;
}
.badge-disconnected {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(244,63,94,0.08);
    border: 1px solid rgba(244,63,94,0.3);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #f43f5e;
    letter-spacing: 0.4px;
}
@keyframes pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: .35; }
}
.dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
}
.dot-green { background: #10b981; box-shadow: 0 0 6px #10b981; }
.dot-red   { background: #f43f5e; box-shadow: 0 0 6px #f43f5e; }

/* ── KPI cards ── */
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 14px;
    margin-bottom: 28px;
}
.kpi-card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(56,189,248,0.1);
    border-radius: 12px;
    padding: 18px 20px;
    position: relative;
    overflow: hidden;
    transition: border-color .2s;
}
.kpi-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(56,189,248,0.4), transparent);
}
.kpi-card:hover {
    border-color: rgba(56,189,248,0.25);
    box-shadow: 0 0 24px rgba(56,189,248,0.05);
}
.kpi-label {
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
}
.kpi-value {
    font-size: 22px;
    font-weight: 700;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -0.5px;
    line-height: 1;
}
.kpi-value-pos { color: #10b981; }
.kpi-value-neg { color: #f43f5e; }
.kpi-sub {
    font-size: 10px;
    color: #475569;
    margin-top: 6px;
}

/* ── Section header ── */
.section-hdr {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
}
.section-title {
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.8px;
}
.section-pill {
    font-size: 10px;
    background: rgba(56,189,248,0.1);
    color: #38bdf8;
    border: 1px solid rgba(56,189,248,0.2);
    border-radius: 20px;
    padding: 2px 9px;
    font-weight: 600;
}

/* ── Positions table ── */
.pos-table-wrap {
    background: rgba(255,255,255,0.015);
    border: 1px solid rgba(56,189,248,0.08);
    border-radius: 12px;
    overflow: hidden;
}
.pos-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
}
.pos-table thead tr {
    background: rgba(56,189,248,0.04);
    border-bottom: 1px solid rgba(56,189,248,0.12);
}
.pos-table th {
    padding: 11px 16px;
    text-align: right;
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.7px;
    white-space: nowrap;
}
.pos-table th:first-child { text-align: left; }
.pos-table td {
    padding: 11px 16px;
    text-align: right;
    color: #cbd5e1;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    white-space: nowrap;
}
.pos-table td:first-child { text-align: left; }
.pos-table tbody tr:hover td {
    background: rgba(56,189,248,0.04);
}
.pos-table tbody tr:last-child td { border-bottom: none; }

/* ── Table value colors ── */
.val-pos  { color: #10b981; }
.val-neg  { color: #f43f5e; }
.val-zero { color: #475569; }
.sym { font-weight: 600; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; }
.dir-long  {
    display: inline-block;
    background: rgba(16,185,129,0.1);
    color: #10b981;
    border: 1px solid rgba(16,185,129,0.25);
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
}
.dir-short {
    display: inline-block;
    background: rgba(244,63,94,0.1);
    color: #f43f5e;
    border: 1px solid rgba(244,63,94,0.25);
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
}
.no-positions {
    text-align: center;
    padding: 48px;
    color: #334155;
    font-size: 13px;
}

/* ── Error card ── */
.err-card {
    background: rgba(244,63,94,0.05);
    border: 1px solid rgba(244,63,94,0.2);
    border-radius: 12px;
    padding: 24px 28px;
    color: #f43f5e;
    font-size: 13px;
    line-height: 1.7;
}
.err-title {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.err-detail { color: #94a3b8; font-size: 12px; margin-top: 8px; font-family: 'JetBrains Mono', monospace; }

/* ── Footer ── */
.footer {
    text-align: center;
    color: #1e293b;
    font-size: 11px;
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.03);
}

/* ── Streamlit widget overrides ── */
div[data-testid="stButton"] button {
    background: rgba(56,189,248,0.08) !important;
    border: 1px solid rgba(56,189,248,0.25) !important;
    color: #38bdf8 !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding: 0.35rem 1rem !important;
    transition: all .15s !important;
}
div[data-testid="stButton"] button:hover {
    background: rgba(56,189,248,0.15) !important;
    border-color: rgba(56,189,248,0.45) !important;
    box-shadow: 0 0 12px rgba(56,189,248,0.12) !important;
}
div[data-testid="stSelectbox"] > div,
div[data-testid="stSlider"]  > div { color: #94a3b8; }

/* hide default streamlit chrome */
#MainMenu, footer, header { visibility: hidden; }
.stDeployButton { display: none; }

/* ── Tab bar ── */
.stTabs [data-baseweb="tab-list"] {
    background: transparent;
    border-bottom: 1px solid rgba(56,189,248,0.1);
    gap: 2px;
    margin-bottom: 4px;
}
.stTabs [data-baseweb="tab"] {
    background: transparent;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.4px;
    padding: 8px 20px;
    border-radius: 6px 6px 0 0;
    border: none;
}
.stTabs [data-baseweb="tab"]:hover { color: #94a3b8; }
.stTabs [aria-selected="true"] {
    background: rgba(56,189,248,0.06) !important;
    color: #38bdf8 !important;
}
.stTabs [data-baseweb="tab-highlight"] { background: #38bdf8 !important; height: 2px; }
.stTabs [data-baseweb="tab-panel"] { padding-top: 18px; }

/* ── Exposure summary (4-col) ── */
.exp-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 24px;
}
.exp-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(56,189,248,0.09);
    border-radius: 10px;
    padding: 16px 18px;
    position: relative;
    overflow: hidden;
}
.exp-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent);
}
.exp-label { font-size: 10px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 7px; }
.exp-value { font-size: 20px; font-weight: 700; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; letter-spacing: -.3px; line-height: 1; }
.exp-sub   { font-size: 10px; color: #475569; margin-top: 5px; }

/* ── Holdings table ── */
.hold-table-wrap {
    background: rgba(255,255,255,0.012);
    border: 1px solid rgba(56,189,248,0.07);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 6px;
}
.hold-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.hold-table thead tr {
    background: rgba(56,189,248,0.035);
    border-bottom: 1px solid rgba(56,189,248,0.1);
}
.hold-table th {
    padding: 10px 14px;
    text-align: right;
    font-size: 10px;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: .7px;
    white-space: nowrap;
}
.hold-table th:first-child { text-align: left; }
.hold-table td {
    padding: 10px 14px;
    text-align: right;
    color: #cbd5e1;
    border-bottom: 1px solid rgba(255,255,255,0.025);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    white-space: nowrap;
}
.hold-table td:first-child { text-align: left; }
.hold-table tbody tr:hover td { background: rgba(56,189,248,0.03); }
.hold-table tbody tr:last-child td { border-bottom: none; }

/* ── Fills table (inside expanders) ── */
.fills-wrap { margin: 6px 2px 4px 2px; }
.fills-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.fills-table th {
    padding: 7px 12px;
    text-align: right;
    font-size: 9.5px;
    font-weight: 600;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: .6px;
    background: rgba(255,255,255,0.015);
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.fills-table th:first-child { text-align: left; }
.fills-table td {
    padding: 7px 12px;
    text-align: right;
    color: #94a3b8;
    border-bottom: 1px solid rgba(255,255,255,0.02);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
}
.fills-table td:first-child { text-align: left; color: #cbd5e1; }
.fills-table tbody tr:last-child td { border-bottom: none; }

/* ── Expander dark override ── */
[data-testid="stExpander"] {
    background: rgba(255,255,255,0.012) !important;
    border: 1px solid rgba(56,189,248,0.07) !important;
    border-radius: 8px !important;
    margin-bottom: 5px !important;
}
details summary {
    font-size: 12px !important;
    color: #64748b !important;
    font-family: 'JetBrains Mono', monospace !important;
    padding: 10px 14px !important;
}
details[open] summary { color: #94a3b8 !important; }
details summary:hover  { color: #e2e8f0 !important; }

/* ── Analytics section label ── */
.ana-section {
    font-size: 11px;
    font-weight: 600;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 22px 0 10px 0;
    padding-bottom: 7px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}

/* ── Hero section ── */
.hero-wrap {
    padding: 18px 0 24px 0;
    margin-bottom: 4px;
}
.hero-eyebrow {
    font-size: 10px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 10px;
}
.hero-value-row {
    display: flex;
    align-items: baseline;
    gap: 18px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}
.hero-pv {
    font-size: 44px;
    font-weight: 700;
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -1.5px;
    line-height: 1;
}
.hero-ret-pos {
    font-size: 15px;
    font-weight: 600;
    color: #10b981;
    font-family: 'JetBrains Mono', monospace;
}
.hero-ret-neg {
    font-size: 15px;
    font-weight: 600;
    color: #f43f5e;
    font-family: 'JetBrains Mono', monospace;
}
.hero-chips {
    display: flex;
    gap: 40px;
    padding-top: 18px;
    margin-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.04);
    flex-wrap: wrap;
}
.hero-chip-label {
    font-size: 9px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
}
.hero-chip-value {
    font-size: 17px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    color: #94a3b8;
}
.hero-chip-pos { color: #10b981 !important; }
.hero-chip-neg { color: #f43f5e !important; }

/* ── st.pills period selector overrides ── */
[data-testid="stPills"] {
    gap: 4px !important;
}
[data-testid="stPills"] button {
    background: rgba(255,255,255,0.02) !important;
    border: 1px solid rgba(255,255,255,0.06) !important;
    color: #334155 !important;
    border-radius: 6px !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    padding: 3px 10px !important;
    font-family: 'JetBrains Mono', monospace !important;
    letter-spacing: 0.5px !important;
    min-height: auto !important;
    line-height: 1.6 !important;
}
[data-testid="stPills"] button[aria-pressed="true"] {
    background: rgba(56,189,248,0.1) !important;
    border-color: rgba(56,189,248,0.3) !important;
    color: #38bdf8 !important;
}
[data-testid="stPills"] button:hover {
    background: rgba(255,255,255,0.04) !important;
    color: #64748b !important;
    border-color: rgba(255,255,255,0.1) !important;
}
</style>
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(v: float, prefix: str = "$", decimals: int = 2) -> str:
    return f"{prefix}{v:,.{decimals}f}"


def _pnl_cls(v: float) -> str:
    if v > 0:  return "val-pos"
    if v < 0:  return "val-neg"
    return "val-zero"


def _pnl_fmt(v: float) -> str:
    sign = "+" if v > 0 else ""
    return f"{sign}${v:,.2f}"


# (price fetching is handled inside portfolio_overview.get_equity_curve)


# ── Portfolio Dashboard — hero section ────────────────────────────────────────

def render_hero(metrics: dict) -> None:
    """
    Metric data lineage (all from MT5, nothing reconstructed):
      Portfolio Value      → account_info().equity
      Floating P&L (▲/▼)  → sum(position.profit)           positions_get()
      RoAC subtext         → floating / sum(vol×entry_price) derived
      Allocated Capital    → sum(position.volume × position.price_open)
      Floating P&L chip    → sum(position.profit)            positions_get()
      Net P&L chip         → sum(position.profit + position.swap)
      Today's Realized     → sum(deal.profit+comm+swap) for closing deals today
      RoE chip             → floating / equity × 100         derived
      RoAC chip            → floating / allocated × 100      derived
    """
    pv         = metrics["portfolio_value"]
    floating   = metrics["floating_pnl"]       # position.profit only
    net_pnl    = metrics["net_pnl"]            # profit + swap
    allocated  = metrics["allocated_capital"]
    today_real = metrics["today_realized"]      # closed deals today
    roe        = metrics["return_on_equity"]
    roac       = metrics["return_on_allocated"]
    n          = metrics["n_holdings"]

    arrow    = "▲" if floating >= 0 else "▼"
    ret_cls  = "hero-ret-pos" if floating >= 0 else "hero-ret-neg"
    f_sign   = "+" if floating   >= 0 else ""
    roac_sgn = "+" if roac       >= 0 else ""

    def _chip(val: float) -> str:
        return "#10b981" if val >= 0 else "#f43f5e"

    def _sgn(val: float) -> str:
        return "+" if val >= 0 else ""

    st.markdown(f"""
    <div class="hero-wrap">
        <div class="hero-eyebrow">Portfolio Value</div>
        <div class="hero-value-row">
            <div class="hero-pv">${pv:,.0f}</div>
            <div class="{ret_cls}">{arrow}&nbsp;{f_sign}${floating:,.2f}&nbsp;floating&nbsp;&nbsp;{roac_sgn}{roac:.2f}%&nbsp;RoAC</div>
        </div>
        <div class="hero-chips">
            <div>
                <div class="hero-chip-label">Holdings</div>
                <div class="hero-chip-value">{n}</div>
            </div>
            <div>
                <div class="hero-chip-label">Allocated Capital</div>
                <div class="hero-chip-value">${allocated:,.0f}</div>
            </div>
            <div>
                <div class="hero-chip-label">Floating P&amp;L</div>
                <div class="hero-chip-value" style="color:{_chip(floating)}">{_sgn(floating)}${floating:,.2f}</div>
            </div>
            <div>
                <div class="hero-chip-label">Net P&amp;L (incl. swap)</div>
                <div class="hero-chip-value" style="color:{_chip(net_pnl)}">{_sgn(net_pnl)}${net_pnl:,.2f}</div>
            </div>
            <div>
                <div class="hero-chip-label">Today's Realized</div>
                <div class="hero-chip-value" style="color:{_chip(today_real)}">{_sgn(today_real)}${today_real:,.2f}</div>
            </div>
            <div>
                <div class="hero-chip-label">Return on Equity</div>
                <div class="hero-chip-value" style="color:{_chip(roe)}">{_sgn(roe)}{roe:.2f}%</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)


# ── Portfolio Dashboard — equity curve + charts + holdings ───────────────────

def render_portfolio_overview(
    positions_df: pd.DataFrame,
    account,
    today_realized: float,
    deals_df: pd.DataFrame = None,
    symbol_rates: dict = None,
) -> None:
    if symbol_rates is None:
        symbol_rates = {}

    # Hero — metrics computed entirely from MT5 direct fields
    metrics = compute_hero_metrics(positions_df, account, today_realized)
    render_hero(metrics)

    # Equity curve — MT5 deal history first, yfinance fallback
    _ana_section("Equity Curve")

    equity_df, is_real = get_equity_curve(
        deals_df        = deals_df if deals_df is not None else pd.DataFrame(),
        positions_df    = positions_df,
        account_balance = account.balance if account else 0.0,
        current_equity  = account.equity  if account else 0.0,
        symbol_rates    = symbol_rates,
    )

    _, period_col, mode_col = st.columns([1, 5, 2])
    with period_col:
        period = st.pills(
            "",
            options=["1D", "1W", "1M", "3M", "6M", "1Y", "All"],
            default="1M",
            key="equity_period",
            label_visibility="collapsed",
        )
    with mode_col:
        mode_raw = st.pills(
            "",
            options=["$ Value", "% Return"],
            default="$ Value",
            key="equity_mode",
            label_visibility="collapsed",
        )
    display_mode = "return" if mode_raw == "% Return" else "value"

    st.plotly_chart(
        chart_equity_curve(
            equity_df,
            period or "1M",
            is_estimated=not is_real,
            display_mode=display_mode,
        ),
        use_container_width=True,
        key="equity_curve",
        config={
            "displayModeBar": True,
            "displaylogo":    False,
            "scrollZoom":     True,
            "modeBarButtonsToRemove": ["lasso2d", "select2d", "autoScale2d"],
            "toImageButtonOptions": {
                "format": "png", "filename": "century_equity_curve",
                "height": 400, "width": 1400, "scale": 2,
            },
        },
    )

    if positions_df.empty:
        st.markdown(
            "<div style='text-align:center;padding:40px;color:#334155;font-size:13px'>"
            "No open positions.</div>",
            unsafe_allow_html=True,
        )
        return

    # Treemap + GICS sector sunburst
    agg_df      = aggregate_positions(positions_df)
    gics_lookup = _get_gics_cached(tuple(sorted(agg_df["Symbol"].unique())))

    c1, c2 = st.columns(2)
    with c1:
        st.plotly_chart(
            chart_treemap(agg_df),
            use_container_width=True,
            key="portfolio_treemap",
            config={"displayModeBar": False},
        )
    with c2:
        st.plotly_chart(
            chart_sector_sunburst(agg_df, gics_lookup),
            use_container_width=True,
            key="sector_sunburst",
            config={"displayModeBar": False},
        )

    # Holdings table + expandable fills
    _ana_section("Holdings")
    render_holdings_table(agg_df)
    render_position_details(positions_df, agg_df)


# ── Header ────────────────────────────────────────────────────────────────────

def render_header(connected: bool, account_name: str = "",
                  mode: str = "live", as_of: datetime | None = None) -> None:
    now    = datetime.now().strftime("%d %b %Y  %H:%M:%S")
    server = "CenturyFinancialLtd-Live"

    if connected:
        badge = f"""
        <span class="badge-connected">
            <span class="dot dot-green"></span>
            CONNECTED&nbsp;·&nbsp;{server}
        </span>"""
        sub = f"Logged in as {account_name}" if account_name else "Live account"
        if mode == "snapshot" and as_of is not None:
            age = (datetime.now(timezone.utc) - as_of).total_seconds()
            if age < 90:        fresh = f"{int(age)}s ago"
            elif age < 3600:    fresh = f"{int(age // 60)}m ago"
            else:               fresh = f"{age / 3600:.1f}h ago"
            stale = " · ⚠ STALE" if age > 300 else ""
            sub = (f"Snapshot · updated {fresh}{stale} · "
                   f"{as_of.strftime('%d %b %H:%M')} UTC")
    else:
        badge = """
        <span class="badge-disconnected">
            <span class="dot dot-red"></span>
            DISCONNECTED
        </span>"""
        sub = "Unable to reach MT5 terminal"

    st.markdown(f"""
    <div class="hdr-band">
        <div>
            <div class="hdr-title">Century Research</div>
            <div class="hdr-sub">{sub}</div>
        </div>
        <div class="hdr-right">
            <span class="ts">{now}</span>
            {badge}
        </div>
    </div>
    """, unsafe_allow_html=True)


# ── KPI strip ─────────────────────────────────────────────────────────────────

def render_kpis(acc: AccountInfo, daily_pnl: float) -> None:
    margin_level_str = (
        f"{acc.margin_level:,.1f}%"
        if acc.margin_level > 0 else "—"
    )
    daily_cls = _pnl_cls(daily_pnl)
    daily_str = _pnl_fmt(daily_pnl)

    st.markdown(f"""
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-label">Balance</div>
            <div class="kpi-value">{_fmt(acc.balance)}</div>
            <div class="kpi-sub">{acc.currency}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Equity</div>
            <div class="kpi-value">{_fmt(acc.equity)}</div>
            <div class="kpi-sub">Balance + open P&L</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Free Margin</div>
            <div class="kpi-value">{_fmt(acc.free_margin)}</div>
            <div class="kpi-sub">Available to open positions</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Margin Level</div>
            <div class="kpi-value">{margin_level_str}</div>
            <div class="kpi-sub">Equity / Margin used</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Daily P&L</div>
            <div class="kpi-value {daily_cls}">{daily_str}</div>
            <div class="kpi-sub">Realized + open today</div>
        </div>
    </div>
    """, unsafe_allow_html=True)


# ── Positions table ───────────────────────────────────────────────────────────

def _dir_badge(direction: str) -> str:
    cls = "dir-long" if direction == "Long" else "dir-short"
    return f'<span class="{cls}">{direction.upper()}</span>'


def render_positions(df: pd.DataFrame) -> None:
    n = len(df)
    st.markdown(f"""
    <div class="section-hdr">
        <span class="section-title">Open Positions</span>
        <span class="section-pill">{n} position{"s" if n != 1 else ""}</span>
    </div>
    """, unsafe_allow_html=True)

    if df.empty:
        st.markdown("""
        <div class="pos-table-wrap">
            <div class="no-positions">No open positions</div>
        </div>
        """, unsafe_allow_html=True)
        return

    rows_html = ""
    for _, r in df.iterrows():
        pnl      = r["Unrealized P&L"]
        pnl_cls  = _pnl_cls(pnl)
        pnl_str  = _pnl_fmt(pnl)
        mval     = _fmt(r["Market Value"])
        swap_str = _pnl_fmt(r["Swap"]) if r["Swap"] != 0 else "—"
        swap_cls = _pnl_cls(r["Swap"])

        rows_html += f"""
        <tr>
            <td><span class="sym">{r["Symbol"]}</span></td>
            <td style="text-align:left">{_dir_badge(r["Direction"])}</td>
            <td>{r["Volume"]:,.2f}</td>
            <td>{_fmt(r["Entry Price"])}</td>
            <td>{_fmt(r["Current Price"])}</td>
            <td class="{pnl_cls}">{pnl_str}</td>
            <td>{mval}</td>
            <td class="{swap_cls}">{swap_str}</td>
            <td style="color:#334155">{r["Open Time"]}</td>
        </tr>"""

    st.markdown(f"""
    <div class="pos-table-wrap">
        <table class="pos-table">
            <thead>
                <tr>
                    <th>Symbol</th>
                    <th style="text-align:left">Direction</th>
                    <th>Volume</th>
                    <th>Entry Price</th>
                    <th>Current Price</th>
                    <th>Unrealized P&L</th>
                    <th>Market Value</th>
                    <th>Swap</th>
                    <th>Open Time</th>
                </tr>
            </thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>
    """, unsafe_allow_html=True)


# ── Error state ───────────────────────────────────────────────────────────────

def render_error(message: str) -> None:
    # Escape angle brackets so HTML in the error message doesn't render
    safe_msg = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    st.markdown(f"""
    <div class="err-card">
        <div class="err-title">⚠ MT5 Connection Failed</div>
        <div>The dashboard could not connect to MetaTrader 5.</div>
        <div class="err-detail"><pre style="margin:0;white-space:pre-wrap">{safe_msg}</pre></div>
        <div style="margin-top:12px;color:#64748b;font-size:12px">
            Ensure the MT5 terminal is running and logged in, then click <strong>Run Diagnostics</strong>.
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_diagnostics() -> None:
    """
    Runs every MT5 step, prints results to console, and displays them in the UI.
    Called only on connection failure so it never blocks the live dashboard.
    """
    diag = run_full_diagnostics()

    # ── Console output (always printed so it shows in terminal) ──
    print("\n" + "=" * 70)
    print("  MT5 DIAGNOSTICS")
    print("=" * 70)
    print(f"  Python executable : {diag['python_exe']}")
    print(f"  Python version    : {diag['python_version'].split()[0]}")
    print(f"  MT5 import OK     : {diag['import_ok']}")
    if not diag['import_ok']:
        print(f"  Import exception  : {diag['exc_type']}: {diag['exc_msg']}")
        print(f"  Traceback:\n{diag.get('traceback', '')}")
    else:
        print(f"  MT5 version       : {diag['mt5_version']}")
    print()
    for label, ok, detail in diag.get("steps", []):
        tick = "OK " if ok else "ERR"
        print(f"  [{tick}] {label}")
        if not ok or "\n" in str(detail):
            for line in str(detail).splitlines():
                print(f"         {line}")
    print("=" * 70 + "\n")

    # ── UI output ──
    imp = get_import_diagnostics()

    with st.expander("🔬 Diagnostics — click to expand", expanded=True):
        st.markdown(
            "<div style='font-size:11px;color:#64748b;margin-bottom:12px'>"
            "Full step-by-step MT5 connection trace. Also printed to the console / terminal."
            "</div>",
            unsafe_allow_html=True,
        )

        # System info table
        rows = [
            ("Python executable", imp["python_exe"]),
            ("Python version",    imp["python_version"].split("\n")[0]),
            ("MT5 import",        "✓ OK" if imp["import_ok"] else f"✗ {imp['exc_type']}: {imp['exc_msg']}"),
            ("MT5 version",       imp["mt5_version"] or "—"),
        ]
        tbl = "".join(
            f"<tr><td style='color:#475569;width:200px;padding:5px 12px'>{k}</td>"
            f"<td style='font-family:monospace;color:#e2e8f0;padding:5px 12px'>{v}</td></tr>"
            for k, v in rows
        )
        st.markdown(
            f"<table style='border-collapse:collapse;font-size:12px;width:100%'>{tbl}</table>",
            unsafe_allow_html=True,
        )

        if imp.get("traceback"):
            st.markdown("**Import traceback:**")
            st.code(imp["traceback"], language="python")

        st.markdown("---")
        st.markdown("**Step-by-step connection trace:**")

        for label, ok, detail in diag.get("steps", []):
            color  = "#10b981" if ok else "#f43f5e"
            symbol = "✓" if ok else "✗"
            st.markdown(
                f"<div style='margin-bottom:6px'>"
                f"<span style='color:{color};font-weight:700;margin-right:8px'>{symbol}</span>"
                f"<code style='background:#1e293b;padding:2px 8px;border-radius:4px;"
                f"font-size:12px;color:#94a3b8'>{label}</code>"
                f"</div>",
                unsafe_allow_html=True,
            )
            detail_str = str(detail)
            if detail_str and detail_str != "None":
                # Truncate very long namedtuple output for readability
                display = detail_str if len(detail_str) <= 400 else detail_str[:400] + " …"
                st.code(display, language="python")


# ── Position Analytics tab ───────────────────────────────────────────────────

def _ana_section(title: str) -> None:
    st.markdown(f'<div class="ana-section">{title}</div>', unsafe_allow_html=True)


def _dir_badge_ana(direction: str) -> str:
    cls = "dir-long" if direction == "Long" else "dir-short"
    return f'<span class="{cls}">{direction.upper()}</span>'


def render_exposure_summary(summary: dict) -> None:
    total_long   = summary["total_long"]
    n            = summary["n_holdings"]
    largest_sym  = summary["largest_symbol"]
    largest_mv   = summary["largest_mv"]
    conc         = summary["concentration_pct"]

    st.markdown(f"""
    <div class="exp-grid">
        <div class="exp-card">
            <div class="exp-label">Total Long Exposure</div>
            <div class="exp-value">{_fmt(total_long)}</div>
            <div class="exp-sub">USD market value</div>
        </div>
        <div class="exp-card">
            <div class="exp-label">Number of Holdings</div>
            <div class="exp-value">{n}</div>
            <div class="exp-sub">Unique symbols</div>
        </div>
        <div class="exp-card">
            <div class="exp-label">Largest Position</div>
            <div class="exp-value" style="font-size:17px">{largest_sym}</div>
            <div class="exp-sub">{_fmt(largest_mv)}</div>
        </div>
        <div class="exp-card">
            <div class="exp-label">Concentration</div>
            <div class="exp-value" style="color:{'#f43f5e' if conc > 30 else '#e2e8f0'}">{conc:.1f}%</div>
            <div class="exp-sub">Largest position / total</div>
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_holdings_table(agg_df: pd.DataFrame) -> None:
    rows_html = ""
    for _, r in agg_df.iterrows():
        pnl     = r["Unrealized P&L"]
        pnl_cls = _pnl_cls(pnl)
        pnl_str = _pnl_fmt(pnl)
        pp_cls  = _pnl_cls(r["P&L %"])
        pp_sign = "+" if r["P&L %"] > 0 else ""
        fills   = f'{int(r["Fill Count"])} fill{"s" if r["Fill Count"] > 1 else ""}'

        rows_html += f"""
        <tr>
            <td><span class="sym">{r['Symbol']}</span>
                <span style="margin-left:6px;font-size:9px;color:#334155">{fills}</span></td>
            <td style="text-align:left">{_dir_badge_ana(r['Direction'])}</td>
            <td>{r['Total Qty']:,.4f}</td>
            <td>{_fmt(r['Avg Cost'])}</td>
            <td>{_fmt(r['Current Price'])}</td>
            <td>{_fmt(r['Market Value'])}</td>
            <td class="{pnl_cls}">{pnl_str}</td>
            <td class="{pp_cls}">{pp_sign}{r['P&L %']:.2f}%</td>
            <td>{r['Weight %']:.2f}%</td>
        </tr>"""

    st.markdown(f"""
    <div class="hold-table-wrap">
        <table class="hold-table">
            <thead><tr>
                <th>Symbol</th>
                <th style="text-align:left">Direction</th>
                <th>Total Qty</th>
                <th>Avg Cost</th>
                <th>Current Price</th>
                <th>Market Value</th>
                <th>Unrealized P&amp;L</th>
                <th>P&amp;L %</th>
                <th>Weight %</th>
            </tr></thead>
            <tbody>{rows_html}</tbody>
        </table>
    </div>
    """, unsafe_allow_html=True)


def render_position_details(raw_df: pd.DataFrame, agg_df: pd.DataFrame) -> None:
    """Expandable per-symbol drill-down showing individual fills."""
    _ana_section("Position Details — Expand a Symbol to See Individual Fills")

    for _, row in agg_df.iterrows():
        symbol = row["Symbol"]
        fills  = raw_df[raw_df["Symbol"] == symbol].copy()
        pnl    = row["Unrealized P&L"]
        sign   = "+" if pnl >= 0 else ""
        label  = (
            f"{symbol}   ·   "
            f"{int(row['Fill Count'])} fill{'s' if row['Fill Count'] > 1 else ''}   ·   "
            f"{sign}{_fmt(pnl)}   ({'+' if row['P&L %'] > 0 else ''}{row['P&L %']:.2f}%)   ·   "
            f"{row['Weight %']:.2f}% of portfolio"
        )

        with st.expander(label, expanded=False):
            fills_rows = ""
            for i, (_, f) in enumerate(fills.iterrows(), 1):
                fp    = f["Unrealized P&L"]
                fp_cl = _pnl_cls(fp)
                fills_rows += f"""
                <tr>
                    <td>#{i}</td>
                    <td>{f['Open Time']}</td>
                    <td>{f['Volume']:,.4f}</td>
                    <td>{_fmt(f['Entry Price'])}</td>
                    <td>{_fmt(f['Current Price'])}</td>
                    <td class="{fp_cl}">{_pnl_fmt(fp)}</td>
                </tr>"""

            st.markdown(f"""
            <div class="fills-wrap">
                <table class="fills-table">
                    <thead><tr>
                        <th>Fill</th>
                        <th>Open Time</th>
                        <th>Quantity</th>
                        <th>Entry Price</th>
                        <th>Current Price</th>
                        <th>P&amp;L</th>
                    </tr></thead>
                    <tbody>{fills_rows}</tbody>
                </table>
            </div>
            """, unsafe_allow_html=True)


def render_position_analytics(raw_df: pd.DataFrame, symbol_rates: dict = None) -> None:
    if raw_df.empty:
        st.markdown(
            "<div style='text-align:center;padding:60px;color:#334155;font-size:13px'>"
            "No open positions to analyse."
            "</div>",
            unsafe_allow_html=True,
        )
        return

    if symbol_rates is None:
        symbol_rates = {}

    agg_df  = aggregate_positions(raw_df)
    summary = exposure_summary(agg_df)

    # ── Exposure KPIs ──
    _ana_section("Exposure Summary")
    render_exposure_summary(summary)

    # ── Aggregated holdings table ──
    _ana_section("Holdings — Aggregated by Symbol")
    render_holdings_table(agg_df)

    # ── Per-symbol drill-down ──
    render_position_details(raw_df, agg_df)

    # ── Charts ──
    _ana_section("Visualisations")
    col_left, col_right = st.columns(2)
    with col_left:
        st.plotly_chart(
            chart_weight_bar(agg_df),
            use_container_width=True,
            key="weight_bar",
            config={"displayModeBar": False},
        )
    with col_right:
        st.plotly_chart(
            chart_treemap(agg_df),
            use_container_width=True,
            key="analytics_treemap",
            config={"displayModeBar": False},
        )

    st.plotly_chart(
        chart_winners_losers(agg_df),
        use_container_width=True,
        key="winners_losers",
        config={"displayModeBar": False},
    )

    # ── Correlation heatmap — MT5 rates first, yfinance for missing symbols ──
    _ana_section("Correlation")
    from portfolio_overview import _fetch_yf_prices
    symbols      = raw_df["Symbol"].unique().tolist()
    price_frames: dict[str, pd.Series] = {}

    for sym in symbols:
        if sym in symbol_rates and not symbol_rates[sym].empty:
            df_r = symbol_rates[sym]
            if "Close" in df_r.columns:
                price_frames[sym] = df_r["Close"]

    missing = [s for s in symbols if s not in price_frames]
    if missing:
        yf_px = _fetch_yf_prices(missing, days=252)
        for sym in missing:
            if sym in yf_px.columns:
                price_frames[sym] = yf_px[sym]

    prices_df = pd.DataFrame()
    if price_frames:
        prices_df = pd.DataFrame(price_frames)
        prices_df.index = pd.to_datetime(prices_df.index).tz_localize(None)
        prices_df = prices_df.ffill().bfill()

    st.plotly_chart(
        chart_correlation_heatmap(prices_df),
        use_container_width=True,
        key="correlation_heatmap",
        config={"displayModeBar": False},
    )


# ── Sidebar ───────────────────────────────────────────────────────────────────

def render_sidebar() -> tuple[bool, int]:
    with st.sidebar:
        st.markdown("### ⚙ Controls")
        st.divider()

        auto = st.toggle("Auto Refresh", value=False)
        interval = st.slider(
            "Refresh interval (s)", 5, 120, REFRESH_INTERVAL_DEFAULT,
            disabled=not auto,
        )

        st.divider()
        st.markdown(f"""
        <div style="font-size:11px;color:#475569;line-height:1.8">
            <div>Account &nbsp; <code style="color:#94a3b8">910001</code></div>
            <div>Server  <code style="color:#94a3b8">CenturyFinancialLtd-Live</code></div>
        </div>
        """, unsafe_allow_html=True)

        st.divider()
        st.caption("Century Research · v1.0")

    return auto, interval


# ── Data source resolution ────────────────────────────────────────────────────

def _gh_config() -> tuple[str, str, str] | None:
    """Return (repo, token, branch) if a GitHub snapshot source is configured."""
    repo = token = branch = None
    try:
        repo   = st.secrets.get("GH_REPO")
        token  = st.secrets.get("GH_TOKEN")
        branch = st.secrets.get("GH_BRANCH", "snapshot")
    except Exception:
        pass
    repo   = repo   or os.getenv("GH_REPO")
    token  = token  or os.getenv("GH_TOKEN")
    branch = branch or os.getenv("GH_BRANCH", "snapshot")
    if repo and token:
        return repo, token, branch
    return None


@st.cache_data(ttl=30, show_spinner=False)
def _load_snapshot_cached(repo: str, token: str, branch: str):
    return data_source.load_snapshot_from_github(repo, token, branch)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    st.markdown(STYLES, unsafe_allow_html=True)

    auto_refresh, interval = render_sidebar()

    gh   = _gh_config()
    mode = "snapshot" if gh else "live"

    # ── Load data (snapshot on cloud, live MT5 locally) ──
    if mode == "snapshot":
        repo, token, branch = gh
        try:
            data = _load_snapshot_cached(repo, token, branch)
        except Exception as exc:
            render_header(connected=False)
            render_error(
                f"Could not fetch snapshot from {repo} (branch '{branch}').\n"
                f"{type(exc).__name__}: {exc}\n"
                "Check GH_REPO / GH_TOKEN in Streamlit secrets and that the "
                "pusher on the trading PC has published at least one snapshot."
            )
            if st.button("⟳  Retry"):
                st.cache_data.clear()
                st.rerun()
            return
    else:
        data = data_source.load_live()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] MT5 connect → "
              f"{'OK' if data.ok else 'FAILED: ' + data.error}")

    # ── Connection / data failure ──
    if not data.ok:
        render_header(connected=False)
        render_error(data.error)
        col_a, col_b, _ = st.columns([1, 1, 5])
        with col_a:
            if st.button("⟳  Retry"):
                st.rerun()
        with col_b:
            if mode == "live" and st.button("🔬  Run Diagnostics"):
                render_diagnostics()
        return

    account        = data.account
    positions_df   = data.positions_df
    today_realized = data.today_realized
    deals_df       = data.deals_df
    symbol_rates   = data.symbol_rates

    # ── Render ──
    render_header(
        connected=True,
        account_name=account.name if account else "",
        mode=mode, as_of=data.generated_at,
    )

    tab_overview, tab_analytics = st.tabs(["Overview", "Position Analytics"])

    with tab_overview:
        render_portfolio_overview(
            positions_df, account, today_realized,
            deals_df=deals_df, symbol_rates=symbol_rates,
        )
        st.markdown(f"""
        <div class="footer">
            Century Research &nbsp;·&nbsp; Portfolio Dashboard &nbsp;·&nbsp;
            All figures are indicative — not financial advice &nbsp;·&nbsp;
            Last refresh: {datetime.now().strftime("%H:%M:%S")}
        </div>
        """, unsafe_allow_html=True)

    with tab_analytics:
        render_position_analytics(positions_df, symbol_rates=symbol_rates)

    # ── Auto-refresh ──
    if auto_refresh:
        time.sleep(interval)
        if mode == "snapshot":
            st.cache_data.clear()
        st.rerun()

    # ── Manual refresh button ──
    with st.sidebar:
        if st.button("⟳  Refresh Now", use_container_width=True):
            if mode == "snapshot":
                st.cache_data.clear()
            st.rerun()


if __name__ == "__main__":
    main()
