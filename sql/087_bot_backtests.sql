-- 087 — Resultados do backtester do robô (medição de expectância/R por moeda).
-- Guarda o ÚLTIMO backtest por moeda (upsert): parâmetros + métricas + trades + curva de equity.
-- Admin-only (a função grava com service role; leitura via painel admin).

create table if not exists public.bot_backtests (
  asset      text primary key,
  params     jsonb not null default '{}'::jsonb,   -- janela, taxas, risco, config usada
  metrics    jsonb not null default '{}'::jsonb,   -- expectância, win%, profit factor, maxDD, etc.
  trades     jsonb not null default '[]'::jsonb,   -- últimos trades (amostra)
  equity     jsonb not null default '[]'::jsonb,   -- curva de equity (downsampled)
  created_at timestamptz not null default now()
);

alter table public.bot_backtests enable row level security;
drop policy if exists bot_backtests_admin_read on public.bot_backtests;
create policy bot_backtests_admin_read on public.bot_backtests for select to authenticated using (public.is_admin());
