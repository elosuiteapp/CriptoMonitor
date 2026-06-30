import { useEffect, useState } from "react";

import { fetchB3FiisAll, type B3FiiFund } from "../../lib/b3";
import InfoTip from "../InfoTip";
import { Cell } from "./B3Shared";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)}%`);

/** Leitura de VALOR do FII (P/VP/deságio + DY vs CDI + segmento) — o "smart money" de FII não é
 *  estrutura técnica, é comprar abaixo do patrimônio com renda acima da renda fixa. Só aparece
 *  quando o ativo selecionado é um FII. Isolado; reusa fundamentos já coletados. */
export default function B3FiiRead({ ticker, cdi }: { ticker: string; cdi: number | null }) {
  const [fund, setFund] = useState<B3FiiFund | null>(null);

  useEffect(() => {
    let alive = true;
    fetchB3FiisAll().then((f) => {
      if (alive) setFund(f[ticker] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (!fund) return null;
  const { pvp, dy, segmento } = fund;
  const desagio = pvp != null ? (1 - pvp) * 100 : null; // >0 = deságio (abaixo do patrimônio)
  const dyVsCdi = dy != null && cdi != null ? dy - cdi : null;
  const cheap = pvp != null && pvp < 0.97;
  const rich = pvp != null && pvp > 1.05;
  const income = dy != null && cdi != null && dy >= cdi;
  const read =
    pvp == null
      ? null
      : cheap && income
        ? "Deságio + renda acima do CDI → oportunidade de valor."
        : cheap
          ? "Negociando com deságio (abaixo do valor patrimonial)."
          : rich
            ? "Negociando com ágio (acima do valor patrimonial)."
            : "Perto do valor patrimonial.";

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Leitura do FII · {ticker}
        <InfoTip text="Para FII, o 'smart money' é deságio + renda: comprar abaixo do valor patrimonial (P/VP < 1) e com Dividend Yield acima da renda fixa (CDI). A estrutura técnica abaixo (SMC) é secundária para fundos. Fundamentos via Fundamentus." />
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell
          label="P/VP"
          value={<span className={pvp != null && pvp < 1 ? "text-emerald-500" : rich ? "text-rose-500" : "text-foreground"}>{pvp != null ? pvp.toFixed(2) : "—"}</span>}
          sub={desagio != null ? (desagio >= 0 ? `deságio ${desagio.toFixed(0)}%` : `ágio ${Math.abs(desagio).toFixed(0)}%`) : "preço / patrimônio"}
        />
        <Cell
          label="Dividend Yield"
          value={<span className={income ? "text-emerald-500" : "text-foreground"}>{pct(dy)}</span>}
          sub={dyVsCdi != null ? `${dyVsCdi >= 0 ? "+" : ""}${dyVsCdi.toFixed(1)} pp vs CDI` : "proventos 12m"}
        />
        <Cell label="CDI" value={pct(cdi)} sub="renda fixa (referência)" />
        <Cell label="Segmento" value={segmento ?? "—"} sub="tipo do fundo" />
      </div>
      {read && <p className="mt-2 text-[11px] text-muted-foreground">{read}</p>}
    </div>
  );
}
