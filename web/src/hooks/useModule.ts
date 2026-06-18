import { useState } from "react";

import { DEFAULT_MODULE, type ModuleId } from "../lib/modules";

/** Módulo de mercado ativo (Crypto/B3/Forex). **NÃO é persistido de propósito**:
 *  o app sempre ABRE na tela inicial (módulo Crypto). A troca de mercado vale só
 *  durante a sessão e some no reload — junto com a aba (Cockpit) e a moeda (BTC),
 *  que já iniciam no padrão. (Pedido do dono: sempre carregar a página inicial.) */
export function useModule() {
  const [current, setCurrent] = useState<ModuleId>(DEFAULT_MODULE);
  return { module: current, setModule: setCurrent };
}
