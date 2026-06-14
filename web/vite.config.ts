import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O .env fica na raiz do projeto (compartilhado com o coletor), não em web/.
  envDir: "..",
  server: { port: 5173 },
});
