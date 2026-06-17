import { Link } from "react-router-dom";

/** Tela 404 — evita o redirect silencioso e orienta o usuário de volta. */
export default function NotFound() {
  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="text-center">
        <p className="num text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-xl font-bold text-foreground">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
