import BiasGauge from "../BiasGauge";
import type { B3Fng } from "../../lib/b3";

const tone = (s: number): "bull" | "bear" | "neutral" => (s >= 55 ? "bull" : s <= 45 ? "bear" : "neutral");
const text = (s: number) => (s >= 55 ? "text-emerald-500" : s <= 45 ? "text-rose-500" : "text-amber-500");
const bar = (s: number) => (s >= 55 ? "bg-emerald-500" : s <= 45 ? "bg-rose-500" : "bg-amber-500");

/**
 * Termômetro de Medo & Ganância do mercado brasileiro — índice PRÓPRIO do OrbeView
 * (nenhuma plataforma BR integra isso). 0..100 sintetizando 6 forças de dados grátis,
 * com cada componente à mostra (auditável). Reusa o BiasGauge compartilhado (0..100
 * mapeado em −100..+100). Ver docs/b3-roadmap.md (Onda 2).
 */
export default function B3FearGreedPanel({ fng }: { fng: B3Fng }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Termômetro do mercado · Medo &amp; Ganância Brasil</h3>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <BiasGauge value={(fng.score - 50) * 2} tone={tone(fng.score)} className="h-24 w-48" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
              <span className={`text-2xl font-bold ${text(fng.score)}`}>{fng.score}</span>
            </div>
          </div>
          <div>
            <div className={`text-base font-semibold ${text(fng.score)}`}>{fng.label}</div>
            <div className="text-[11px] text-muted-foreground">0 = medo extremo<br />100 = ganância extrema</div>
          </div>
        </div>
        <div className="min-w-[240px] flex-1 space-y-1.5">
          {fng.components.map((c) => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="w-48 shrink-0 truncate text-[11px] text-muted-foreground">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${bar(c.score)}`} style={{ width: `${c.score}%` }} />
              </div>
              <span className="num w-7 shrink-0 text-right text-[11px] font-semibold text-foreground">{c.score}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Índice próprio: amplitude do mercado, momento do IBOV, faixa de 52 semanas, volatilidade, câmbio e risco global (VIX) sintetizados num só termômetro. Leitura de sentimento, não recomendação.
      </p>
    </div>
  );
}
