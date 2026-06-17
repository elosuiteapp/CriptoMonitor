// Formatadores do painel de administrador (pt-BR; valores de plano em centavos BRL).

export const fmtBRL = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtUSD = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR");

/** Compacta números grandes para os KPIs (1.2k, 3,4 mi). */
export const fmtCompact = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Rótulo amigável do gateway de pagamento. */
export const GATEWAY_LABEL: Record<string, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
  paddle: "Paddle",
  manual: "Manual",
};
export const gatewayLabel = (g: string | null | undefined) =>
  GATEWAY_LABEL[g ?? "manual"] ?? (g || "—");

/** Cor de marca por gateway (para barras/badges). */
export const GATEWAY_COLOR: Record<string, string> = {
  mercadopago: "#00b1ea",
  asaas: "#1565ff",
  paddle: "#ffd230",
  manual: "#64748b",
};

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
