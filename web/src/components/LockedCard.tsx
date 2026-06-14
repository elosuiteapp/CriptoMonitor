import { Link } from "react-router-dom";

/** Vitrine de upgrade: card avançado aparece bloqueado no Free (PRD §7.2, §8.3). */
export default function LockedCard({ title }: { title: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-600 bg-ink-800/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-400">{title}</h3>
        <span aria-hidden className="text-lg">🔒</span>
      </div>
      <div className="mt-6 blur-[2px]">
        <div className="h-3 w-3/4 rounded bg-ink-600" />
        <div className="mt-2 h-3 w-1/2 rounded bg-ink-600" />
      </div>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
      >
        Desbloquear no Pro →
      </Link>
    </div>
  );
}
