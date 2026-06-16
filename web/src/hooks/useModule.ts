import { useState } from "react";

import { DEFAULT_MODULE, type ModuleId } from "../lib/modules";

const KEY = "cm.market-module";

/** Módulo de mercado ativo (Crypto/Forex), persistido em localStorage. */
export function useModule() {
  const [current, setCurrent] = useState<ModuleId>(() => {
    try {
      return localStorage.getItem(KEY) === "forex" ? "forex" : DEFAULT_MODULE;
    } catch {
      return DEFAULT_MODULE;
    }
  });

  function setModule(id: ModuleId) {
    setCurrent(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* localStorage indisponível — segue só em memória */
    }
  }

  return { module: current, setModule };
}
