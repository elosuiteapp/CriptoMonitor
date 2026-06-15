import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink-600 bg-ink-800/60 ${className}`}>{children}</div>;
}

type Tone = "good" | "bad" | "warn" | undefined;

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const toneCls =
    tone === "good" ? "text-signal-green" : tone === "bad" ? "text-signal-red" : tone === "warn" ? "text-signal-yellow" : "text-white";
  return (
    <Card className="p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub != null && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

const BADGE: Record<string, string> = {
  neutral: "border-ink-500 text-slate-400",
  green: "border-signal-green/40 text-signal-green",
  red: "border-signal-red/40 text-signal-red",
  yellow: "border-signal-yellow/40 text-signal-yellow",
  accent: "border-accent/40 text-accent",
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
      <h2 className="text-sm font-semibold text-slate-300">{children}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center py-10 text-sm text-slate-500">{children}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">
      {message}
    </div>
  );
}
