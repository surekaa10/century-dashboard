"""
backfill_validate.py  -  READ-ONLY dry run. Writes NOTHING (no Supabase, no files).

Connects to the live MT5 terminal, reconstructs balance / holdings / equity from
the deal ledger (the agreed backfill logic), and prints the 5-part validation
report. If the anchors don't pass, the real backfill must not run.

Run:  py backfill_validate.py
Requires: MT5 terminal running + logged in (read-only investor login is fine).
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd

import MetaTrader5 as mt5
from mt5_connector import MT5Connector

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 30)
pd.set_option("display.max_rows", 60)

INCEPTION = datetime(2000, 1, 1)

# MT5 deal-type enum -> label
DEAL_TYPE = {
    0: "BUY", 1: "SELL", 2: "BALANCE", 3: "CREDIT", 4: "CHARGE",
    5: "CORRECTION", 6: "BONUS", 7: "COMMISSION", 8: "COMMISSION_DAILY",
    9: "COMMISSION_MONTHLY", 10: "AGENT_COMMISSION_DAILY",
    11: "AGENT_COMMISSION_MONTHLY", 12: "INTEREST", 13: "BUY_CANCELED",
    14: "SELL_CANCELED", 15: "DIVIDEND", 16: "DIVIDEND_FRANKED", 17: "TAX",
}
ENTRY_IN, ENTRY_OUT, ENTRY_INOUT, ENTRY_OUT_BY = 0, 1, 2, 3

BAL_TOL = 0.01      # $ tolerance for balance anchor
EQ_TOL  = 1.00      # $ tolerance for equity anchor
VOL_TOL = 1e-6


def _hr(title: str) -> None:
    print("\n" + "=" * 78)
    print(f"  {title}")
    print("=" * 78)


# -- Pull raw MT5 data ---------------------------------------------------------

def fetch_all():
    acct = mt5.account_info()
    positions = mt5.positions_get() or []
    deals = mt5.history_deals_get(INCEPTION, datetime.now() + timedelta(days=1))
    if deals is None:
        deals = []
    rows = []
    for d in deals:
        rows.append({
            "deal_ticket": d.ticket,
            "time":        datetime.fromtimestamp(d.time, tz=timezone.utc).replace(tzinfo=None),  # server wall-clock
            "type":        d.type,
            "entry":       d.entry,
            "symbol":      d.symbol,
            "volume":      d.volume,
            "price":       d.price,
            "profit":      d.profit,
            "commission":  getattr(d, "commission", 0.0),
            "swap":        getattr(d, "swap", 0.0),
            "fee":         getattr(d, "fee", 0.0),
            "position_id": getattr(d, "position_id", 0),
            "order":       getattr(d, "order", 0),
            "comment":     getattr(d, "comment", ""),
        })
    deals_df = pd.DataFrame(rows)
    if not deals_df.empty:
        deals_df = deals_df.sort_values("time").reset_index(drop=True)
    return acct, positions, deals_df


def detect_server_offset(positions):
    sym = positions[0].symbol if positions else "EURUSD"
    mt5.symbol_select(sym, True)
    tick = mt5.symbol_info_tick(sym)
    if not tick or not tick.time:
        return None
    server_wall = datetime.fromtimestamp(tick.time, tz=timezone.utc).replace(tzinfo=None)  # server clock
    real_utc    = datetime.now(timezone.utc).replace(tzinfo=None)
    return round((server_wall - real_utc).total_seconds() / 3600)


# -- Phase 1: cash ledger -> balance --------------------------------------------

DEAL_TYPE_CREDIT = 3   # broker-granted credit line; lives outside MT5 balance


def reconstruct_balance(deals_df):
    """MT5 balance = realized cashflows EXCLUDING credit (type 3).

    Credit is a separate account component in MT5; it never enters
    account_info().balance, only equity. See reconstruct_credit()."""
    if deals_df.empty:
        return 0.0
    non_credit = deals_df[deals_df["type"] != DEAL_TYPE_CREDIT]
    cash = non_credit["profit"] + non_credit["commission"] + non_credit["swap"] + non_credit["fee"]
    return float(cash.sum())


def reconstruct_credit(deals_df):
    """Sum of type-3 CREDIT deals. Tracked separately from balance;
    equity = balance + credit + floating P&L (+ accrued swap)."""
    if deals_df.empty:
        return 0.0
    credit = deals_df.loc[deals_df["type"] == DEAL_TYPE_CREDIT, "profit"]
    return float(credit.sum())


# -- Phase 2: position replay -> holdings ---------------------------------------

def replay_holdings(deals_df):
    """Return {position_id: (symbol, direction, net_volume)} for positions open now."""
    trades = deals_df[deals_df["type"].isin([0, 1])]
    open_pos = {}
    for pid, grp in trades.groupby("position_id"):
        if pid == 0:
            continue
        vol_in  = grp.loc[grp["entry"] == ENTRY_IN,  "volume"].sum()
        vol_out = grp.loc[grp["entry"] == ENTRY_OUT, "volume"].sum()
        net = vol_in - vol_out
        if net > VOL_TOL:
            first_in = grp[grp["entry"] == ENTRY_IN].iloc[0]
            direction = "Long" if first_in["type"] == 0 else "Short"
            open_pos[int(pid)] = (grp["symbol"].iloc[0], direction, float(net))
    return open_pos


def live_holdings(positions):
    out = {}
    for p in positions:
        out[int(p.ticket)] = (p.symbol, "Long" if p.type == 0 else "Short", float(p.volume))
    return out


# -- Phase 4: flow audit -------------------------------------------------------

def flow_audit(deals_df):
    non_trade = deals_df[~deals_df["type"].isin([0, 1])].copy()
    non_trade["type_name"] = non_trade["type"].map(lambda t: DEAL_TYPE.get(t, f"TYPE_{t}"))
    return non_trade


# -- Phase 5: price coverage + M_symbol calibration ----------------------------

def _business_days(d0, d1):
    return int(np.busday_count(d0.date(), (d1 + timedelta(days=1)).date()))


def coverage(deals_df, positions):
    trades = deals_df[deals_df["type"].isin([0, 1])]
    # live calibration multipliers (exact, from MT5's own profit)
    calib = {}
    for p in positions:
        denom = (p.price_current - p.price_open) * p.volume * (1 if p.type == 0 else -1)
        if abs(denom) > 1e-9:
            calib[p.symbol] = p.profit / denom

    rows = []
    today = datetime.now(timezone.utc).replace(tzinfo=None)
    for sym, grp in trades.groupby("symbol"):
        first = grp["time"].min()
        still_open = any(p.symbol == sym for p in positions)
        last = today if still_open else grp["time"].max()
        bdays = max(_business_days(first, last), 1)

        mt5.symbol_select(sym, True)
        rates = mt5.copy_rates_range(sym, mt5.TIMEFRAME_D1, first, last)
        n_bars = 0 if rates is None else len(rates)

        info = mt5.symbol_info(sym)
        if info is not None and info.trade_tick_size:
            spec_M = info.trade_contract_size * (info.trade_tick_value / info.trade_tick_size)
        else:
            spec_M = np.nan
        calib_M = calib.get(sym, np.nan)
        m_src = "calibrated" if sym in calib else ("spec" if not np.isnan(spec_M) else "MISSING")

        rows.append({
            "symbol": sym,
            "first_trade": first.date(),
            "open_now": still_open,
            "hold_bdays": bdays,
            "bars": n_bars,
            "coverage%": round(100 * n_bars / bdays, 1),
            "M_source": m_src,
            "calib_M": round(calib_M, 4) if not np.isnan(calib_M) else None,
            "spec_M": round(spec_M, 4) if not np.isnan(spec_M) else None,
        })
    return pd.DataFrame(rows).sort_values("symbol").reset_index(drop=True)


# -- Main ----------------------------------------------------------------------

def main():
    print("\nMT5 BACKFILL - VALIDATION DRY RUN  (read-only - writes nothing)")
    conn = MT5Connector()
    res = conn.connect()
    if not res.ok:
        print("\nN Could not connect to MT5 - is the terminal running and logged in?")
        print(res.message)
        return
    try:
        acct, positions, deals_df = fetch_all()
        offset = detect_server_offset(positions)

        print(f"\n  Account     : {acct.login}  ({acct.server})")
        print(f"  Currency    : {acct.currency}   Leverage 1:{acct.leverage}")
        print(f"  Deals pulled: {len(deals_df)}   Open positions: {len(positions)}")
        if not deals_df.empty:
            print(f"  Inception   : {deals_df['time'].min().date()}   "
                  f"Last deal: {deals_df['time'].max().date()}")
        print(f"  Server offset vs UTC: "
              f"{('UTC%+d' % offset) if offset is not None else 'undetermined'}  "
              f"(broker-day bucketing uses server wall-clock)")

        checks = []

        # -- 1. Balance --
        _hr("1 - RECONSTRUCTED BALANCE vs MT5 BALANCE")
        recon_bal = reconstruct_balance(deals_df)
        recon_credit = reconstruct_credit(deals_df)
        d_bal = recon_bal - acct.balance
        ok1 = abs(d_bal) < BAL_TOL
        checks.append(ok1)
        print(f"  Reconstructed (cashflows ex-credit): {recon_bal:>16,.2f}")
        print(f"  MT5 account_info().balance       : {acct.balance:>16,.2f}")
        print(f"  Delta                                : {d_bal:>16,.2f}   "
              f"{'Y PASS' if ok1 else 'N FAIL'}  (tol ${BAL_TOL})")
        print(f"\n  Reconstructed credit (type 3)      : {recon_credit:>16,.2f}")
        print(f"  MT5 account_info().credit        : {acct.credit:>16,.2f}")
        d_credit = recon_credit - acct.credit
        print(f"  Delta                                : {d_credit:>16,.2f}   "
              f"{'Y match' if abs(d_credit) < BAL_TOL else 'N mismatch'}")

        # -- 2. Holdings --
        _hr("2 - REPLAYED HOLDINGS vs CURRENT HOLDINGS")
        replay = replay_holdings(deals_df)
        live = live_holdings(positions)
        all_ids = sorted(set(replay) | set(live))
        hrows = []
        ok2 = True
        for pid in all_ids:
            r = replay.get(pid)
            l = live.get(pid)
            sym = (l or r)[0]
            rv = r[2] if r else 0.0
            lv = l[2] if l else 0.0
            match = bool(r) and bool(l) and abs(rv - lv) < VOL_TOL
            if not match:
                ok2 = False
            hrows.append({"position_id": pid, "symbol": sym,
                          "replay_vol": rv, "live_vol": lv,
                          "match": "Y" if match else "N"})
        checks.append(ok2)
        if hrows:
            print(pd.DataFrame(hrows).to_string(index=False))
        else:
            print("  (no open positions on either side)")
        print(f"\n  {'Y PASS' if ok2 else 'N FAIL'}  "
              f"- {sum(1 for h in hrows if h['match']=='Y')}/{len(hrows)} positions reconciled")

        # -- 3. Equity --
        _hr("3 - RECONSTRUCTED EQUITY vs MT5 EQUITY")
        floating_live = sum(p.profit for p in positions)
        swap_live     = sum(getattr(p, "swap", 0.0) for p in positions)
        recon_eq = recon_bal + recon_credit + floating_live + swap_live
        d_eq = recon_eq - acct.equity
        ok3 = abs(d_eq) < EQ_TOL
        checks.append(ok3)
        print(f"  Reconstructed balance            : {recon_bal:>16,.2f}")
        print(f"  + Reconstructed credit             : {recon_credit:>16,.2f}")
        print(f"  + Sum live floating P&L            : {floating_live:>16,.2f}")
        print(f"  + Sum accrued swap (open pos)      : {swap_live:>16,.2f}")
        print(f"  = Reconstructed equity           : {recon_eq:>16,.2f}")
        print(f"  MT5 account_info().equity        : {acct.equity:>16,.2f}")
        print(f"  Delta                                : {d_eq:>16,.2f}   "
              f"{'Y PASS' if ok3 else 'N FAIL'}  (tol ${EQ_TOL})")

        # -- 4. Flow audit --
        _hr("4 - FLOW AUDIT  (non-trade deals)")
        nt = flow_audit(deals_df)
        if nt.empty:
            print("  No non-trade deals found.")
            deposits = withdrawals = 0.0
        else:
            view = nt[["time", "type_name", "profit", "comment"]].copy()
            view["time"] = view["time"].dt.date
            print(view.to_string(index=False))
            bal_ops = nt[nt["type"] == 2]
            deposits    = bal_ops.loc[bal_ops["profit"] > 0, "profit"].sum()
            withdrawals = bal_ops.loc[bal_ops["profit"] < 0, "profit"].sum()
            flagged = nt[nt["type"] != 2]
            print(f"\n  type==2 external flow -> deposits {deposits:,.2f} - "
                  f"withdrawals {withdrawals:,.2f}")
            if not flagged.empty:
                names = flagged["type_name"].value_counts().to_dict()
                print(f"  ! FLAGGED non-(type==2) deals needing your review: {names}")
            else:
                print("  No credit/bonus/correction deals - only type==2 flows. Y")

        # -- 5. Coverage --
        _hr("5 - PRICE COVERAGE + M_symbol CALIBRATION")
        cov = coverage(deals_df, positions)
        if cov.empty:
            print("  (no traded symbols)")
        else:
            print(cov.to_string(index=False))
            missing = cov[cov["M_source"] == "MISSING"]["symbol"].tolist()
            lowcov  = cov[cov["coverage%"] < 90]["symbol"].tolist()
            if missing:
                print(f"\n  ! No price model for: {missing}  (need yfinance fallback)")
            if lowcov:
                print(f"  ! <90% bar coverage: {lowcov}  (will ffill / yfinance-estimate)")

        # -- Verdict --
        _hr("VERDICT")
        anchors_ok = all(checks)   # balance, holdings, equity
        print(f"  Anchor 1 (balance) : {'PASS' if checks[0] else 'FAIL'}")
        print(f"  Anchor 2 (holdings): {'PASS' if checks[1] else 'FAIL'}")
        print(f"  Anchor 3 (equity)  : {'PASS' if checks[2] else 'FAIL'}")
        print()
        if anchors_ok:
            print("  Y VALIDATION PASSED - reconstruction logic is sound.")
            print("    Review the flow audit + coverage above, then approve the write phase.")
        else:
            print("  N VALIDATION FAILED - DO NOT write historical data.")
            print("    Investigate the failing anchor before proceeding.")
        print("\n  (Nothing was written. No Supabase connection was made.)\n")
    finally:
        conn.disconnect()


if __name__ == "__main__":
    main()
