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

const VALUE_COLOR: Record<Level, string> = {
  green: "text-signal-green",
  yellow: "text-signal-yellow",
  red: "text-signal-red",
  neutral: "text-slate-400",
};

/** Barra de força reutilizável: vermelho (esquerda) → verde (direita), com marcador.
 *  Mesmo visual do medidor de correlação do Macro. */
export default function ForceGauge({ pos, value, level, left, right, label }: Props) {
  const p = pos == null ? 0.5 : Math.max(0, Math.min(1, pos));
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        {label ? (
          <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        ) : (
          <span />
        )}
        <span className={`text-xs font-semibold ${pos == null ? "text-slate-500" : VALUE_COLOR[level]}`}>
          {pos == null ? "sem dado" : value}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-2 rounded-full"
        style={{
          background:
            "linear-gradient(to right, rgba(239,68,68,0.55), rgba(148,163,184,0.3), rgba(34,197,94,0.55))",
        }}
      >
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900"
          style={{ left: `${p * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
