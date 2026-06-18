import { useEffect } from "react";

/**
 * Fecha um overlay (modal, drawer, dropdown) quando o usuário aperta ESC.
 * Passe `active=false` para desligar o listener enquanto o overlay está fechado
 * — assim vários overlays podem coexistir sem disparar uns aos outros.
 *
 * Uso:
 *   useEscapeKey(onClose);                 // modal sempre montado quando aberto
 *   useEscapeKey(() => setOpen(false), open); // dropdown controlado por estado
 */
export function useEscapeKey(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}
