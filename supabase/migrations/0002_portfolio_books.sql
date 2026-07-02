-- =============================================================================
-- Century Portfolio Dashboard — Migration 0002
-- Adds portfolio book (Investment / Trading) segregation.
-- =============================================================================
-- Safe to re-run (all statements are idempotent).
-- Backfills every existing position row as 'investment'.
-- =============================================================================

-- ── Add portfolio_type to the live positions snapshot table ──────────────────
alter table public.positions
    add column if not exists portfolio_type text not null default 'investment'
        check (portfolio_type in ('investment', 'trading'));

-- ── Add portfolio_type to the historical daily_positions table ───────────────
alter table public.daily_positions
    add column if not exists portfolio_type text not null default 'investment'
        check (portfolio_type in ('investment', 'trading'));

-- ── Persistent symbol-level book classification ──────────────────────────────
-- One row per symbol. The web frontend uses localStorage for instant UX, but
-- this table acts as the authoritative server-side record so the pusher can
-- tag positions automatically.
create table if not exists public.position_books (
    symbol           text        primary key,
    portfolio_type   text        not null default 'investment'
                                 check (portfolio_type in ('investment', 'trading')),
    trading_capital  numeric     not null default 10000,   -- logical capital for trading book
    note             text,
    assigned_at      timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- Index for fast lookups (small table, but keeps things consistent)
create index if not exists position_books_type_idx
    on public.position_books (portfolio_type);

-- ── RLS: same pattern as existing tables ─────────────────────────────────────
alter table public.position_books enable row level security;
drop policy if exists position_books_read on public.position_books;
create policy position_books_read
    on public.position_books for select
    to anon, authenticated
    using (true);

-- Allow authenticated writes for the web client to persist classifications
drop policy if exists position_books_write on public.position_books;
create policy position_books_write
    on public.position_books for all
    to authenticated
    using (true)
    with check (true);

-- ── Backfill: existing positions rows stay as 'investment' (already default) ─
-- No data migration needed: default 'investment' applies to existing rows.
-- If you want to explicitly mark rows (safe no-op):
-- update public.positions set portfolio_type = 'investment' where portfolio_type is null;
-- update public.daily_positions set portfolio_type = 'investment' where portfolio_type is null;
