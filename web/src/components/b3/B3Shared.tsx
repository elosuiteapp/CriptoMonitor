// Utilidades e UI compartilhadas do módulo B3 (isoladas da cripto).
import type { ReactNode } from "react";

export const fmtBRL = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: dec }));
export const fmtNum = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
export const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
export const fmtBig = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1e12) return `R$ ${(n / 1e12).toFixed(2)} tri`;
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(1)} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1)} mi`;
  return `R$ ${n.toLocaleString("pt-BR")}`;
};
export const fmtVol = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} bi`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} mi`;
  return n.toLocaleString("pt-BR");
};
export const toneCls = (n: number | null | undefined) => (n == null ? "text-muted-foreground" : n >= 0 ? "text-emerald-500" : "text-rose-500");
/** Selic diária (BCB série 11) → efetiva anual aproximada. */
export const selicAA = (daily: number | null) => (daily == null ? null : (Math.pow(1 + daily / 100, 252) - 1) * 100);
/** Preço formatado conforme o tipo (índice sem decimais, dólar 4 casas, ação em R$). */
export const fmtAssetPrice = (symbol: string, price: number | null) =>
  symbol === "USD/BRL" ? fmtBRL(price, 4) : symbol === "IBOV" ? fmtNum(price, 0) : fmtBRL(price);

export function Cell({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: number | null }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`num mt-0.5 text-sm font-semibold ${tone != null ? toneCls(tone) : "text-foreground"}`}>{value}</div>
      {sub != null && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Aviso de aba ainda em construção (placeholder informativo). */
export function ComingSoon({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6 dark:bg-card/60">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span aria-hidden>{icon}</span>
        {title}
        <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">em breve</span>
      </div>
      <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
