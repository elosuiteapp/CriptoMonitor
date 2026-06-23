import { useT } from "../lib/i18n";

/** Disclaimer persistente — obrigatório em toda tela de análise (PRD §1.1, §8.3). */
export default function Disclaimer() {
  const { t } = useT();
  return (
    <p className="border-t border-border px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
      {t.disclaimer}
    </p>
  );
}
