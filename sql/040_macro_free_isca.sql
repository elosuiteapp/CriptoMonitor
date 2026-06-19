-- 040 — Isca Free do módulo Macro. A aba "Macro & Correlações" deixou de ser Pro-only:
-- abre no Free em versão leve (síntese + indicadores-chave + calendário). Aqui liberamos,
-- no nível do banco, só os indicadores "vento macro" (Nasdaq, DXY, VIX, USD/JPY) para
-- qualquer conta; o resto da matriz + Liquidez DeFi + CME/CFTC continuam Pro
-- (gating na UI via KEY_FREE no MacroTab.tsx, e aqui no RLS).
--
-- Os ativos Ásia/Europa/carry (USDJPY, ^N225, ^HSI, ^GDAXI, EURUSD=X) foram adicionados
-- ao coletor em collector/sources/macro_markets.py (lista _MACRO).

drop policy if exists "macro_assets_select" on public.macro_assets;
create policy "macro_assets_select" on public.macro_assets for select to authenticated
using ( (plan_is_advanced() AND ts_within_history(ts)) OR symbol in ('NASDAQ', 'DXY', 'VIX', 'USDJPY') );

drop policy if exists "macro_corr_select" on public.macro_correlations;
create policy "macro_corr_select" on public.macro_correlations for select to authenticated
using ( (plan_is_advanced() AND ts_within_history(ts)) OR macro_symbol in ('NASDAQ', 'DXY', 'VIX', 'USDJPY') );
