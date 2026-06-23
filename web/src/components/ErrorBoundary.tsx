import { Component, type ErrorInfo, type ReactNode } from "react";

import { getT } from "../lib/i18n";

interface Props {
  children: ReactNode;
  label?: string;
}
interface State {
  error: Error | null;
}

/** Captura erros de render de uma subárvore e mostra uma mensagem (em vez de tela
 *  em branco/preta). Use ao redor de seções isoladas (ex.: cada módulo de mercado). */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Ajuda a depurar pelo console do navegador.
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const t = getT();
      return (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm">
          <p className="font-semibold text-rose-600 dark:text-rose-400">
            {t.errorBoundary.brokeIn.replace("{label}", this.props.label ?? t.errorBoundary.thisSection)}
          </p>
          <p className="mt-1 break-words text-muted-foreground">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {t.errorBoundary.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
