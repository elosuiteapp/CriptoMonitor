import { useMemo } from "react";

import { b3Sector, type B3Quote } from "../../lib/b3";
import InfoTip from "../InfoTip";
import { toneCls } from "./B3Shared";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** Rotação setorial — para onde o dinheiro girou nos últimos 30 dias. Mediana do
 *  retorno 30d das ações de cada setor (curado em B3_SECTORS), ranqueada. Só compute
 *  dos dados que o overview já traz (q.d30) — zero rede extra. Clique = líder do setor. */
export default function B3SectorRotation({ quotes, onAsset }: { quotes: B3Quote[]; onAsset?: (s: string) => void }) {
  const rows = useMemo(() => {
    const bySector = new Map<string, B3Quote[]>();
    for (const q of quotes) {
      if (q.kind !== "stock" || q.d30 == null) continue;
      const sec = b3Sector(q.symbol);
      (bySector.get(sec) ?? bySector.set(sec, []).get(sec)!).push(q);
    }
    return [...bySector.entries()]
      .filter(([, qs]) => qs.length >= 2) // setor precisa de ≥2 ações p/ a mediana ter sentido
      .map(([sector, qs]) => ({
        sector,
        m30: median(qs.map((q) => q.d30 as number)),
        count: qs.length,
        leader: qs.slice().sort((a, b) => (b.d30 ?? 0) - (a.d30 ?? 0))[0],
      }))
      .sort((a, b) => b.m30 - a.m30);
  }, [quotes]);

  if (rows.length < 2) return null;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.m30)), 1);

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Rotação setorial
          <InfoTip text="Para onde o dinheiro girou nos últimos 30 dias: mostra o desempenho mediano de cada setor da bolsa. Verde = setor em alta no mês (capital entrando); vermelho = saindo. Ajuda a ver quais setores estão na moda. Clique no líder do setor para abri-lo." />
        </h3>
        <span className="text-xs text-muted-foreground">mediana 30 dias · clique no líder</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const w = (Math.abs(r.m30) / maxAbs) * 50; // % da metade do trilho
          const pos = r.m30 >= 0;
          return (
            <button
              key={r.sector}
              onClick={() => onAsset?.(r.leader.symbol)}
              title={`Líder: ${r.leader.symbol} (${r.leader.d30! >= 0 ? "+" : ""}${r.leader.d30!.toFixed(1)}% em 30d) · ${r.count} ativos`}
              className="group flex w-full items-center gap-2 text-left"
            >
              <span className="flex w-32 shrink-0 flex-col leading-tight sm:w-40">
                <span className="truncate text-xs font-medium text-foreground">{r.sector}</span>
                <span className="truncate text-[10px] text-muted-foreground">líder {r.leader.symbol}</span>
              </span>
              <div className="relative h-4 flex-1">
                <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                <div
                  className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm transition-all group-hover:opacity-90 ${pos ? "bg-emerald-500/80" : "bg-rose-500/80"}`}
                  style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </div>
              <span className={`num w-14 shrink-0 text-right text-xs font-semibold ${toneCls(r.m30)}`}>
                {r.m30 >= 0 ? "+" : ""}{r.m30.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Mediana do retorno de 30 dias das ações de cada setor — para onde o capital girou. Verde = setor em alta no mês; vermelho = saída. Educacional.</p>
    </div>
  );
}
