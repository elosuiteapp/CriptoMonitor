// Utilidades e UI compartilhadas do módulo B3 (isoladas da cripto).
import type { ReactNode } from "react";

export const fmtBRL = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: dec }));
export const fmtNum = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
export const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
/** Percentual já em base 100 (ex.: DY 7,65), sem sinal de "+". */
export const fmtPctRaw = (n: number | null, dec = 2) => (n == null ? "—" : `${n.toFixed(dec)}%`);
/** Múltiplo (P/L, P/VP, EV/EBITDA…) — 2 casas, sem unidade. */
export const fmtMult = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);
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

// Ícone monograma do ativo (sigla colorida) — sem dependência externa, consistente.
const ICON_COLORS = ["bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600", "bg-cyan-600", "bg-pink-600", "bg-lime-600", "bg-fuchsia-600", "bg-emerald-700"];
export function B3AssetIcon({ symbol, kind }: { symbol: string; kind?: string }) {
  const hash = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = kind === "index" ? "bg-amber-500" : kind === "currency" ? "bg-emerald-600" : ICON_COLORS[hash % ICON_COLORS.length];
  const label = kind === "currency" ? "R$" : kind === "index" ? "IBO" : symbol.replace(/[0-9]+$/, "").slice(0, 3);
  return <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${bg} text-[8px] font-bold leading-none text-white`}>{label}</span>;
}

export function Cell({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: number | null }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`num mt-0.5 text-sm font-semibold ${tone != null ? toneCls(tone) : "text-foreground"}`}>{value}</div>
      {sub != null && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Barra de posição numa faixa (mín — atual — máx). Reutilizável: faixa de 52 sem,
 *  preço no range etc. Gradiente verde(barato)→cinza→vermelho(esticado) + marcador. */
export function RangeBar({ low, high, current, lowLabel = "mín", highLabel = "máx", fmt = fmtBRL }: { low: number; high: number; current: number; lowLabel?: string; highLabel?: string; fmt?: (n: number | null) => string }) {
  const span = high - low;
  const pos = span > 0 ? Math.max(0, Math.min(1, (current - low) / span)) : 0.5;
  const pct = Math.round(pos * 100);
  const word = pct >= 85 ? "perto da máxima" : pct <= 15 ? "perto da mínima" : pct >= 60 ? "metade superior" : pct <= 40 ? "metade inferior" : "no meio";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Posição na faixa</span>
        <span className="num text-foreground">{pct}% · <span className="text-muted-foreground">{word}</span></span>
      </div>
      <div className="relative mt-2 h-2 rounded-full" style={{ background: "linear-gradient(to right, rgba(16,185,129,0.45), rgba(148,163,184,0.30), rgba(244,63,94,0.45))" }}>
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background shadow-card" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="num text-emerald-600 dark:text-emerald-400">{fmt(low)} <span className="text-muted-foreground">{lowLabel}</span></span>
        <span className="num text-rose-600 dark:text-rose-400">{fmt(high)} <span className="text-muted-foreground">{highLabel}</span></span>
      </div>
    </div>
  );
}

export type Tone = "bull" | "bear" | "neutral";
export const biasTone = (bias: number): Tone => (bias >= 12 ? "bull" : bias <= -12 ? "bear" : "neutral");
export const toneText = (t: Tone) => (t === "bull" ? "text-emerald-500" : t === "bear" ? "text-rose-500" : "text-muted-foreground");

// Medidor semicircular do viés — primitivo compartilhado (mesmo do módulo cripto).
// Re-exportado aqui para os componentes do B3 que já importam de B3Shared.
export { default as BiasGauge } from "../BiasGauge";

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
