import { useState } from "react";

import { LEVEL_DOT, relativeTime } from "../lib/format";
import type { Reading } from "../lib/format";

interface Props {
  title: string;
  reading: Reading;
  /** Conteúdo extra exibido no estado expandido (mini-gráfico etc). */
  expanded?: React.ReactNode;
  source?: string;
  /** Timestamp do snapshot que originou a leitura (§8.6.5). */
  timestamp?: string | null;
  /** Card de leitura institucional (spot/smart money): ganha borda de destaque + selo. */
  institutional?: boolean;
}

/** Card com semáforo + tradução; expande para o número bruto. Rodapé sempre
 *  mostra a fonte e o horário do dado (PRD §8.3 e §8.6.5). */
export default function MetricCard({ title, reading, expanded, source, timestamp, institutional }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl bg-ink-800/60 p-4 ${
        institutional ? "border-2 border-accent/70 ring-1 ring-accent/15" : "border border-ink-600"
      }`}
    >
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[reading.level]}`} />
        <span className="flex-1">
          <span className="block text-xs uppercase tracking-wide text-slate-500">{title}</span>
          <span className="mt-0.5 block text-sm text-slate-100">{reading.label}</span>
        </span>
        <span className="text-xs text-slate-600">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 border-t border-ink-600 pt-3 text-xs text-slate-400">
          <div className="font-mono text-slate-300">{reading.detail}</div>
          {expanded}
        </div>
      )}

      {(source || timestamp || institutional) && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
          <span className="flex items-center gap-1.5">
            {institutional && (
              <span className="rounded bg-accent/20 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-accent">
                Institucional
              </span>
            )}
            {source && <span>Fonte: {source}</span>}
          </span>
          <span>{relativeTime(timestamp)}</span>
        </div>
      )}
    </div>
  );
}
