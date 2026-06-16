import { useState } from "react";

import { LEVEL_DOT, relativeTime } from "../lib/format";
import type { Reading } from "../lib/format";
import InfoTip from "./InfoTip";
import Card from "./ui/Card";

interface Props {
  title: string;
  reading: Reading;
  /** Conteúdo extra exibido no estado expandido (mini-gráfico etc). */
  expanded?: React.ReactNode;
  source?: string;
  /** Timestamp do snapshot que originou a leitura (§8.6.5). */
  timestamp?: string | null;
  /** Card de leitura institucional (spot/smart money): ganha destaque + selo. */
  institutional?: boolean;
  /** Explicação do termo (tooltip ⓘ ao lado do título). */
  info?: string;
}

/** Card com semáforo + tradução; expande para o número bruto. Rodapé sempre
 *  mostra a fonte e o horário do dado (PRD §8.3 e §8.6.5). */
export default function MetricCard({ title, reading, expanded, source, timestamp, institutional, info }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      highlight={institutional}
      className="p-4 transition-all duration-200 hover:border-foreground/10 hover:shadow-card-hover"
    >
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[reading.level]}`} />
        <span className="flex-1">
          <span className="section-title flex items-center gap-1.5">
            {title}
            {info && <InfoTip text={info} />}
          </span>
          <span className="mt-1 block text-sm leading-snug text-foreground">{reading.label}</span>
        </span>
        <svg
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="num text-foreground">{reading.detail}</div>
          {expanded}
        </div>
      )}

      {(source || timestamp || institutional) && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {institutional && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-primary">
                Institucional
              </span>
            )}
            {source && <span>Fonte: {source}</span>}
          </span>
          <span className="num">{relativeTime(timestamp)}</span>
        </div>
      )}
    </Card>
  );
}
