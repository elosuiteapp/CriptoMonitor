-- 097 — Correções da auditoria de lançamento do B3 (docs/b3-launch-audit.md). APLICADA 02/jul.

-- (1) macro_global estava preso em plan_is_advanced() (capacidade do CRIPTO) → painel
-- "Maré global" e o eixo da Leitura do B3 ficavam MUDOS pro assinante mod_b3 (e mod_forex).
drop policy if exists macro_global_select on public.macro_global;
create policy macro_global_select on public.macro_global
  for select to authenticated
  using (public.is_admin() or public.plan_is_advanced() or (public.plan_modules() && array['b3','forex']));

-- (2) b3_investor_flow tinha using(true) — dado da aba PAGA "Fluxo & Smart Money" aberto
-- a qualquer autenticado. Agora por módulo.
drop policy if exists b3_investor_flow_select on public.b3_investor_flow;
create policy b3_investor_flow_select on public.b3_investor_flow
  for select to authenticated
  using (public.is_admin() or (public.plan_modules() @> array['b3'::text]));

-- (3) CRON do b3-report (não existia; "Relatório Diário" só saía na mão): seg-sex 21:05 UTC
-- (18:05 BRT, pós-fechamento). O modo cron da função gera pregão + FIIs numa chamada.
select cron.schedule('b3-report-daily', '5 21 * * 1-5', $$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/b3-report',
    headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret','<DISPATCH_SECRET>'),
    body := '{}'::jsonb
  );
$$);
