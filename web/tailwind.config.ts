import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cores do cockpit (tema escuro)
        ink: {
          900: "#0a0e17",
          800: "#0f1623",
          700: "#161f2e",
          600: "#1e2a3d",
          500: "#2a3850",
        },
        // Semáforo (PRD §8.3)
        signal: {
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
} satisfies Config;
