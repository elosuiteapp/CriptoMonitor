-- ═══════════════════════════════════════════════════════════════════════════
-- 044_ai_cost_tracking.sql — Custo de IA (Gemini) por análise
-- OrbeView
--
-- ai_analysis passa a guardar tokens (entrada/saída) e custo estimado em
-- micro-USD (1e6 = US$ 1). As edge functions generate-analysis e cockpit-report
-- preenchem esses campos a partir do usageMetadata do Gemini. admin_ai_costs()
-- agrega para o painel (hoje/30d/total, por modelo, top usuários, série diária).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ai_analysis add column if not exists input_tokens  int;
alter table public.ai_analysis add column if not exists output_tokens int;
alter table public.ai_analysis add column if not exists cost_usd_micros bigint not null default 0;
comment on column public.ai_analysis.cost_usd_micros is 'custo estimado em micro-USD (1e6 = US$ 1) pelos tokens do modelo';

create or replace function public.admin_ai_costs()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'cost_today_micros', (select coalesce(sum(cost_usd_micros), 0) from public.ai_analysis where created_at >= date_trunc('day', now())),
    'cost_30d_micros',   (select coalesce(sum(cost_usd_micros), 0) from public.ai_analysis where created_at > now() - interval '30 days'),
    'cost_total_micros', (select coalesce(sum(cost_usd_micros), 0) from public.ai_analysis),
    'tokens_in_30d',     (select coalesce(sum(input_tokens), 0)  from public.ai_analysis where created_at > now() - interval '30 days'),
    'tokens_out_30d',    (select coalesce(sum(output_tokens), 0) from public.ai_analysis where created_at > now() - interval '30 days'),
    'by_model', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'model_used', model_used, 'analyses', n, 'in_tokens', it, 'out_tokens', ot, 'cost_micros', cm
             ) order by cm desc), '[]'::jsonb)
      from (
        select model_used, count(*) n, coalesce(sum(input_tokens), 0) it,
               coalesce(sum(output_tokens), 0) ot, coalesce(sum(cost_usd_micros), 0) cm
        from public.ai_analysis group by model_used
      ) m
    ),
    'top_users', (
      select coalesce(jsonb_agg(jsonb_build_object('email', email, 'analyses', n, 'cost_micros', cm) order by cm desc), '[]'::jsonb)
      from (
        select u.email::text as email, count(*) n, coalesce(sum(a.cost_usd_micros), 0) cm
        from public.ai_analysis a join auth.users u on u.id = a.user_id
        where a.user_id is not null
        group by u.email order by cm desc limit 10
      ) t
    ),
    'daily_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'cost_micros', cm) order by d), '[]'::jsonb)
      from (
        select gs::date d,
               coalesce((select sum(cost_usd_micros) from public.ai_analysis a where a.created_at::date = gs::date), 0) cm
        from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') gs
      ) s
    )
  ) into r;
  return r;
end;
$$;
revoke all on function public.admin_ai_costs() from public, anon;
grant execute on function public.admin_ai_costs() to authenticated;
