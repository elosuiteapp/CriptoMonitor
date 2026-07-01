-- 080 — Libera os dados PAGOS de B3/Forex para quem tem o módulo (fecha o último
-- passo antes de vender esses módulos). Gating por `plan_modules()` (do sql/078).
-- ALTER POLICY preserva role/comando, só troca a condição (using).
--   • b3_reports / b3_asset_reports: eram admin-only → admin OU módulo B3.
--   • cot_positioning: era plan_is_advanced() (cripto) — o módulo Forex tem advanced=false,
--     então quebrava p/ assinante Forex; passa a admin OU módulo Forex (COT é semanal,
--     sem recorte de histórico). Cripto não usa COT, então nada quebra.
--   • b3_investor_flow já é público (using true) — sem mudança.

alter policy b3_reports_select       on public.b3_reports       using (public.is_admin() or public.plan_modules() @> array['b3']);
alter policy b3_asset_reports_select on public.b3_asset_reports using (public.is_admin() or public.plan_modules() @> array['b3']);
alter policy cot_positioning_select  on public.cot_positioning  using (public.is_admin() or public.plan_modules() @> array['forex']);
