import type { Dispatch, SetStateAction } from "react";

import type { LogRow } from "../../../lib/bot/types";
import { LOG_TONE } from "../../../lib/bot/constants";

/** Diário do robô — histórico de leituras/decisões filtrável (nível / moeda). */
export default function BotJournal({ logs, dLevel, setDLevel, dAssetF, setDAssetF }: {
  logs: LogRow[];
  dLevel: string;
  setDLevel: Dispatch<SetStateAction<string>>;
  dAssetF: string;
  setDAssetF: Dispatch<SetStateAction<string>>;
}) {
  if (logs.length === 0) return null;
  const dAssets = [...new Set(logs.map((l) => l.message.match(/^\[(\w+)\]/)?.[1]).filter(Boolean))].sort() as string[];
  const rows = logs.filter((l) => (dLevel === "all" || l.level === dLevel) && (dAssetF === "all" || l.message.startsWith(`[${dAssetF}]`)));
  return (
          <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Diário do robô</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                  {["all", "trade", "info", "warn", "error"].map((lv) => (
                    <button key={lv} onClick={() => setDLevel(lv)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dLevel === lv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{lv === "all" ? "todos" : lv}</button>
                  ))}
                </div>
                {dAssets.length > 1 && (
                  <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                    <button onClick={() => setDAssetF("all")} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dAssetF === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>todas</button>
                    {dAssets.map((a) => (
                      <button key={a} onClick={() => setDAssetF(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dAssetF === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground">{rows.length} de {logs.length}</span>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nada no filtro atual (o diário guarda as últimas {logs.length} entradas carregadas).</p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${LOG_TONE[l.level] ?? LOG_TONE.info}`}>{l.level}</span>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-foreground">{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
  );
}
