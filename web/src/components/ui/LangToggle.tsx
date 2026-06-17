import { useLocale } from "../../hooks/useLocale";

/** Seletor de idioma PT/EN (pill). Define idioma + moeda + gateway de pagamento. */
export default function LangToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 text-[11px] font-semibold">
      <button
        onClick={() => setLocale("pt")}
        className={`rounded-md px-1.5 py-0.5 transition-colors ${locale === "pt" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        title="Português · cobrança em R$ (Asaas)"
      >
        PT
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`rounded-md px-1.5 py-0.5 transition-colors ${locale === "en" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        title="English · billed in US$ (Paddle)"
      >
        EN
      </button>
    </div>
  );
}
