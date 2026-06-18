// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

// Site público de marketing/conteúdo do OrbeView (orbeview.com). SSG → SEO forte.
// O app (cockpit) é um projeto separado em ../web (app.orbeview.com).
// https://astro.build/config
export default defineConfig({
  site: "https://orbeview.com",
  vite: {
    plugins: [tailwindcss()],
  },
});
