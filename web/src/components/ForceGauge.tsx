import { LEVEL_TEXT } from "../lib/format";
import type { Level } from "../lib/types";

interface Props {
  /** Posição do marcador, 0..1 (esquerda→direita). null = sem dado. */
  pos: number | null;
  /** Texto do valor à direita (ex.: "+44% 7d"). Cor segue o `level`. */
  value: string;
  level: Level;
  left: string; // rótulo da ponta esquerda
  right: string; // rótulo da ponta direita
  /** Rótulo pequeno acima da barra (ex.: "atividade"). */
  label?: string;
}

/** Barra de força/correlação de alta precisão: trilho fino (h-1.5) com gradiente
 *  vermelho→neutro→verde e marcador em TRAÇO VERTICAL milimétrico (não bolinha).
 *  Mesmo visual do medidor de correlação do Macro. */
export default function ForceGauge({ pos, value, level, left, right, label }: Props) {
  const p = pos == null ? 0.5 : Math.max(0, Math.min(1, pos));
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        {label ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        ) : (
          <span />
        )}
        <span
          className={`num text-xs font-semibold ${pos == null ? "text-muted-foreground" : LEVEL_TEXT[level]}`}
        >
          {pos == null ? "sem dado" : value}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-1.5 rounded-full"
        style={{
          background:
            "linear-gradient(to right, rgb(244 63 94 / 0.55), rgb(148 163 184 / 0.3), rgb(16 185 129 / 0.55))",
        }}
      >
        {/* Marcador: traço vertical de precisão, mais alto que o trilho. */}
        <div
          className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-sm ring-1 ring-background"
          style={{ left: `${p * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
