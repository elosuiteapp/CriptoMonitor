import type { ReactNode } from "react";

import { gatewayLabel } from "../../lib/adminFormat";

/** Card base — sombra em camadas no claro, reflexo de vidro no escuro (mesmo
 *  idioma premium do app). `hover` ativa elevação ao passar o mouse. */
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover shadow-card dark:bg-card/60 dark:shadow-glow ${
        hover ? "transition-shadow duration-200 hover:shadow-card-hover" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

type Tone = "good" | "bad" | "warn" | undefined;

const TONE_TEXT: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-rose-600 dark:text-rose-400",
  warn: "text-amber-600 dark:text-amber-400",
};
const TONE_ICON_BG: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  bad: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  default: "bg-primary/10 text-primary",
};

/** KPI: rótulo, valor em destaque, linha auxiliar e ícone opcional. */
export function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4" hover>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`num mt-1 text-2xl font-bold ${tone ? TONE_TEXT[tone] : "text-foreground"}`}>{value}</div>
          {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {icon && (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_ICON_BG[tone ?? "default"]}`}>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

const BADGE: Record<string, string> = {
  neutral: "border-border text-muted-foreground",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400",
  yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  accent: "border-primary/40 bg-primary/10 text-primary",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof BADGE | string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${BADGE[tone] ?? BADGE.neutral}`}>{children}</span>;
}

/** Badge de status de assinatura com cor por estado. */
export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge>—</Badge>;
  const tone = status === "active" ? "green" : status === "past_due" ? "yellow" : "red";
  const label = status === "active" ? "ativa" : status === "past_due" ? "em atraso" : "cancelada";
  return <Badge tone={tone}>{label}</Badge>;
}

/** Badge do gateway de pagamento (Mercado Pago / Asaas / Paddle / Manual). */
export function GatewayBadge({ gateway }: { gateway: string | null }) {
  if (!gateway) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: gatewayColor(gateway) }} />
      {gatewayLabel(gateway)}
    </span>
  );
}
function gatewayColor(g: string) {
  return ({ mercadopago: "#00b1ea", asaas: "#1565ff", paddle: "#eab308", manual: "#64748b" } as Record<string, string>)[g] ?? "#64748b";
}

/** Cabeçalho de página: ícone + título + subtítulo, com slot para ações. */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="section-title">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center py-10 text-sm text-muted-foreground">{children}</div>;
}

/** Placeholder de carregamento (linhas pulsando) — evita "salto" da tela. */
export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
      {message}
    </div>
  );
}
