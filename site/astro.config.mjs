// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// Site público de marketing/conteúdo do OrbeView (orbeview.com). SSG → SEO forte.
// O app (cockpit) é um projeto separado em ../web (app.orbeview.com).
// https://astro.build/config
export default defineConfig({
  site: "https://orbeview.com",
  integrations: [
    // i18n: rotas PT na raiz, EN sob /en/. O sitemap agrupa cada par e emite os
    // <xhtml:link hreflang> automaticamente (pt-BR ↔ en) para o Google.
    sitemap({
      i18n: {
        defaultLocale: "pt",
        locales: { pt: "pt-BR", en: "en" },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
