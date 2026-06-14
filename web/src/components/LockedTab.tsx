import { Link } from "react-router-dom";

/** Vitrine de aba bloqueada (PRD §8.7 / §8.3). */
export default function LockedTab({ title, plan }: { title: string; plan: string }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-10 text-center">
      <div className="text-3xl">🔒</div>
      <h2 className="mt-3 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">Disponível no plano {plan}.</p>
      <Link
        to="/pricing"
        className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
      >
        Desbloquear no {plan} →
      </Link>
    </div>
  );
}
