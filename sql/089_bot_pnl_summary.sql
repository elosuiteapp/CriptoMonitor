-- 089_bot_pnl_summary.sql
-- Resumo de PnL realizado do robô por dia e por mês (fuso America/Sao_Paulo),
-- para os cards "Saldo do dia" e "Saldo do mês" no /admin/robo.
-- Substitui o card antigo "Resultado realizado (recente)", que somava só as últimas
-- 30 ordens (open+close+add misturadas) → subcontava os fechamentos e parecia quebrado.
-- SECURITY INVOKER: respeita a RLS de bot_orders (admin vê; anon não vê nada).

create or replace function public.bot_pnl_summary()
returns jsonb
language sql
stable
as $$
  with closed as (
    select pnl, (created_at at time zone 'America/Sao_Paulo') as brt
    from public.bot_orders
    where action = 'close' and ok = true and pnl is not null
  ),
  by_month as (
    select
      to_char(date_trunc('month', brt), 'YYYY-MM') as month,
      round(sum(pnl)::numeric, 2) as pnl,
      count(*)::int as trades,
      count(*) filter (where pnl > 0)::int as wins
    from closed
    group by date_trunc('month', brt)
    order by date_trunc('month', brt) desc
  ),
  today as (
    select
      round(coalesce(sum(pnl), 0)::numeric, 2) as pnl,
      count(*)::int as trades,
      count(*) filter (where pnl > 0)::int as wins
    from closed
    where brt::date = (now() at time zone 'America/Sao_Paulo')::date
  )
  select jsonb_build_object(
    'day', (select to_jsonb(t) from today t),
    'months', coalesce((select jsonb_agg(to_jsonb(m)) from by_month m), '[]'::jsonb)
  );
$$;

grant execute on function public.bot_pnl_summary() to authenticated;
