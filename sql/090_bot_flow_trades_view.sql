-- 090_bot_flow_trades_view.sql
-- Análise do VALOR DO FLUXO: casa cada trade fechado (bot_orders) com o flowTilt gravado na
-- ENTRADA (bot_logs.detail). O fluxo é o único componente que NÃO é backtestável (sem
-- microestrutura histórica) → esta view mede, com os trades reais, se ele é preditivo.
-- Uso: select flow_dir, count(*), count(*) filter (where pnl>0) as wins, avg(pnl) from bot_flow_trades group by 1;
-- Cresce conforme o robô roda; hoje amostra pequena (indicativo, não conclusivo).

create or replace view public.bot_flow_trades
with (security_invoker = true) as
with opens as (
  select detail->>'asset' as asset, created_at as t,
         (detail->>'flowTilt')::numeric as flow, detail->>'want' as want
  from public.bot_logs
  where level = 'trade' and (message like '%LONG (compra)%' or message like '%SHORT (venda)%')
)
select
  c.created_at as exit_at,
  upper(regexp_replace(c.inst_id, 'USDT.*$', '')) as asset,
  c.pnl,
  o.flow as entry_flow,
  o.want as side,
  case when (o.want = 'long' and o.flow > 0) or (o.want = 'short' and o.flow < 0) then 'a_favor'
       when o.flow = 0 then 'neutro' else 'contra' end as flow_dir
from public.bot_orders c
cross join lateral (
  select flow, want from opens o
  where o.asset = upper(regexp_replace(c.inst_id, 'USDT.*$', '')) and o.t < c.created_at
  order by o.t desc limit 1
) o
where c.action = 'close' and c.ok = true and c.pnl is not null;

grant select on public.bot_flow_trades to authenticated;
