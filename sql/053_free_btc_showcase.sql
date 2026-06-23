-- ═══════════════════════════════════════════════════════════════════════════
-- 053_free_btc_showcase.sql — Free vira a vitrine do BTC (tempo real + camadas)
-- OrbeView
--
-- Decisão de produto (23/jun/2026): o Free deixa de parecer "versão capada" e
-- passa a parecer o PRODUTO COMPLETO, só que num ativo só (BTC). Ganha:
--   · tempo real (5 min, igual aos pagos);
--   · camadas-vitrine no gráfico: Opções (Call/Put Wall), Zero Gamma, Max Pain,
--     Volume Profile, CVD do varejo e Pressão do book do VAREJO.
-- Segue TRAVADO (o motivo de assinar continua nítido): +19 ativos, CVD/book
-- INSTITUCIONAL (Coinbase), Smart Money, Leitura do Mercado, funding, liquidações,
-- paredes do book, alertas, histórico e IA além de 1/dia.
--
-- Princípio do projeto preservado (sql/002): o que o Free libera fica
-- PARAMETRIZADO em plans.preview_layers (lista de camadas), não hardcoded
-- espalhado nas policies — trocar a vitrine = um UPDATE, sem deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) Nova coluna: camadas do gráfico que um plano pode LIGAR mesmo SEM
--     advanced_metrics (a "vitrine"). Pro/Expert liberam tudo via advanced, então
--     deixam a lista vazia.
alter table public.plans
  add column if not exists preview_layers text[] not null default '{}';

-- (2) Free: tempo real (5 min), barra de camadas habilitada e as camadas-vitrine.
--     bookPressure aqui é só o VAREJO (a policy abaixo recusa a Coinbase ao Free).
update public.plans
   set snapshot_interval_min = 5,
       chart_layers          = true,
       preview_layers        = array['gex','zeroGamma','maxPain','volumeProfile','cvd','bookPressure']
 where slug = 'free';

-- (3) Helper: o plano efetivo libera ESTA camada como preview (sem advanced)?
create or replace function public.plan_has_layer(layer text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select preview_layers from public.plans where slug = public.current_plan_slug()),
    '{}'::text[]
  ) @> array[layer];
$$;

-- (4) gamma_profile — além do pro+ (advanced), libera o PREVIEW (Free) das paredes
--     de opções / zero gamma / max pain, restrito aos ativos do plano (Free = BTC).
drop policy if exists gamma_profile_select on public.gamma_profile;
create policy gamma_profile_select on public.gamma_profile for select to authenticated
using (
  asset = any (public.plan_assets())
  and public.ts_within_history(ts)
  and (public.plan_is_advanced() or public.plan_has_layer('gex'))
);

-- (5) orderbook_imbalance — pro+ (advanced) vê TODAS as fontes; o preview (Free)
--     vê só o VAREJO (exchange <> 'coinbase') dos ativos do plano. O institucional
--     (Coinbase) segue restrito ao avançado → no app vira teaser de upgrade.
drop policy if exists orderbook_imbalance_select on public.orderbook_imbalance;
create policy orderbook_imbalance_select on public.orderbook_imbalance for select to authenticated
using (
  public.ts_within_history(ts)
  and (
    public.plan_is_advanced()
    or (
      public.plan_has_layer('bookPressure')
      and asset = any (public.plan_assets())
      and exchange <> 'coinbase'
    )
  )
);
