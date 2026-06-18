-- ═══════════════════════════════════════════════════════════════════════════
-- 038_notifications_delete.sql — Dono pode APAGAR suas notificações. Crypto Monitor.
--
-- A `notifications` (032) tinha só policies de SELECT e UPDATE (marcar como lida).
-- Sem DELETE, o usuário não conseguia limpar o histórico do sino — esta migration
-- adiciona o DELETE escopado ao próprio usuário (botão "Limpar" no NotificationsBell).
-- ═══════════════════════════════════════════════════════════════════════════

create policy "notifications_delete" on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());
