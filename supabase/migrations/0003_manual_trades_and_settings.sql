-- =============================================================================
-- Century Portfolio Dashboard — Migration 0003
-- Adds:
--   portfolio_settings  — key/value config (risk_budget, etc.)
--   manual_trades       — manually-recorded closed trades not in MT5 history
-- =============================================================================

-- ── portfolio_settings ───────────────────────────────────────────────────────
-- General key/value store for dashboard configuration that must be shared
-- across all devices and users.
create table if not exists public.portfolio_settings (
    key          text        primary key,
    value        text        not null,
    note         text,
    updated_at   timestamptz not null default now()
);

-- Seed defaults
insert into public.portfolio_settings (key, value, note)
values
  ('risk_budget',      '10000', 'Maximum cumulative loss allowed on the trading book (NOT trading capital)')
on conflict (key) do nothing;

-- RLS
alter table public.portfolio_settings enable row level security;
drop policy if exists portfolio_settings_read  on public.portfolio_settings;
drop policy if exists portfolio_settings_write on public.portfolio_settings;

create policy portfolio_settings_read
    on public.portfolio_settings for select
    to anon, authenticated
    using (true);

create policy portfolio_settings_write
    on public.portfolio_settings for all
    to authenticated
    using (true) with check (true);

-- ── manual_trades ─────────────────────────────────────────────────────────────
-- Closed trades entered manually — used when a position was closed in MT5 but
-- either the deal history is incomplete or the trade predates the dashboard.
-- These feed directly into trading statistics, win rate, P&L, etc.
create table if not exists public.manual_trades (
    id             uuid        primary key default gen_random_uuid(),
    symbol         text        not null,
    direction      text        not null check (direction in ('Long', 'Short')),
    volume         numeric     not null default 1,
    entry_price    numeric     not null,
    exit_price     numeric     not null,
    realized_pnl   numeric     not null,    -- positive = win, negative = loss
    open_time      timestamptz not null,
    close_time     timestamptz not null,
    note           text,
    created_at     timestamptz not null default now()
);

create index if not exists manual_trades_symbol_idx on public.manual_trades (symbol);
create index if not exists manual_trades_close_time_idx on public.manual_trades (close_time desc);

-- RLS
alter table public.manual_trades enable row level security;
drop policy if exists manual_trades_read  on public.manual_trades;
drop policy if exists manual_trades_write on public.manual_trades;

create policy manual_trades_read
    on public.manual_trades for select
    to anon, authenticated
    using (true);

create policy manual_trades_write
    on public.manual_trades for all
    to authenticated
    using (true) with check (true);

-- ── Gold trade ────────────────────────────────────────────────────────────────
-- TODO: Replace the placeholder price/date/pnl values below with the actual
--       trade details. The direction, volume, and symbol should match how MT5
--       would record this position.
--
-- Typical GOLD lot sizing in MT5: 1 lot = 100 oz. A 1-point move on GOLD with
-- 1 lot = $1 (contract size varies by broker — verify with your Amplify config).
-- Update entry_price, exit_price, realized_pnl, open_time, close_time.
insert into public.manual_trades
    (symbol, direction, volume, entry_price, exit_price, realized_pnl, open_time, close_time, note)
values
    (
        'GOLD',                         -- MT5 symbol (update if broker uses XAUUSD / GOLD_CASH)
        'Long',
        1.0,                            -- volume in lots (update to actual size)
        3350.00,                        -- entry price $/oz  -- PLACEHOLDER: update to actual
        3280.00,                        -- exit price  $/oz  -- PLACEHOLDER: update to actual
        -700.00,                        -- realized P&L $    -- PLACEHOLDER: update to actual loss
        '2026-06-10 10:00:00+00',       -- open time         -- PLACEHOLDER: update to actual
        '2026-06-12 15:30:00+00',       -- close time        -- PLACEHOLDER: update to actual
        'Gold trading position — loss. UPDATE these placeholder values with actual trade details.'
    )
on conflict do nothing;
