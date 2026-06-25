import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";
import type { ModuleId } from "../lib/modules";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  asset: string | null;
  metric: string | null;
  value: string | null;
  module: string | null;
  read_at: string | null;
  created_at: string;
}

/** Central de notificações in-app: carrega as últimas, escuta novas ao vivo
 *  (Supabase Realtime) e expõe contagem de não-lidas + marcar como lidas.
 *  `modules` = módulos que o usuário acessa → só mostra notificações desses
 *  módulos (isolamento de módulos). `onNew` é chamado para cada notificação que
 *  chega ao vivo (usado pelo toast). */
export function useNotifications(user: User | null, modules: ModuleId[], onNew?: (n: NotificationRow) => void) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const modKey = modules.join(","); // dep estável p/ os efeitos

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, asset, metric, value, module, read_at, created_at")
      .in("module", modKey.split(","))
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [user, modKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: novas notificações entram no topo sem refresh.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          // Isolamento de módulos: ignora notificação de um módulo que o usuário não acessa.
          if (n.module && !modKey.split(",").includes(n.module)) return;
          setItems((prev) => [n, ...prev].slice(0, 30));
          onNewRef.current?.(n);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, modKey]);

  const unread = items.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }, [user, items]);

  // Limpa o histórico do sino (apaga todas as notificações do usuário).
  const clearAll = useCallback(async () => {
    if (!user) return;
    setItems([]);
    await supabase.from("notifications").delete().eq("user_id", user.id);
  }, [user]);

  return { items, loading, unread, reload: load, markAllRead, clearAll };
}
