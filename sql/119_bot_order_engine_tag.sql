-- 119: carimba cada ORDEM e POSIÇÃO real com o MOTOR (engine) que a criou — p/ o painel separar a
-- receita/perda REAL de cada robô (v28 × 2.0) e mostrar de quem é cada posição aberta.
-- bot-run passa a gravar engine = cfg.bot_engine em savePos e em todos os inserts de bot_orders.
alter table public.bot_orders    add column if not exists engine text not null default 'smc';
alter table public.bot_positions add column if not exists engine text not null default 'smc';
create index if not exists bot_orders_engine_idx on public.bot_orders (engine, created_at desc);
-- posições abertas no momento da migração foram abertas pelo Robô 2.0 (confluence2).
update public.bot_positions set engine = 'confluence2' where position <> 'flat';
