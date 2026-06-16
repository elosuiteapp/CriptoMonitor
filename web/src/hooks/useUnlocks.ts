import { useEffect, useState } from "react";

import { fetchNextUnlock, type UnlockEvent } from "../lib/onchain";

/** Próximo token unlock do ativo (DefiLlama). null quando não aplicável.
 *  Unlocks mudam devagar → busca uma vez por moeda. */
export function useUnlocks(asset: string): UnlockEvent | null {
  const [unlock, setUnlock] = useState<UnlockEvent | null>(null);

  useEffect(() => {
    let active = true;
    setUnlock(null);
    fetchNextUnlock(asset)
      .then((u) => active && setUnlock(u))
      .catch(() => active && setUnlock(null));
    return () => {
      active = false;
    };
  }, [asset]);

  return unlock;
}
