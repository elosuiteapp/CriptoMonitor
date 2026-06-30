import { useMemo, useState } from "react";

import type { B3Funds } from "../../lib/b3";
import InfoTip from "../InfoTip";

type RankKey = "dy" | "cheap" | "roe" | "graham" | "bazin" | "growth";
const RANKS: { key: RankKey; label: string; desc: string }[] = [
  { key: "dy", label: "Maior DY", desc: "Maiores dividend yields (renda)." },
  { key: "cheap", label: "Mais baratas", desc: "Menor P/L (com lucro positivo)." },
  { key: "roe", label: "Maior ROE", desc: "Mais rentáveis sobre o patrimônio." },
  { key: "graham", label: "Graham (valor)", desc: "P/L × P/VP ≤ 22,5 — barata e com patrimônio (Benjamin Graham)." },
  { key: "bazin", label: "Bazin (dividendos)", desc: "DY ≥ 6% a.a. com lucro — método Décio Bazin." },
  { key: "growth", label: "Crescimento", desc: "Maior crescimento de receita em 5 anos." },
];

interface Row { sym: string; label: string; metric: string }

/** Rankings prontos das ações da B3 (assinatura do StatusInvest/Investidor10).
 *  Reusa os fundamentos já carregados; clique abre o ativo. Só nomes líquidos. */
export default function B3Rankings({ funds, onAsset }: { funds: B3Funds; onAsset: (s: string) => void }) {
  const [rank, setRank] = useState<RankKey>("dy");

  const rows = useMemo<Row[]>(() => {
    // Só ações com liquidez relevante (evita micro-caps/lixo nos rankings).
    const all = Object.entries(funds)
      .map(([sym, f]) => ({ sym, f }))
      .filter((x) => x.f.price != null && x.f.liq2m != null && x.f.liq2m > 1_000_000);
    const top = <T,>(arr: T[]) => arr.slice(0, 10);
    switch (rank) {
      case "dy":
        return top(all.filter((x) => x.f.dy != null && x.f.dy > 0).sort((a, b) => b.f.dy! - a.f.dy!)).map((x) => ({ sym: x.sym, label: "DY", metric: `${x.f.dy!.toFixed(2)}%` }));
      case "cheap":
        return top(all.filter((x) => x.f.pl != null && x.f.pl > 0).sort((a, b) => a.f.pl! - b.f.pl!)).map((x) => ({ sym: x.sym, label: "P/L", metric: x.f.pl!.toFixed(1) }));
      case "roe":
        return top(all.filter((x) => x.f.roe != null).sort((a, b) => b.f.roe! - a.f.roe!)).map((x) => ({ sym: x.sym, label: "ROE", metric: `${x.f.roe!.toFixed(1)}%` }));
      case "graham":
        return top(all.filter((x) => x.f.pl != null && x.f.pvp != null && x.f.pl > 0 && x.f.pvp > 0 && x.f.pl * x.f.pvp <= 22.5).sort((a, b) => a.f.pl! * a.f.pvp! - b.f.pl! * b.f.pvp!)).map((x) => ({ sym: x.sym, label: "P/L×P/VP", metric: (x.f.pl! * x.f.pvp!).toFixed(1) }));
      case "bazin":
        return top(all.filter((x) => x.f.dy != null && x.f.dy >= 6 && (x.f.roe == null || x.f.roe > 0)).sort((a, b) => b.f.dy! - a.f.dy!)).map((x) => ({ sym: x.sym, label: "DY", metric: `${x.f.dy!.toFixed(2)}%` }));
      case "growth":
        return top(all.filter((x) => x.f.crescRec5a != null).sort((a, b) => b.f.crescRec5a! - a.f.crescRec5a!)).map((x) => ({ sym: x.sym, label: "5a", metric: `${x.f.crescRec5a! >= 0 ? "+" : ""}${x.f.crescRec5a!.toFixed(1)}%` }));
      default:
        return [];
    }
  }, [funds, rank]);

  const cur = RANKS.find((r) => r.key === rank)!;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Rankings · ações
        <InfoTip text="Listas prontas das melhores ações por critério: Maior DY (paga mais dividendos), Mais baratas (menor P/L), Maior ROE (mais rentáveis), Graham e Bazin (métodos clássicos de valor e dividendos) e Crescimento. Clique numa ação para abri-la. Só nomes líquidos. Não é recomendação." />
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {RANKS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRank(r.key)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${rank === r.key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{cur.desc}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados suficientes.</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {rows.map((r, i) => (
            <button
              key={r.sym}
              onClick={() => onAsset(r.sym)}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-left transition-colors hover:border-primary/40"
              title={`Abrir ${r.sym}`}
            >
              <span className="num w-4 shrink-0 text-[10px] font-bold text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{r.sym}</span>
                <span className="num block text-[11px] text-muted-foreground">{r.label} {r.metric}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Apenas ações líquidas (&gt; R$ 1 mi/dia). Educacional — não é recomendação. Fonte: Fundamentus.</p>
    </div>
  );
}
