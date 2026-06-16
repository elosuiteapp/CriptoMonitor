interface Props {
  onBack: () => void;
}

/** Tela do módulo Forex enquanto ele não é implementado. Acessível só ao admin
 *  (preview); para os demais o módulo aparece travado no switcher. */
export default function ForexPlaceholder({ onBack }: Props) {
  return (
    <section className="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
      <div className="max-w-md space-y-3">
        <div className="text-4xl" aria-hidden>
          💱
        </div>
        <h2 className="text-xl font-bold text-foreground">Módulo Forex — em construção</h2>
        <p className="text-sm text-muted-foreground">
          Em breve: pares de moedas, sessões de mercado (Londres/NY/Tóquio), calendário
          econômico e correlações de câmbio. Será liberado com o{" "}
          <span className="text-foreground">plano Forex</span>.
        </p>
        <p className="text-xs text-muted-foreground">Você está vendo este preview por ser administrador.</p>
        <button
          onClick={onBack}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90"
        >
          Voltar ao módulo Crypto
        </button>
      </div>
    </section>
  );
}
