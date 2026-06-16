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
    <Card highlight={institutional} className="p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[reading.level]}`} />
        <span className="flex-1">
          <span className="section-title flex items-center gap-1.5">
            {title}
            {info && <InfoTip text={info} />}
          </span>
          <span className="mt-0.5 block text-sm text-foreground">{reading.label}</span>
        </span>
        <span className="text-xs text-muted-foreground">{open ? "−" : "+"}</span>
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
