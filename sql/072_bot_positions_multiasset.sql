-- 072 — Estado POR-ATIVO do robô (multi-moeda: BTC/ETH/SOL/BNB). Isolado por moeda:
-- posição + leitura própria. bot_config continua com os ajustes GLOBAIS (enabled, venue,
-- alavancagem, tamanho, limiares). Uso pessoal/admin.
create table if not exists public.bot_positions (
  asset          text primary key,
  inst_id        text,
  position       text not null default 'flat',   -- flat | long | short
  pos_base_sz    numeric not null default 0,
  entry_px       numeric,
  last_bias      numeric,
  last_conviction numeric,
  last_decision  text,
  last_reading   jsonb,
  last_run       timestamptz,
  updated_at     timestamptz not null default now()
);
alter table public.bot_positions enable row level security;
drop policy if exists bot_positions_read on public.bot_positions;
create policy bot_positions_read on public.bot_positions for select to authenticated using (public.is_admin());

-- Semeia as 4 majors (as que têm dados completos: depth/gamma/etc.)
insert into public.bot_positions (asset, inst_id) values
  ('BTC','BTCUSDT'), ('ETH','ETHUSDT'), ('SOL','SOLUSDT'), ('BNB','BNBUSDT')
on conflict (asset) do nothing;

-- Migra a posição atual (BTC) que estava no bot_config.
update public.bot_positions p
set position = c.position, pos_base_sz = c.pos_base_sz, entry_px = c.entry_px
from public.bot_config c where c.id = 1 and p.asset = c.base_ccy;
