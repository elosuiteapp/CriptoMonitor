-- 101_bot_trades_hist.sql
-- DATASET DE TREINO MATERIALIZADO (à prova de poda de log): 1 linha por trade FECHADO com
-- TUDO que a leitura de entrada viu — signals completos, placar de confluência, flowTilt,
-- setup — + o resultado real (pnl, R, won). Hoje isso vive só nas views bot_signal_trades/
-- bot_flow_trades SOBRE bot_logs: se o log for podado, o histórico de treino morre.
-- Um cron horário (pg_cron roda como postgres, ignora RLS) copia os fechamentos novos.
-- As views continuam valendo pro "ao vivo"; esta tabela é o arquivo permanente.

create table if not exists public.bot_trades_hist (
  asset      text        not null,
  exit_at    timestamptz not null,
  side       text,
  entry_px   numeric,
  exit_px    numeric,
  stop_px    numeric,
  pnl        numeric,
  r_mult     numeric,
  won        boolean,
  setup      text,
  entry_flow numeric,
  conf_votes jsonb,       -- {for, against} na direção do setup (motor v17)
  confluence jsonb,       -- os 4 grupos com score+voto no momento da entrada
  signals    jsonb,       -- vetor completo (~20 sinais com score/peso/nota)
  entry_at   timestamptz,
  primary key (asset, exit_at)
);

alter table public.bot_trades_hist enable row level security;
drop policy if exists admin_read_bot_trades_hist on public.bot_trades_hist;
create policy admin_read_bot_trades_hist on public.bot_trades_hist
  for select to authenticated using (is_admin());

-- Snapshot idempotente: casa cada fechamento (bot_orders) com a última leitura de ENTRADA
-- (bot_logs level='trade' de abertura) daquele ativo antes do fechamento — mesma lógica da
-- view bot_signal_trades, + campos do motor v17 (confluence/confVotes/flowTilt).
create or replace function public.bot_trades_hist_snapshot() returns integer
language sql security definer set search_path = public as $$
  with opens as (
    select detail->>'asset' as asset, created_at as t, detail->>'want' as side,
           (detail->>'spot')::numeric as entry_px,
           nullif(detail->>'planStop','')::numeric as stop_px,
           detail->>'setup' as setup,
           (detail->>'flowTilt')::numeric as entry_flow,
           detail->'confVotes' as conf_votes,
           detail->'confluence' as confluence,
           detail->'signals' as signals
    from bot_logs
    where level = 'trade' and (message like '%LONG (compra)%' or message like '%SHORT (venda)%')
  ),
  ins as (
    insert into bot_trades_hist (asset, exit_at, side, entry_px, exit_px, stop_px, pnl, r_mult, won,
                                 setup, entry_flow, conf_votes, confluence, signals, entry_at)
    select upper(regexp_replace(c.inst_id, 'USDT.*$', '')), c.created_at, o.side, o.entry_px,
           c.avg_px, o.stop_px, c.pnl,
           case when o.entry_px is not null and o.stop_px is not null and c.avg_px is not null
                     and abs(o.entry_px - o.stop_px) > 0
                then round(((c.avg_px - o.entry_px) * (case when o.side = 'long' then 1 else -1 end)
                            / abs(o.entry_px - o.stop_px))::numeric, 3) end,
           (c.pnl > 0), o.setup, o.entry_flow, o.conf_votes, o.confluence, o.signals, o.t
    from bot_orders c
    cross join lateral (
      select * from opens o
      where o.asset = upper(regexp_replace(c.inst_id, 'USDT.*$', '')) and o.t < c.created_at
      order by o.t desc limit 1
    ) o
    where c.action = 'close' and c.ok = true and c.pnl is not null
    on conflict (asset, exit_at) do nothing
    returning 1
  )
  select coalesce(count(*), 0)::int from ins;
$$;

-- Cron horário (minuto 7). Recria o job de forma idempotente.
do $$ begin perform cron.unschedule('bot-trades-hist-hourly'); exception when others then null; end $$;
select cron.schedule('bot-trades-hist-hourly', '7 * * * *', $cron$ select public.bot_trades_hist_snapshot(); $cron$);

-- Backfill imediato do histórico existente.
select public.bot_trades_hist_snapshot();
