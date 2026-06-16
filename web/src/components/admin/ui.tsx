import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card dark:bg-card/60 ${className}`}>{children}</div>;
}

type Tone = "good" | "bad" | "warn" | undefined;

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const toneCls =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub != null && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

const BADGE: Record<string, string> = {
  neutral: "border-border text-muted-foreground",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400",
  yellow: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  accent: "border-primary/40 text-primary",
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

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center py-10 text-sm text-muted-foreground">{children}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
      {message}
    </div>
  );
}
