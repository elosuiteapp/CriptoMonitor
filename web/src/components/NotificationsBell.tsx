import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import { getLocale } from "../hooks/useLocale";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useNotifications, type NotificationRow } from "../hooks/useNotifications";
import { usePush } from "../hooks/usePush";
import { useT } from "../lib/i18n";
import { playAlertSound } from "../lib/sound";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const loc = getLocale() === "en" ? "en-US" : "pt-BR";
  return sameDay
    ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" });
};

/** Sino de notificações: contador de não-lidas, central (dropdown), toggle de
 *  push do navegador e toast quando chega alerta novo ao vivo. */
export default function NotificationsBell({ user }: { user: User }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<NotificationRow[]>([]);
  const navigate = useNavigate();

  const pushToast = useCallback((n: NotificationRow) => {
    playAlertSound(); // aviso sonoro quando um alerta dispara com o app aberto
    setToasts((prev) => [...prev, n]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), 6500);
  }, []);

  const { items, unread, markAllRead, clearAll } = useNotifications(user, pushToast);
  const push = usePush(user);

  useEscapeKey(() => setOpen(false), open);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={t.notif.title}
          className="relative grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <span className="text-sm font-semibold text-foreground">{t.notif.title}</span>
                <div className="flex items-center gap-3">
                  {unread > 0 && (
                    <button onClick={markAllRead} className="text-[11px] text-primary hover:underline">
                      {t.notif.markRead}
                    </button>
                  )}
                  {items.length > 0 && (
                    <button onClick={clearAll} className="text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:underline">
                      {t.notif.clear}
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {t.notif.empty}
                  </p>
                ) : (
                  items.map((n) => (
                    <div
                      key={n.id}
                      className={`border-b border-border/60 px-4 py-2.5 ${n.read_at ? "" : "bg-primary/5"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{n.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Notificações do navegador (Web Push) */}
              {push.supported && (
                <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">
                    {push.permission === "denied"
                      ? t.notif.pushBlocked
                      : push.subscribed
                        ? t.notif.pushActive
                        : t.notif.pushOffer}
                  </span>
                  {push.permission !== "denied" &&
                    (push.subscribed ? (
                      <button
                        onClick={push.disable}
                        disabled={push.busy}
                        className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        {t.notif.disable}
                      </button>
                    ) : (
                      <button
                        onClick={push.enable}
                        disabled={push.busy}
                        className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {push.busy ? "…" : t.notif.enable}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Toasts — pop-up quando o alerta dispara com o app aberto */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              setToasts((prev) => prev.filter((t) => t.id !== n.id));
              navigate("/alerts");
            }}
            className="pointer-events-auto rounded-xl border border-border bg-surface p-3 text-left shadow-2xl transition-opacity"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-primary"><BellIcon /></span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
