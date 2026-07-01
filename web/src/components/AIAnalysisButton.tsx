import { useNavigate } from "react-router-dom";

import { useT } from "../lib/i18n";

interface Props {
  asset: string;
  dailyUsed?: number;
  dailyLimit?: number | null;
  to?: string; // rota base da análise (cripto: /analysis · B3: /b3-analysis)
  locked?: boolean; // Free (sem módulo pago) não usa IA → vira cadeado p/ /pricing
}

/** Botão fixo "O que está acontecendo?" — costura a narrativa da IA (PRD §8.3).
 *  Contextual por módulo: leva à análise DO ATIVO selecionado (cripto ou B3).
 *  Free não tem IA: mostra cadeado e leva aos planos. */
export default function AIAnalysisButton({ asset, dailyUsed, dailyLimit, to = "/analysis", locked = false }: Props) {
  const { t } = useT();
  const navigate = useNavigate();

  if (locked) {
    return (
      <button
        onClick={() => navigate("/pricing")}
        title={t.aiButton.cta}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
      >
        <span aria-hidden>🔒</span>
        {t.aiButton.cta}
      </button>
    );
  }

  const counter =
    dailyLimit === null
      ? t.aiButton.unlimited
      : dailyLimit != null && dailyUsed != null
        ? t.aiButton.todayOf.replace("{used}", String(dailyUsed)).replace("{limit}", String(dailyLimit))
        : null;

  return (
    <button
      onClick={() => navigate(`${to}?asset=${asset}`)}
      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 12h4l2 6 4-14 2 8h6" />
      </svg>
      {t.aiButton.cta}
      {counter && <span className="text-xs font-normal text-primary-foreground/80">({counter})</span>}
    </button>
  );
}
