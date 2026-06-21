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

export type Tone = "bull" | "bear" | "neutral";
export const biasTone = (bias: number): Tone => (bias >= 12 ? "bull" : bias <= -12 ? "bear" : "neutral");
export const toneText = (t: Tone) => (t === "bull" ? "text-emerald-500" : t === "bear" ? "text-rose-500" : "text-muted-foreground");

/** Medidor semicircular do viés (-100..+100) — mesmo do módulo cripto (arcos + agulha). */
export function BiasGauge({ value, tone }: { value: number; tone: Tone }) {
  const v = Math.max(-100, Math.min(100, value));
  const a = ((90 - v * 0.9) * Math.PI) / 180;
  const cx = 110;
  const cy = 110;
  const r = 78;
  const nx = cx + r * Math.cos(a);
  const ny = cy - r * Math.sin(a);
  const needle = tone === "bull" ? "#10b981" : tone === "bear" ? "#f43f5e" : "#94a3b8";
  return (
    <svg viewBox="0 0 220 124" className="h-28 w-56">
      <path d="M 32 110 A 78 78 0 0 1 71 42.5" fill="none" stroke="#f43f5e" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <path d="M 71 42.5 A 78 78 0 0 1 149 42.5" fill="none" stroke="currentColor" className="text-muted" strokeWidth="10" strokeLinecap="round" />
      <path d="M 149 42.5 A 78 78 0 0 1 188 110" fill="none" stroke="#10b981" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needle} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={needle} />
    </svg>
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
