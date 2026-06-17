import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  asset: string | null;
  metric: string | null;
  value: string | null;
  read_at: string | null;
  created_at: string;
}

/** Central de notificações in-app: carrega as últimas, escuta novas ao vivo
 *  (Supabase Realtime) e expõe contagem de não-lidas + marcar como lidas.
 *  `onNew` é chamado para cada notificação que chega ao vivo (usado pelo toast). */
export function useNotifications(user: User | null, onNew?: (n: NotificationRow) => void) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, asset, metric, value, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [user]);

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
          setItems((prev) => [n, ...prev].slice(0, 30));
          onNewRef.current?.(n);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const unread = items.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }, [user, items]);

  return { items, loading, unread, reload: load, markAllRead };
}
