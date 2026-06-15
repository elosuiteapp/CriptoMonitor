// Formatadores do painel de administrador (pt-BR; valores de plano em centavos BRL).

export const fmtBRL = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");

export const fmtPct1 = (f: number | null | undefined) =>
  `${((f ?? 0) * 100).toFixed(1)}%`;

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "há 3 min", "há 2 h", "há 1 d" — frescor de dados/eventos. */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} d`;
}
