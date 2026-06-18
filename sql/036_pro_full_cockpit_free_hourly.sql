-- ═══════════════════════════════════════════════════════════════════════════
-- 036_pro_full_cockpit_free_hourly.sql
--   (a) Pro = cockpit completo nos 20 ativos  (supersede o Pro=3 da sql/034)
--   (b) Free = atualização horária (60 min) em vez de 30 min
--
-- Decisão de produto (17/jun/2026): o Pro passa a cobrir os MESMOS 20 ativos do
-- Expert — o cockpit institucional fica completo no Pro. O diferencial do Expert
-- vira a camada de alpha (Smart Money & On-chain, 100 moedas), não a contagem de
-- ativos. Gamma/opções e o relatório de IA seguem só em BTC/ETH/SOL (teto de
-- dado — exige bolsa de opções líquida); os outros 17 têm derivativos & fluxo.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Pro cobre os 20 (igual ao Expert).
update public.plans
   set assets = array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI',
                      'TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM','PEPE']
 where slug = 'pro';

-- (b) Free: 30 → 60 min.
update public.plans set snapshot_interval_min = 60 where slug = 'free';

-- (c) Torna a janela de frequência PARAMÉTRICA. Antes era `minute % 30` fixo, então
--     mudar a coluna não surtia efeito (free continuava em 30). Agora a linha é
--     visível se o minuto for múltiplo do intervalo do plano:
--       free(60)        → só minuto :00            → horário
--       pro/expert(5)   → atalho `<= 5`            → tudo (tempo real)
create or replace function public.ts_within_frequency(check_ts timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.plan_snapshot_min() <= 5
      or (extract(minute from check_ts)::int % public.plan_snapshot_min() = 0);
$$;
