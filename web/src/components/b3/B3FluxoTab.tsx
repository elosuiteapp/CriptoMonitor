import { useEffect, useState } from "react";

import { fetchB3Macro, type B3MacroData } from "../../lib/b3";
import { Cell, ComingSoon, toneCls } from "./B3Shared";

/** Fluxo & Smart Money da B3. Hoje: proxy GRÁTIS do estrangeiro (ADRs + IBOV×dólar).
 *  Fluxo oficial por tipo de investidor e gamma vêm de fontes pagas (em breve). */
export default function B3FluxoTab() {
  const [d, setD] = useState<B3MacroData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchB3Macro().then((r) => {
      if (!alive) return;
      setD(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const adrs = d?.adrs ?? [];
  const avg = adrs.length ? adrs.reduce((s, a) => s + a.premiumPct, 0) / adrs.length : null;
  const dollarCorr = d?.correlations.find((c) => c.ref === "Dólar")?.c30 ?? null;
  const read =
    avg == null
      ? null
      : `${avg >= 0.1 ? "ADRs em prêmio — capital externo comprando" : avg <= -0.1 ? "ADRs em desconto — capital externo vendendo" : "ADRs perto da paridade — estrangeiro neutro"}${dollarCorr != null ? `; IBOV move ao contrário do dólar (corr ${dollarCorr.toFixed(2)}), então dólar em queda costuma acompanhar entrada externa.` : "."}`;

  return (
    <div className="space-y-4">
      {/* Proxy grátis do fluxo estrangeiro */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="text-sm font-semibold text-foreground">Termômetro do estrangeiro (proxy grátis)</h3>
        <p className="mb-3 text-xs text-muted-foreground">Enquanto o fluxo oficial por investidor não está ligado, lemos o capital externo por dados livres: prêmio/desconto dos ADRs na NYSE e a relação IBOV × dólar.</p>
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted/40" />
        ) : adrs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dados de ADRs indisponíveis no momento.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              <Cell
                label="ADRs (média)"
                value={<span className={toneCls(avg)}>{`${avg! >= 0 ? "+" : ""}${avg!.toFixed(2)}%`}</span>}
                sub={avg! >= 0 ? "prêmio → entrada" : "desconto → saída"}
              />
              {adrs.map((a) => (
                <Cell
                  key={a.ticker}
                  label={`${a.name} (${a.ticker})`}
                  value={<span className={toneCls(a.premiumPct)}>{`${a.premiumPct >= 0 ? "+" : ""}${a.premiumPct.toFixed(2)}%`}</span>}
                  sub={a.premiumPct >= 0 ? "prêmio" : "desconto"}
                />
              ))}
            </div>
            {read && <p className="mt-3 border-t border-border/60 pt-3 text-sm text-foreground">{read}</p>}
          </>
        )}
      </div>

      <ComingSoon icon="🏦" title="Fluxo de investidor (estrangeiro · institucional · PF)">
        <p>O "smart money" da B3 é o <strong className="text-foreground">fluxo por tipo de investidor</strong>: saldo diário e acumulado do estrangeiro, institucional e pessoa física — o sinal mais acompanhado do mercado brasileiro.</p>
        <p className="text-[11px]">Fonte: <strong className="text-foreground">dadosdemercado</strong> / Boletim Diário da B3. Por ora, o termômetro acima (ADRs) já antecipa o humor do estrangeiro.</p>
      </ComingSoon>

      <ComingSoon icon="📈" title="Dividendos & proventos">
        <p>O ângulo "qualidade/renda" da B3: dividend yield, histórico de proventos, datas-com e ranking de pagadoras.</p>
        <p className="text-[11px]">Fonte: brapi.dev (com token grátis) + dadosdemercado.</p>
      </ComingSoon>

      <ComingSoon icon="🎯" title="Gamma & Opções (GEX) — o trunfo do cripto na B3">
        <p>O mesmo cockpit de gamma do cripto, nas opções líquidas da B3 (PETR4, VALE3, IBOV): <strong className="text-foreground">Call/Put Wall, Zero Gamma, Max Pain</strong> e exposição a gama por strike.</p>
        <p className="text-[11px]">Requer fonte paga de opções (OpLab — gregas + open interest por strike). A ligar assim que o acesso estiver disponível.</p>
      </ComingSoon>
    </div>
  );
}
