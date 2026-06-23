-- =============================================================================
-- Century Portfolio Dashboard — Supabase schema (migration 0001)
-- =============================================================================
-- Idempotent: safe to re-run. Apply with either:
--   • Supabase dashboard → SQL editor → paste + run, or
--   • psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
--
-- DATA MODEL (preserves the MT5 balance ⁄ credit distinction throughout):
--   instruments       — static per-symbol metadata + price→P&L multiplier (M)
--   deals             — append-only MT5 deal ledger (the source of truth)
--   account_snapshots — point-in-time account state (live 60s collector)
--   positions         — open positions at a given snapshot (live 60s collector)
--   symbol_prices     — daily close per symbol (reconstruction inputs)
--   daily_equity      — one row per broker-day: balance/credit/equity series
--   daily_positions   — one row per broker-day per held position
--
--   equity = balance + credit + floating_pnl + swap        (NEVER fold credit
--   into balance — they are separate account components in MT5.)
-- =============================================================================

-- ── instruments ──────────────────────────────────────────────────────────────
create table if not exists public.instruments (
    symbol           text        primary key,
    description      text,
    asset_class      text,                       -- equity | index | commodity | fx | other
    currency         text        default 'USD',
    digits           int,
    contract_size    numeric,
    tick_size        numeric,
    tick_value       numeric,
    m_multiplier     numeric,                     -- price-change × volume × M = P&L
    m_source         text,                        -- calibrated | spec | yfinance
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- ── deals (append-only ledger, source of truth) ──────────────────────────────
create table if not exists public.deals (
    deal_ticket      bigint      primary key,
    account_login    bigint      not null,
    time             timestamptz not null,        -- server wall-clock, stored as UTC
    type             int         not null,        -- MT5 deal type enum
    type_name        text,                         -- BUY/SELL/BALANCE/CREDIT/DIVIDEND/...
    entry            int,                          -- 0=in 1=out 2=inout 3=out_by
    symbol           text,
    volume           numeric     default 0,
    price            numeric     default 0,
    profit           numeric     default 0,
    commission       numeric     default 0,
    swap             numeric     default 0,
    fee              numeric     default 0,
    position_id      bigint,
    order_id         bigint,
    comment          text,
    created_at       timestamptz not null default now()
);
create index if not exists deals_account_time_idx on public.deals (account_login, time);
create index if not exists deals_position_idx      on public.deals (position_id);
create index if not exists deals_type_idx          on public.deals (type);

-- ── account_snapshots (live point-in-time state) ─────────────────────────────
create table if not exists public.account_snapshots (
    id               bigint generated always as identity primary key,
    account_login    bigint      not null,
    captured_at      timestamptz not null,
    balance          numeric     not null,
    credit           numeric     not null default 0,
    floating_pnl     numeric     not null default 0,   -- Σ position.profit
    swap             numeric     not null default 0,   -- Σ position.swap (accrued)
    equity           numeric     not null,             -- balance+credit+floating+swap
    margin           numeric     not null default 0,
    free_margin      numeric     not null default 0,
    margin_level     numeric,
    currency         text        default 'USD',
    leverage         int,
    source           text        not null default 'live',  -- live | backfill
    created_at       timestamptz not null default now(),
    unique (account_login, captured_at)
);
create index if not exists acct_snap_account_time_idx
    on public.account_snapshots (account_login, captured_at desc);

-- ── positions (open positions attached to a snapshot) ────────────────────────
create table if not exists public.positions (
    id               bigint generated always as identity primary key,
    account_login    bigint      not null,
    captured_at      timestamptz not null,
    position_id      bigint      not null,        -- MT5 position ticket
    symbol           text        not null,
    direction        text,                         -- Long | Short
    volume           numeric,
    entry_price      numeric,
    current_price    numeric,
    unrealized_pnl   numeric,
    swap             numeric     default 0,
    market_value     numeric,
    open_time        timestamptz,
    created_at       timestamptz not null default now(),
    unique (account_login, captured_at, position_id)
);
create index if not exists positions_account_time_idx
    on public.positions (account_login, captured_at desc);

-- ── symbol_prices (daily close per symbol) ───────────────────────────────────
create table if not exists public.symbol_prices (
    symbol           text        not null,
    date             date        not null,
    close            numeric     not null,
    source           text        default 'mt5',   -- mt5 | yfinance | ffill
    created_at       timestamptz not null default now(),
    primary key (symbol, date)
);

-- ── daily_equity (one row per broker-day) ────────────────────────────────────
create table if not exists public.daily_equity (
    account_login    bigint      not null,
    date             date        not null,        -- broker-day (server wall-clock)
    balance          numeric     not null,
    credit           numeric     not null default 0,
    floating_pnl     numeric     not null default 0,
    swap             numeric     not null default 0,
    equity           numeric     not null,
    realized_pnl_day numeric     not null default 0,
    deposits         numeric     not null default 0,
    withdrawals      numeric     not null default 0,
    dividends        numeric     not null default 0,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    primary key (account_login, date)
);

-- ── daily_positions (one row per broker-day per held position) ───────────────
create table if not exists public.daily_positions (
    account_login    bigint      not null,
    date             date        not null,
    position_id      bigint      not null,
    symbol           text        not null,
    direction        text,
    volume           numeric,
    close_price      numeric,
    market_value     numeric,
    unrealized_pnl   numeric,
    created_at       timestamptz not null default now(),
    primary key (account_login, date, position_id)
);
create index if not exists daily_pos_account_date_idx
    on public.daily_positions (account_login, date);
create index if not exists daily_pos_symbol_idx
    on public.daily_positions (symbol);

-- =============================================================================
-- Row-Level Security
--   Writers use the service-role key (bypasses RLS).
--   The dashboard reads with the anon key → needs an explicit read policy.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
      'instruments','deals','account_snapshots','positions',
      'symbol_prices','daily_equity','daily_positions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true);',
      t || '_read', t);
  end loop;
end $$;
