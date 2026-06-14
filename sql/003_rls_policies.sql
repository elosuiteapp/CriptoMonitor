-- ═══════════════════════════════════════════════════════════════════════════
-- 003_rls_policies.sql — Row Level Security e gating por plano
-- Crypto Monitor · PRD §5.3
--
-- Modelo:
--   · O COLETOR grava usando a service_role key, que tem BYPASSRLS — inserts
--     do aggregator nunca são bloqueados por estas policies.
--   · Estas policies controlam o que cada USUÁRIO logado (role authenticated)
--     pode LER, conforme o plano resolvido pelos helpers de 002.
--   · Camadas de gating: (a) ativo permitido, (b) métricas avançadas pro+,
--     (c) snapshot 30 min para Free, (d) janela de histórico por plano.
--
-- Privilégio (GRANT) é nível de tabela; RLS é nível de linha. Os dois atuam juntos.
-- ═══════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

-- ─── Helper: a linha está dentro da janela de histórico do plano? ────────────
create or replace function public.ts_within_history(check_ts timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.plan_history_days() is null then true
    else check_ts > now() - make_interval(days => public.plan_history_days())
  end;
$$;

-- ─── Helper: a linha respeita a frequência de snapshot do plano? ─────────────
-- Free (30 min) enxerga só registros com minuto 00 e 30; pro/expert (5 min) tudo.
create or replace function public.ts_within_frequency(check_ts timestamptz)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.plan_snapshot_min() <= 5
      or (extract(minute from check_ts)::int % 30 = 0);
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ TABELAS DE COLETA — somente leitura para usuários                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
grant select on
  public.prices_cex, public.derivatives, public.options_oi, public.gamma_profile,
  public.defi_health, public.sentiment, public.onchain_perps, public.macro,
  public.dex_liquidity, public.news_feed, public.market_snapshot
to authenticated;

alter table public.prices_cex      enable row level security;
alter table public.derivatives     enable row level security;
alter table public.options_oi      enable row level security;
alter table public.gamma_profile   enable row level security;
alter table public.defi_health     enable row level security;
alter table public.sentiment       enable row level security;
alter table public.onchain_perps   enable row level security;
alter table public.macro           enable row level security;
alter table public.dex_liquidity   enable row level security;
alter table public.news_feed       enable row level security;
alter table public.market_snapshot enable row level security;

-- ─── prices_cex — BÁSICO (Free lê BTC, 30 min) ───────────────────────────────
drop policy if exists prices_cex_select on public.prices_cex;
create policy prices_cex_select on public.prices_cex for select to authenticated
using (
  asset = any (public.plan_assets())
  and public.ts_within_frequency(ts)
  and public.ts_within_history(ts)
);

-- ─── sentiment — BÁSICO global (Free vê Fear & Greed, 30 min) ────────────────
drop policy if exists sentiment_select on public.sentiment;
create policy sentiment_select on public.sentiment for select to authenticated
using (
  public.ts_within_frequency(ts)
  and public.ts_within_history(ts)
);

-- ─── derivatives — AVANÇADO (pro+) ───────────────────────────────────────────
drop policy if exists derivatives_select on public.derivatives;
create policy derivatives_select on public.derivatives for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_history(ts)
);

-- ─── options_oi — AVANÇADO (pro+) ────────────────────────────────────────────
drop policy if exists options_oi_select on public.options_oi;
create policy options_oi_select on public.options_oi for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_history(ts)
);

-- ─── gamma_profile — AVANÇADO (pro+) ─────────────────────────────────────────
drop policy if exists gamma_profile_select on public.gamma_profile;
create policy gamma_profile_select on public.gamma_profile for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_history(ts)
);

-- ─── onchain_perps — AVANÇADO (pro+) ─────────────────────────────────────────
drop policy if exists onchain_perps_select on public.onchain_perps;
create policy onchain_perps_select on public.onchain_perps for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_history(ts)
);

-- ─── dex_liquidity — AVANÇADO (pro+) ─────────────────────────────────────────
drop policy if exists dex_liquidity_select on public.dex_liquidity;
create policy dex_liquidity_select on public.dex_liquidity for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_history(ts)
);

-- ─── macro — AVANÇADO global (pro+) ──────────────────────────────────────────
drop policy if exists macro_select on public.macro;
create policy macro_select on public.macro for select to authenticated
using (
  public.plan_is_advanced()
  and public.ts_within_history(ts)
);

-- ─── defi_health — AVANÇADO global (pro+) ────────────────────────────────────
drop policy if exists defi_health_select on public.defi_health;
create policy defi_health_select on public.defi_health for select to authenticated
using (
  public.plan_is_advanced()
  and public.ts_within_history(ts)
);

-- ─── news_feed — AVANÇADO global (pro+) ──────────────────────────────────────
drop policy if exists news_feed_select on public.news_feed;
create policy news_feed_select on public.news_feed for select to authenticated
using (
  public.plan_is_advanced()
  and public.ts_within_history(published_at)
);

-- ─── market_snapshot — AVANÇADO (pro+); a JSONB consolida tudo ───────────────
-- Free monta os cards a partir de prices_cex + sentiment; o snapshot completo
-- (que contém métricas avançadas) é restrito a pro+. A IA lê via service_role.
drop policy if exists market_snapshot_select on public.market_snapshot;
create policy market_snapshot_select on public.market_snapshot for select to authenticated
using (
  public.plan_is_advanced()
  and asset = any (public.plan_assets())
  and public.ts_within_frequency(ts)
  and public.ts_within_history(ts)
);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ TABELAS DE NEGÓCIO                                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ─── plans — catálogo público (pricing page lê sem login) ────────────────────
grant select on public.plans to anon, authenticated;
alter table public.plans enable row level security;
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select to anon, authenticated
using (true);

-- ─── profiles — cada um lê/edita o próprio ───────────────────────────────────
grant select, update on public.profiles to authenticated;
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- ─── subscriptions — cada um lê a própria (escrita via webhook/service_role) ──
grant select on public.subscriptions to authenticated;
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
using (user_id = auth.uid());

-- ─── usage_log — cada um lê o próprio (escrita via Edge Function/service_role) ─
grant select on public.usage_log to authenticated;
alter table public.usage_log enable row level security;
drop policy if exists usage_log_select on public.usage_log;
create policy usage_log_select on public.usage_log for select to authenticated
using (user_id = auth.uid());

-- ─── ai_analysis — cada um lê as próprias (escrita via Edge Function) ─────────
grant select on public.ai_analysis to authenticated;
alter table public.ai_analysis enable row level security;
drop policy if exists ai_analysis_select on public.ai_analysis;
create policy ai_analysis_select on public.ai_analysis for select to authenticated
using (user_id = auth.uid());

-- ─── alerts — CRUD do próprio; canal validado pelo plano (PRD §5.3) ──────────
grant select, insert, update, delete on public.alerts to authenticated;
alter table public.alerts enable row level security;
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts for select to authenticated
using (user_id = auth.uid());
drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts for insert to authenticated
with check (user_id = auth.uid() and channel = any (public.plan_alert_channels()));
drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and channel = any (public.plan_alert_channels()));
drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts for delete to authenticated
using (user_id = auth.uid());
