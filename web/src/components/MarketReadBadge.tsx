import BiasGauge from "./BiasGauge";
import { useT } from "../lib/i18n";
import type { MarketRead } from "../lib/indicators/confluence";

const toneText = (tone: "bull" | "bear" | "neutral") =>
  tone === "bull" ? "text-emerald-500" : tone === "bear" ? "text-rose-500" : "text-muted-foreground";

/**
 * Badge compacto do header com o resumo da Leitura do Mercado (viés + convicção +
 * regime). Espelha a aba "Leitura do Mercado" — mesmos números (vindos do mesmo
 * useMarketRead) — unificando a leitura em TODAS as abas. Clicável: abre a aba
 * completa. Recurso Expert; some quando não há leitura/dados.
 */
export default function MarketReadBadge({
  read,
  loading,
  onClick,
}: {
  read: MarketRead | null;
  loading?: boolean;
  onClick?: () => void;
}) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);

  if (loading) {
    return <div className="h-[42px] w-44 animate-pulse rounded-xl border border-border bg-card/60" />;
  }
  if (!read?.hasData) return null;

  const tone = read.regime.tone;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tt("Abrir a Leitura do Mercado", "Open the Market Read")}
      className="group flex items-center gap-2 rounded-xl border border-border bg-card/70 px-2.5 py-1.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-card dark:bg-card/50"
    >
      <BiasGauge value={read.bias} tone={tone} className="h-9 w-16 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className={`num text-sm font-bold ${toneText(tone)}`}>
            {read.bias > 0 ? "+" : ""}
            {read.bias}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tt("Viés", "Bias")}
          </span>
          <span className="text-[10px] text-muted-foreground">
            · {read.conviction}% {tt("conv.", "conf.")}
          </span>
        </div>
        <div className={`max-w-[160px] truncate text-[11px] font-medium ${toneText(tone)}`}>
          {read.regime.label}
        </div>
      </div>
      <span className="self-center pl-0.5 text-xs text-muted-foreground transition-colors group-hover:text-primary" aria-hidden>
        →
      </span>
    </button>
  );
}
