-- COT: adiciona o VAREJO (pequenos especuladores / nonreportable) ao posicionamento.
-- O relatório TFF da CFTC já traz a categoria "nonreportable" (traders pequenos demais
-- p/ reportar) = melhor proxy livre de varejo no câmbio. Clássico "dumb money" contrário.
-- Tabela compartilhada cripto+forex; colunas nullable (não quebra o COT de BTC/ETH).
alter table public.cot_positioning
  add column if not exists nonrept_long integer,
  add column if not exists nonrept_short integer,
  add column if not exists nonrept_net integer,
  add column if not exists nonrept_net_chg integer;

comment on column public.cot_positioning.nonrept_net is 'Pequenos especuladores (nonreportable/varejo) liquido = long - short';
