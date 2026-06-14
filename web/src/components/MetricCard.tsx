import { useState } from "react";

import { LEVEL_DOT } from "../lib/format";
import type { Reading } from "../lib/format";

interface Props {
  title: string;
  reading: Reading;
  /** Conteúdo extra exibido no estado expandido (mini-gráfico, fonte etc). */
  expanded?: React.ReactNode;
  source?: string;
}

/** Card com semáforo + tradução; expande para mostrar o número bruto (PRD §8.3). */
export default function MetricCard({ title, reading, expanded, source }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
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
          {source && <div className="mt-2 text-slate-600">Fonte: {source}</div>}
        </div>
      )}
    </div>
  );
}
