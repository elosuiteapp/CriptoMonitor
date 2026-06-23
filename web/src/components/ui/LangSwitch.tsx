import { useLocale, type Locale } from "../../hooks/useLocale";
import { FlagBR, FlagUS } from "./Flags";

const OPTIONS: { code: Locale; label: string; title: string; Flag: (p: { className?: string }) => JSX.Element }[] = [
  { code: "en", label: "EN", title: "English · billed in US$ (Paddle)", Flag: FlagUS },
  { code: "pt", label: "PT", title: "Português · cobrança em R$ (Asaas)", Flag: FlagBR },
];

/** Seletor de idioma com bandeiras (EN/PT). Define idioma + moeda + gateway, e
 *  persiste num cookie .orbeview.com compartilhado entre a landing e o app.
 *  `compact` esconde o rótulo PT/EN (só bandeiras). */
export default function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5">
      {OPTIONS.map(({ code, label, title, Flag }) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            title={title}
            aria-label={title}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full px-1.5 py-1 transition-all duration-200 ${
              active ? "bg-primary/10 ring-1 ring-primary/40" : "opacity-55 hover:opacity-100"
            }`}
          >
            <span className="block h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-black/10">
              <Flag className="h-full w-full" />
            </span>
            {!compact && (
              <span className={`text-[11px] font-semibold leading-none ${active ? "text-primary" : "text-muted-foreground"}`}>
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
