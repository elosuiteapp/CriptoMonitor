-- 066 — Excluir ordem do histórico do robô (controle humano no painel /admin/robo).
-- Só admin; remove a linha do bot_orders (não toca na OKX — cancelar de verdade é via
-- a edge function okx-bot ação 'cancel').

create or replace function public.bot_delete_order(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.bot_orders where id = p_id;
end;
$$;
revoke all on function public.bot_delete_order(uuid) from public, anon;
grant execute on function public.bot_delete_order(uuid) to authenticated;
