import { useEffect, useState } from "react";

/** useState que persiste em localStorage (JSON). Mesma assinatura do useState.
 *  `merge` (opcional) combina o valor salvo com o inicial — útil para objetos de
 *  config que ganham chaves novas com o tempo (ex.: camadas). */
export function usePersistentState<T>(
  key: string,
  initial: T,
  merge = false,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const saved = JSON.parse(raw) as T;
      return merge && initial && typeof initial === "object"
        ? { ...(initial as object), ...(saved as object) } as T
        : saved;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* localStorage indisponível */
    }
  }, [key, value]);

  return [value, setValue];
}
