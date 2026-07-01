-- 070 — Receita (PnL) por ordem do robô. Preenchido no FECHAMENTO (realizado);
-- a posição aberta mostra PnL ao vivo no painel (não persistido). Uso pessoal/admin.
alter table public.bot_orders add column if not exists pnl numeric;
comment on column public.bot_orders.pnl is 'PnL realizado da ordem de fechamento (quote_ccy). Null em aberturas.';
