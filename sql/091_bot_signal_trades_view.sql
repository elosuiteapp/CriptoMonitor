-- 091_bot_signal_trades_view.sql
-- DATASET DE TREINO: liga cada SINAL da leitura de entrada ao R REAL do trade que ela gerou.
-- Estende a bot_flow_trades (sql/090, que só olhava o flowTilt) pra TODOS os ~20 sinais.
-- Objetivo: medir quais sinais preveem o RESULTADO REAL do trade (R), não só a direção do
-- preço ~1h depois (que é o que o bot-learn mede hoje) -> base pra evoluir/calibrar o robô.
-- Uma linha por (trade fechado × sinal). SECURITY INVOKER: respeita a RLS de bot_logs/bot_orders.
--
-- Uso (acerto do sinal quando concordou × discordou da direção do trade):
--   select signal_label,
--     count(*) filter (where signal_agreed) as n,
--     round(100.0*avg((won)::int) filter (where signal_agreed),0)       as acerto_concordou,
--     round(100.0*avg((won)::int) filter (where signal_agreed=false),0) as acerto_discordou,
--     round(avg(r_mult) filter (where signal_agreed)::numeric,2)         as r_medio
--   from bot_signal_trades group by 1 order by acerto_concordou desc;
--
-- NOTA DE DURABILIDADE: é uma VIEW sobre bot_logs. Enquanto bot_logs não for podado, o dataset
-- cresce e persiste. Pra dataset de treino "à prova de bala" (sobreviver a poda de log), o passo
-- seguinte é materializar num TABLE gravado no fechamento do trade (mudança no bot-run).

create or replace view public.bot_signal_trades
with (security_invoker = true) as
with opens as (
  select detail->>'asset' as asset, created_at as t, detail->>'want' as side,
         (detail->>'spot')::numeric as entry_px,
         nullif(detail->>'planStop', '')::numeric as stop_px,
         detail->'signals' as signals
  from public.bot_logs
  where level = 'trade' and (message like '%LONG (compra)%' or message like '%SHORT (venda)%')
),
matched as (
  select c.created_at as exit_at,
         upper(regexp_replace(c.inst_id, 'USDT.*$', '')) as asset,
         c.pnl, c.avg_px as exit_px, o.side, o.entry_px, o.stop_px, o.signals
  from public.bot_orders c
  cross join lateral (
    select side, entry_px, stop_px, signals from opens o
    where o.asset = upper(regexp_replace(c.inst_id, 'USDT.*$', '')) and o.t < c.created_at
    order by o.t desc limit 1
  ) o
  where c.action = 'close' and c.ok = true and c.pnl is not null
)
select
  m.exit_at, m.asset, m.side, m.pnl, (m.pnl > 0) as won,
  case when m.entry_px is not null and m.stop_px is not null and m.exit_px is not null
            and abs(m.entry_px - m.stop_px) > 0
       then round(((m.exit_px - m.entry_px) * (case when m.side = 'long' then 1 else -1 end)
                   / abs(m.entry_px - m.stop_px))::numeric, 3)
  end as r_mult,
  sig->>'key' as signal_key,
  sig->>'label' as signal_label,
  (sig->>'score')::numeric as signal_score,
  case when (m.side = 'long' and (sig->>'score')::numeric > 0)
         or (m.side = 'short' and (sig->>'score')::numeric < 0) then true
       when (sig->>'score')::numeric = 0 then null else false end as signal_agreed
from matched m
cross join lateral jsonb_array_elements(m.signals) as sig;

grant select on public.bot_signal_trades to authenticated;
