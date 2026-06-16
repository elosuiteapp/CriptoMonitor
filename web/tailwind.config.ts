import type { Config } from "tailwindcss";

/**
 * Tema com tokens semânticos e suporte nativo a claro/escuro (`darkMode: "class"`).
 *
 * Os tokens (background, surface, card, border, foreground, muted…) são dirigidos
 * por CSS variables definidas em `src/index.css` (`:root` = claro, `.dark` = escuro),
 * em canais RGB para permitir opacidade (ex.: `bg-card/60`, `border-primary/20`).
 *
 * REGRA: componentes novos ou migrados usam SEMPRE os nomes semânticos
 * (`bg-surface`, `text-foreground`, `border-border`, `text-muted-foreground`…) —
 * eles trocam de tema sozinhos. As escalas legadas (`ink`, `signal`, `accent`)
 * seguem fixas no escuro para não quebrar telas ainda não migradas e devem sair
 * ao fim da migração.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Tokens semânticos (trocam entre claro/escuro) ──────────────────
        background: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        foreground: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-fg) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-fg) / <alpha-value>)",

        // ── Legado (escuro fixo) — manter até concluir a migração ──────────
        ink: {
          900: "#0a0e17",
          800: "#0f1623",
          700: "#161f2e",
          600: "#1e2a3d",
          500: "#2a3850",
        },
        signal: {
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
        accent: "#6366f1",
      },

      fontFamily: {
        // Interface: Inter (premium, neutra). Cai para system-ui se não carregar.
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        // Tipografia financeira: JetBrains Mono p/ alinhar dígitos (ver `.num`).
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },

      boxShadow: {
        // Claro: sombra em camadas (Stripe/Apple) — uma rente + uma difusa — para
        // os cards brancos saltarem do fundo off-white sem depender de borda.
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 6px 18px -6px rgb(0 0 0 / 0.10)",
        "card-hover": "0 2px 4px 0 rgb(0 0 0 / 0.05), 0 12px 28px -8px rgb(0 0 0 / 0.12)",
        // Escuro: só um reflexo de borda no topo (vidro fosco). Sem glow/sombra
        // colorida — cores secas e opacas, aspecto institucional.
        glow: "inset 0 1px 0 0 rgb(255 255 255 / 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
