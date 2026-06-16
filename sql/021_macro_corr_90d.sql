-- 021_macro_corr_90d.sql — correlação 90d além da 30d (estabilidade da relação macro)
alter table public.macro_correlations add column if not exists corr_90d numeric;
