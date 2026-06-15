import { useEffect, useState } from "react";

import { fmtPrice, fmtUsd } from "../lib/format";
import { fetchKlines, type Candle, type Timeframe } from "../lib/marketData";
import { computeSmc, type SmcResult } from "../lib/smc";
import { buildConfluenceSources, type ConfluenceSource, type GammaLevels, type WallLevel } from "../lib/smcConfluence";
import { buildKeyLevels, buildNarrative, type KeyLevel, type ReadingLine, type Tone } from "../lib/smcNarrative";
import { supabase } from "../lib/supabase";
import SmartMoneyChart from "./SmartMoneyChart";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
];

const TONE_DOT: Record<Tone, string> = {
  good: "bg-signal-green",
  bad: "bg-signal-red",
  warn: "bg-signal-yellow",
  neutral: "bg-slate-500",
};

const BIAS_TONE: Record<string, string> = {
  bullish: "border-signal-green/40 text-signal-green",
  bearish: "border-signal-red/40 text-signal-red",
  neutral: "border-ink-500 text-slate-400",
};

const biasDot = (b: "bullish" | "bearish" | "neutral") =>
  b === "bullish" ? "bg-signal-green" : b === "bearish" ? "bg-signal-red" : "bg-slate-500";

export default function SmartMoneyTab({ asset }: { asset: string }) {
  const [tf, setTf] = useState<Timeframe>("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [smc, setSmc] = useState<SmcResult | null>(null);
  const [sources, setSources] = useState<ConfluenceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const klines = await fetchKlines(asset, tf, 320);
        if (!active) return;
        const result = computeSmc(klines);
        setCandles(klines);
        setSmc(result);

        // Confluência: gamma (opções) + paredes do book — dados que a plataforma já coleta
        const [gammaRes, wallsRes] = await Promise.all([
          supabase
            .from("gamma_profile")
            .select("call_wall, put_wall, zero_gamma_level, max_pain, ts")
            .eq("asset", asset)
            .order("ts", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("orderbook_walls")
            .select("side, price, notional_usd, ts")
            .eq("asset", asset)
            .order("ts", { ascending: false })
            .limit(40),
        ]);
        if (!active) return;
        const gamma = (gammaRes.data as GammaLevels | null) ?? null;
        const wallRows = (wallsRes.data as (WallLevel & { ts: string })[]) ?? [];
        const latestTs = wallRows[0]?.ts;
        const walls = wallRows.filter((w) => w.ts === latestTs);
        setSources(buildConfluenceSources(gamma, walls, (v) => fmtUsd(v)));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao carregar dados de mercado");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [asset, tf]);

  const bias = smc?.swingBias ?? "neutral";
  const keyLevels: KeyLevel[] = smc ? buildKeyLevels(smc, sources) : [];
  const narrative: ReadingLine[] = smc ? buildNarrative(smc, sources) : [];

  return (
    <section className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-300">Smart Money · {asset}</h2>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${BIAS_TONE[bias]}`}>
            Viés: {bias === "bullish" ? "alta" : bias === "bearish" ? "baixa" : "indefinido"}
          </span>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-ink-800/60 p-0.5">
          {TFS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                tf === t.id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">{error}</div>
      )}

      {/* Leitura automática em PT */}
      {narrative.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {narrative.map((l, i) => (
            <div key={i} className="flex gap-2 rounded-xl border border-ink-600 bg-ink-800/60 p-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[l.tone]}`} />
              <div>
                <div className="text-xs font-semibold text-slate-300">{l.title}</div>
                <div className="text-xs text-slate-400">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico SMC */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-3">
        {loading && candles.length === 0 ? (
          <div className="grid h-[380px] place-items-center text-sm text-slate-500">Carregando estrutura…</div>
        ) : (
          <SmartMoneyChart candles={candles} smc={smc} />
        )}
        <p className="mt-2 px-1 text-[11px] text-slate-500">
          Zonas: <span className="text-signal-green">verde</span> = demanda/discount ·{" "}
          <span className="text-signal-red">vermelho</span> = oferta/premium ·{" "}
          <span className="text-amber-500">âmbar</span> = liquidez · <span className="text-purple-400">violeta</span> = imbalance (FVG) ·
          EQH/EQL = topos/fundos iguais · setas = BOS/CHoCH. Tudo calculado dos candles.
        </p>
      </div>

      {/* Tabela de níveis-chave com confluência */}
      <div className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-800/60">
        <div className="flex items-baseline justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-300">Níveis-chave por confluência</h3>
          <span className="text-xs text-slate-500">SMC × book × gamma — ordenado por distância do preço</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-600 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nível</th>
                <th className="px-4 py-2 text-right font-medium">Preço</th>
                <th className="px-4 py-2 text-right font-medium">Distância</th>
                <th className="px-4 py-2 font-medium">Confluência</th>
              </tr>
            </thead>
            <tbody>
              {keyLevels.slice(0, 14).map((lvl, i) => (
                <tr
                  key={i}
                  className={`border-b border-ink-700/60 ${lvl.confluence.length >= 2 ? "bg-accent/5" : ""} ${
                    lvl.swept ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${biasDot(lvl.bias)}`} />
                      <span className="text-slate-200">{lvl.label}</span>
                    </div>
                    {lvl.note && <div className="pl-4 text-[11px] text-slate-500">{lvl.note}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-300">{fmtPrice(lvl.price)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-400">
                    {lvl.distancePct >= 0 ? "+" : ""}
                    {lvl.distancePct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {lvl.confluence.length === 0 ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {lvl.confluence.map((c, j) => (
                          <span
                            key={j}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${
                              c.kind === "gamma" ? "border-accent/40 text-accent" : "border-slate-500/40 text-slate-300"
                            }`}
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && keyLevels.length === 0 && (
          <div className="grid place-items-center py-8 text-sm text-slate-500">Sem níveis suficientes neste timeframe.</div>
        )}
      </div>

      {/* Nota on-chain (futuro) */}
      <p className="text-[11px] text-slate-600">
        Em breve: camada on-chain (exchange netflow, whale alerts, MVRV, unlocks) quando houver fonte de dados dedicada.
      </p>
    </section>
  );
}
