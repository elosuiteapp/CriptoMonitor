import { Card, Empty, ErrorBox, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtDateTime, fmtInt, timeAgo } from "../../lib/adminFormat";
import type { DataHealthRow } from "../../lib/adminTypes";

// Cadência ESPERADA por fonte (em minutos). Define quando uma fonte vira
// "atrasando"/"obsoleta". Sem isso, fontes diárias (Fear&Greed) e semanais (COT)
// apareceriam como obsoletas falsamente.
const EXPECTED_MIN: Record<string, number> = {
  // núcleo do coletor — a cada ciclo (~5 min)
  prices_cex: 15,
  derivatives: 15,
  gamma_profile: 15,
  onchain_perps: 15,
  dex_liquidity: 15,
  defi_health: 15,
  options_oi: 15,
  options_flow: 15,
  volatility_index: 15,
  market_snapshot: 15,
  // Coinalyze com rodízio de página (cada símbolo atualiza por vez)
  liquidations: 90,
  orderbook_walls: 90,
  // macro (~15 min)
  macro: 40,
  macro_assets: 40,
  // notícias (~horário)
  news_feed: 240,
  // diários
  sentiment: 1500,
  market_liquidity: 1500,
  macro_correlations: 1500,
  // ETF spot — dias úteis (pula fim de semana/feriado dos EUA)
  etf_flows: 4320,
  // COT (CFTC) — semanal, sai sexta
  cot_positioning: 11520,
};
const DEFAULT_EXPECTED = 60;

function cadence(exp: number): string {
  if (exp <= 20) return "~5 min";
  if (exp <= 90) return "rodízio (~1h)";
  if (exp <= 240) return "horário";
  if (exp <= 1500) return "diário";
  if (exp <= 4320) return "dias úteis";
  return "semanal";
}

/** Estado RELATIVO à cadência esperada da fonte. */
function statusOf(age: number | null, source: string): { color: string; label: string; bad: boolean } {
  if (age == null) return { color: "#ef4444", label: "sem dados", bad: true };
  const exp = EXPECTED_MIN[source] ?? DEFAULT_EXPECTED;
  if (age <= exp) return { color: "#22c55e", label: "fresco", bad: false };
  if (age <= exp * 3) return { color: "#eab308", label: "atrasando", bad: false };
  return { color: "#ef4444", label: "obsoleto", bad: true };
}

export default function System() {
  const { data, loading, error, reload } = useAdminRpc<DataHealthRow[]>("admin_data_health");

  if (error) return <ErrorBox message={error} />;

  const rows = data ?? [];
  const stale = rows.filter((r) => statusOf(r.age_min, r.source).bad).length;
  const totalRows = rows.reduce((a, r) => a + Number(r.row_count), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saúde do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Frescor de cada fonte do pipeline, avaliado pela cadência esperada de cada uma.
          </p>
        </div>
        <button
          onClick={() => reload()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Fontes monitoradas" value={fmtInt(rows.length)} />
        <StatCard label="Fontes com problema" value={fmtInt(stale)} tone={stale > 0 ? "bad" : "good"} />
        <StatCard label="Registros totais" value={fmtInt(totalRows)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Fonte</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Esperado</th>
                <th className="px-4 py-3 font-medium">Última atualização</th>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 text-right font-medium">Registros</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = statusOf(r.age_min, r.source);
                const exp = EXPECTED_MIN[r.source] ?? DEFAULT_EXPECTED;
                return (
                  <tr key={r.source} className="border-b border-border">
                    <td className="num px-4 py-3 text-xs text-foreground">{r.source}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
                        {f.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{cadence(exp)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.last_ts)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{timeAgo(r.last_ts)}</td>
                    <td className="num px-4 py-3 text-right text-foreground">{fmtInt(Number(r.row_count))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Carregando…</Empty>}
      </Card>

      <p className="text-xs text-muted-foreground">
        Obs.: este painel monitora o <b>pipeline do coletor</b> (servidor). Os sinais on-chain do
        Smart Money (unlocks, stablecoins, atividade de rede, funding/OI) são buscados <b>ao vivo no
        navegador</b> de cada usuário — se uma fonte cair, o card some sozinho e não afeta a coleta.
      </p>
    </div>
  );
}
