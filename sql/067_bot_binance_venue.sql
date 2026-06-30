-- 067 — Robô passa a operar futuros na BINANCE FUTURES TESTNET (OKX bloqueia derivativos
-- p/ a conta — geo Brasil; ver memória okx-futures-geo-blocked). venue seleciona a corretora
-- de execução; o cérebro (SMC por TF + fluxo) é o mesmo. Demo/testnet sempre.

alter table public.bot_config add column if not exists venue text not null default 'okx';

-- Troca p/ Binance testnet (símbolo sem traço: BTCUSDT).
update public.bot_config set venue = 'binance', inst_id = 'BTCUSDT', base_ccy = 'BTC', quote_ccy = 'USDT', position = 'flat', pos_base_sz = 0, entry_px = null, enabled = false where id = 1;

-- venue no whitelist do bot_set_config.
create or replace function public.bot_set_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.bot_config set
    enabled        = coalesce((p->>'enabled')::boolean, enabled),
    venue          = coalesce(p->>'venue', venue),
    inst_id        = coalesce(p->>'inst_id', inst_id),
    base_ccy       = coalesce(p->>'base_ccy', base_ccy),
    quote_ccy      = coalesce(p->>'quote_ccy', quote_ccy),
    bar            = coalesce(p->>'bar', bar),
    ema_fast       = coalesce((p->>'ema_fast')::int, ema_fast),
    ema_slow       = coalesce((p->>'ema_slow')::int, ema_slow),
    order_quote_sz = coalesce((p->>'order_quote_sz')::numeric, order_quote_sz),
    buy_threshold  = coalesce((p->>'buy_threshold')::numeric, buy_threshold),
    sell_threshold = coalesce((p->>'sell_threshold')::numeric, sell_threshold),
    leverage       = coalesce((p->>'leverage')::numeric, leverage),
    mgn_mode       = coalesce(p->>'mgn_mode', mgn_mode),
    position       = coalesce(p->>'position', position),
    pos_base_sz    = coalesce((p->>'pos_base_sz')::numeric, pos_base_sz),
    entry_px       = case when p ? 'entry_px' then (p->>'entry_px')::numeric else entry_px end,
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;

-- Permitir salvar as chaves da Binance testnet via set_bot_secret (whitelist).
create or replace function public.set_bot_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('okx_api_key','okx_api_secret','okx_api_passphrase','binance_test_key','binance_test_secret') then
    raise exception 'chave nao permitida';
  end if;
  insert into public.app_secrets (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function public.set_bot_secret(text, text) from public, anon;
grant execute on function public.set_bot_secret(text, text) to authenticated;

-- Status de conexão reporta OKX e Binance (booleans, sem vazar segredo).
create or replace function public.bot_config_status()
returns jsonb language sql security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'okx', (select count(*) = 3 from public.app_secrets where key in ('okx_api_key','okx_api_secret','okx_api_passphrase') and coalesce(value,'') <> ''),
    'binance', (select count(*) = 2 from public.app_secrets where key in ('binance_test_key','binance_test_secret') and coalesce(value,'') <> '')
  ) else '{}'::jsonb end;
$$;
revoke all on function public.bot_config_status() from public, anon;
grant execute on function public.bot_config_status() to authenticated;
