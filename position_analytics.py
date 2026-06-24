"""
Position Analytics — aggregation and chart builders for the analytics tab.
No Streamlit imports; pure pandas + plotly.
"""
from __future__ import annotations
import pandas as pd
import plotly.graph_objects as go

# ── Chart theme (matches dashboard.py palette) ────────────────────────────────

_BG    = "#0a0e1a"
_CARD  = "#0d1321"
_GRID  = "rgba(255,255,255,0.04)"
_TEXT  = "#94a3b8"
_HDR   = "#e2e8f0"
_ACC   = "#38bdf8"
_GREEN = "#10b981"
_RED   = "#f43f5e"
_MUTED = "#334155"
_FONT  = dict(family="JetBrains Mono, monospace", color=_TEXT, size=11)


def _dark(fig: go.Figure, title: str = "", height: int = 380) -> go.Figure:
    fig.update_layout(
        title=dict(
            text=title,
            font=dict(color=_HDR, size=13, family="Inter, sans-serif"),
            x=0, pad=dict(l=4),
        ),
        paper_bgcolor=_CARD,
        plot_bgcolor=_CARD,
        font=_FONT,
        height=height,
        margin=dict(l=16, r=80, t=46, b=32),
        xaxis=dict(gridcolor=_GRID, zerolinecolor=_GRID, color=_TEXT),
        yaxis=dict(gridcolor=_GRID, zerolinecolor="rgba(255,255,255,0.1)", color=_TEXT),
        legend=dict(font=dict(color=_TEXT, size=11)),
    )
    return fig


# ── Data aggregation ──────────────────────────────────────────────────────────

def aggregate_positions(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Collapse raw per-fill rows into one row per symbol.
    Returns: Symbol, Direction, Total Qty, Avg Cost, Current Price,
             Market Value, Unrealized P&L, P&L %, Weight %, Fill Count.
    """
    if raw_df.empty:
        return pd.DataFrame()

    df = raw_df.copy()
    df["Symbol"] = df["Symbol"].astype(str).str.strip()

    total_mv = (df["Volume"] * df["Current Price"]).sum()
    rows = []

    for symbol, grp in df.groupby("Symbol", sort=False):
        total_qty    = grp["Volume"].sum()
        avg_cost     = (grp["Entry Price"] * grp["Volume"]).sum() / total_qty
        current_px   = grp["Current Price"].iloc[0]
        market_value = total_qty * current_px
        unreal_pnl   = grp["Unrealized P&L"].sum()
        cost_basis   = avg_cost * total_qty
        pnl_pct      = unreal_pnl / cost_basis * 100 if cost_basis != 0 else 0.0
        weight_pct   = market_value / total_mv * 100 if total_mv > 0 else 0.0

        rows.append({
            "Symbol":         symbol,
            "Direction":      grp["Direction"].iloc[0],
            "Total Qty":      round(total_qty, 4),
            "Avg Cost":       round(avg_cost, 4),
            "Current Price":  round(current_px, 4),
            "Market Value":   round(market_value, 2),
            "Unrealized P&L": round(unreal_pnl, 2),
            "P&L %":          round(pnl_pct, 2),
            "Weight %":       round(weight_pct, 2),
            "Fill Count":     len(grp),
        })

    return (
        pd.DataFrame(rows)
        .sort_values("Market Value", ascending=False)
        .reset_index(drop=True)
    )


def exposure_summary(agg_df: pd.DataFrame) -> dict:
    """Portfolio-level exposure metrics from the aggregated frame."""
    empty = {
        "total_long": 0.0, "n_holdings": 0,
        "largest_symbol": "—", "largest_mv": 0.0,
        "concentration_pct": 0.0, "total_mv": 0.0,
    }
    if agg_df.empty:
        return empty

    long_df    = agg_df[agg_df["Direction"] == "Long"]
    total_long = long_df["Market Value"].sum()
    idx_top    = agg_df["Market Value"].idxmax()
    top        = agg_df.loc[idx_top]

    return {
        "total_long":        total_long,
        "n_holdings":        len(agg_df),
        "largest_symbol":    top["Symbol"],
        "largest_mv":        top["Market Value"],
        "concentration_pct": top["Weight %"],
        "total_mv":          agg_df["Market Value"].sum(),
    }


# ── Charts ────────────────────────────────────────────────────────────────────

def chart_weight_bar(agg_df: pd.DataFrame) -> go.Figure:
    """Horizontal bar chart of portfolio weights, coloured by P&L direction."""
    df     = agg_df.sort_values("Weight %")
    colors = [_GREEN if v >= 0 else _RED for v in df["Unrealized P&L"]]

    fig = go.Figure(go.Bar(
        x=df["Weight %"],
        y=df["Symbol"],
        orientation="h",
        marker_color=colors,
        marker_line=dict(width=0),
        text=[f"{w:.1f}%" for w in df["Weight %"]],
        textposition="outside",
        textfont=dict(color=_TEXT, size=10),
        hovertemplate=(
            "<b>%{y}</b><br>"
            "Weight: %{x:.2f}%<br>"
            "Market Value: $%{customdata:,.0f}"
            "<extra></extra>"
        ),
        customdata=df["Market Value"],
    ))
    _dark(fig, "Portfolio Weight by Symbol")
    fig.update_layout(
        xaxis=dict(title="Portfolio Weight %", ticksuffix="%", range=[0, df["Weight %"].max() * 1.25]),
        yaxis=dict(title=""),
        bargap=0.3,
    )
    return fig


def chart_treemap(agg_df: pd.DataFrame) -> go.Figure:
    """Treemap sized by market value, coloured green/red by P&L %."""
    if agg_df.empty:
        return go.Figure()

    pnl_pcts = agg_df["P&L %"].tolist()
    max_abs  = max((abs(v) for v in pnl_pcts), default=1.0) or 1.0

    cell_labels = [
        f"{row['Symbol']}<br><span style='font-size:10px'>{row['Weight %']:.1f}%  "
        f"{'+'if row['P&L %']>=0 else ''}{row['P&L %']:.2f}%</span>"
        for _, row in agg_df.iterrows()
    ]

    fig = go.Figure(go.Treemap(
        labels=agg_df["Symbol"].tolist(),
        parents=[""] * len(agg_df),
        values=agg_df["Market Value"].tolist(),
        text=cell_labels,
        textinfo="text",
        customdata=list(zip(
            agg_df["Weight %"],
            agg_df["P&L %"],
            agg_df["Market Value"],
            agg_df["Unrealized P&L"],
        )),
        hovertemplate=(
            "<b>%{label}</b><br>"
            "Market Value: $%{customdata[2]:,.2f}<br>"
            "Weight: %{customdata[0]:.2f}%<br>"
            "P&L: $%{customdata[3]:,.2f}  (%{customdata[1]:+.2f}%)"
            "<extra></extra>"
        ),
        marker=dict(
            colors=pnl_pcts,
            colorscale=[
                [0.00, _RED],
                [0.45, "#1a2535"],
                [0.50, "#1a2535"],
                [0.55, "#1a2535"],
                [1.00, _GREEN],
            ],
            cmin=-max_abs,
            cmid=0,
            cmax=max_abs,
            line=dict(width=2, color="#060a14"),
            showscale=False,
        ),
        textfont=dict(family="Inter, sans-serif", size=12, color="#e2e8f0"),
    ))
    fig.update_layout(
        paper_bgcolor=_CARD,
        font=_FONT,
        height=380,
        margin=dict(l=0, r=0, t=46, b=0),
        title=dict(
            text="Holdings Treemap  (size = market value · colour = P&L %)",
            font=dict(color=_HDR, size=13, family="Inter, sans-serif"),
            x=0, pad=dict(l=4),
        ),
    )
    return fig


def chart_correlation_heatmap(prices_df: pd.DataFrame) -> go.Figure:
    """
    Correlation heatmap of daily returns.
    Colorscale: bright red (-1) → dark neutral (0) → bright green (+1).
    """
    if prices_df.empty or len(prices_df.columns) < 2:
        fig = go.Figure()
        _dark(fig, "Return Correlation Matrix", height=380)
        fig.add_annotation(
            text="Insufficient price history for correlation",
            x=0.5, y=0.5, xref="paper", yref="paper",
            showarrow=False, font=dict(color=_TEXT, size=12),
        )
        return fig

    returns = prices_df.pct_change().dropna()
    corr    = returns.corr()
    symbols = corr.columns.tolist()

    colorscale = [
        [0.00, "#f43f5e"],   # ρ = -1.0  vivid red
        [0.20, "#e11d48"],   # ρ = -0.6  bold red
        [0.40, "#4c1d2e"],   # ρ = -0.2  dark rose
        [0.50, "#1e293b"],   # ρ =  0.0  slate — visibly distinct from card bg
        [0.60, "#14432e"],   # ρ = +0.2  dark emerald
        [0.80, "#059669"],   # ρ = +0.6  bright emerald
        [1.00, "#10b981"],   # ρ = +1.0  vivid green
    ]

    z_text = [
        [f"{corr.iloc[i, j]:.2f}" for j in range(len(symbols))]
        for i in range(len(symbols))
    ]

    fig = go.Figure(go.Heatmap(
        z=corr.values.tolist(),
        x=symbols,
        y=symbols,
        zmin=-1, zmid=0, zmax=1,
        colorscale=colorscale,
        text=z_text,
        texttemplate="%{text}",
        textfont=dict(size=11, color="#e2e8f0", family="JetBrains Mono, monospace"),
        colorbar=dict(
            title=dict(text="ρ", font=dict(color=_TEXT, size=11)),
            tickvals=[-1, -0.5, 0, 0.5, 1],
            ticktext=["-1.0", "-0.5", "0.0", "+0.5", "+1.0"],
            tickfont=dict(color=_TEXT, size=10),
            bgcolor="rgba(0,0,0,0)",
            bordercolor="rgba(255,255,255,0.08)",
            borderwidth=1,
            thickness=14,
            len=0.8,
        ),
        hoverongaps=False,
        hovertemplate="<b>%{x} × %{y}</b><br>ρ = %{z:.3f}<extra></extra>",
        xgap=2, ygap=2,
    ))

    _dark(fig, "Return Correlation Matrix  (252-day daily returns)", height=420)
    fig.update_layout(
        xaxis=dict(
            side="bottom", tickangle=-35,
            color=_TEXT, gridcolor="rgba(0,0,0,0)",
        ),
        yaxis=dict(
            color=_TEXT, autorange="reversed",
            gridcolor="rgba(0,0,0,0)",
        ),
        margin=dict(l=80, r=80, t=46, b=80),
    )
    return fig


def chart_winners_losers(agg_df: pd.DataFrame) -> go.Figure:
    """Horizontal bar of unrealized P&L per symbol, sorted best to worst."""
    df     = agg_df.sort_values("Unrealized P&L")
    colors = [_GREEN if v >= 0 else _RED for v in df["Unrealized P&L"]]
    texts  = [
        f"{'+'if v>=0 else ''}${v:,.0f}  ({p:+.2f}%)"
        for v, p in zip(df["Unrealized P&L"], df["P&L %"])
    ]

    fig = go.Figure(go.Bar(
        x=df["Unrealized P&L"],
        y=df["Symbol"],
        orientation="h",
        marker_color=colors,
        marker_line=dict(width=0),
        text=texts,
        textposition="outside",
        textfont=dict(size=10, color=_TEXT),
        hovertemplate=(
            "<b>%{y}</b><br>"
            "P&L: $%{x:,.2f}"
            "<extra></extra>"
        ),
    ))
    _dark(fig, "Unrealized P&L by Symbol  (aggregated positions)", height=360)
    fig.update_layout(
        xaxis=dict(
            title="Unrealized P&L ($)",
            tickprefix="$",
            tickformat=",.0f",
            zeroline=True,
            zerolinecolor="rgba(255,255,255,0.12)",
            zerolinewidth=1,
        ),
        yaxis=dict(title=""),
        bargap=0.3,
    )
    return fig
