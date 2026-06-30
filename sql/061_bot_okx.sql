-- 061 — Robô de trade (OKX, modo DEMO) — uso PESSOAL/admin, ISOLADO do SaaS.
-- Guarda credenciais da OKX demo em app_secrets (só service-role), RPCs admin para
-- configurar/ler status e uma tabela de log das ordens. A execução de fato (saldo,
-- posições, ordens) vive na Edge Function okx-bot, que sempre usa x-simulated-trading.
-- Modelo de segurança: tudo guardado por is_admin() (ver sql/019).

-- Log de ordens (manuais agora; automáticas no futuro). Service-role insere; admin lê.
create table if not exists public.bot_orders (
  id          uuid primary key default gen_random_uuid(),
  venue       text not null default 'okx-demo',
  action      text not null,            -- 'order' | 'close' | ...
  inst_id     text,                     -- ex.: BTC-USDT
  side        text,                     -- buy | sell
  ord_type    text,                     -- market | limit
  sz          text,                     -- tamanho (string, como a OKX espera)
  px          text,                     -- preço (limit)
  ok          boolean not null default false,
  result      jsonb,                    -- resposta crua da OKX
  created_at  timestamptz not null default now()
);
alter table public.bot_orders enable row level security;
drop policy if exists "admin_read_bot_orders" on public.bot_orders;
create policy "admin_read_bot_orders" on public.bot_orders for select to authenticated using (public.is_admin());

-- Admin salva credenciais da OKX demo (whitelist) pelo /admin/robo; app_secrets é service-role-only.
create or replace function public.set_bot_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('okx_api_key', 'okx_api_secret', 'okx_api_passphrase') then
    raise exception 'key not allowed';
  end if;
  insert into public.app_secrets(key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function public.set_bot_secret(text, text) from public, anon;
grant execute on function public.set_bot_secret(text, text) to authenticated;

-- Status da config (NUNCA devolve o valor — só se está setado).
create or replace function public.bot_config_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'okx',
      exists(select 1 from app_secrets where key = 'okx_api_key' and value <> '')
      and exists(select 1 from app_secrets where key = 'okx_api_secret' and value <> '')
      and exists(select 1 from app_secrets where key = 'okx_api_passphrase' and value <> '')
  ) into r;
  return r;
end;
$$;
revoke all on function public.bot_config_status() from public, anon;
grant execute on function public.bot_config_status() to authenticated;
