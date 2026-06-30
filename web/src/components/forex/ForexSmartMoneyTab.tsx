import { useEffect, useMemo, useState } from "react";

import { usePersistentState } from "../../hooks/usePersistentState";
import { computeCurrencyStrength, computeForexProfile, fetchForexChart, fetchForexOverview, pairCarry, pairDecimals, type ForexQuote } from "../../lib/forex";
import { computeSmc, type SmcResult } from "../../lib/smc";
import { buildConfluenceSources } from "../../lib/smcConfluence";
import { buildKeyLevels, buildNarrative, type KeyLevel, type ReadingLine, type Tone } from "../../lib/smcNarrative";
import type { Candle, Timeframe } from "../../lib/marketData";
import InfoTip from "../InfoTip";
import { PillRow, TogglePill } from "../TogglePill";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "../SmartMoneyChart";
import ForexCotCard from "./ForexCotCard";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "15m", label: "15M" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
  { id: "1M", label: "1Mês" },
];
const TF_WORD: Record<string, string> = { "15m": "de 15 min", "1h": "de 1 hora", "4h": "de 4 horas", "1d": "diárias", "1w": "semanais", "1M": "mensais" };
const TF_SHORT: Record<string, string> = { "1d": "1D", "4h": "4H", "1h": "1H" };

const LAYER_DEFS: { key: keyof SmcLayers; label: string; color: string; desc: string }[] = [
  { key: "structure", label: "Estrutura (BOS/CHoCH)", color: "bg-primary", desc: "Quebras de estrutura — BOS (continuação) e CHoCH (mudança de caráter)." },
  { key: "orderBlocks", label: "Order Blocks", color: "bg-emerald-500", desc: "Zonas de ordem institucional (última vela antes do movimento)." },
  { key: "fvg", label: "FVG (gaps)", color: "bg-sky-500", desc: "Fair Value Gaps — desequilíbrios de preço não preenchidos." },
  { key: "liquidity", label: "Liquidez", color: "bg-amber-500", desc: "Pools de liquidez (stops) — alvos de varredura/stop hunt." },
  { key: "equal", label: "Topos/Fundos iguais", color: "bg-fuchsia-500", desc: "EQH/EQL — níveis iguais que atraem liquidez." },
  { key: "zones", label: "Premium/Discount", color: "bg-violet-500", desc: "Zonas premium (caro), equilíbrio e discount (barato) do range." },
  { key: "volumeProfile", label: "Perfil de preço (POC)", color: "bg-rose-500", desc: "POC + área de valor por TEMPO no preço (FX não tem volume real; usamos tempo-no-preço / TPO)." },
];

const TONE_DOT: Record<Tone, string> = { good: "bg-emerald-500", bad: "bg-rose-500", warn: "bg-amber-500", neutral: "bg-muted" };
const BIAS_TONE: Record<string, string> = {
  bullish: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  bearish: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  neutral: "border-border text-muted-foreground",
};
const biasWord = (b?: "bullish" | "bearish" | "neutral" | null) => (b === "bullish" ? "alta" : b === "bearish" ? "baixa" : "indefinido");

/** Ajudas (PT) das linhas da leitura automática — chaveadas pelo id do ReadingLine. */
const READING_HELP: Partial<Record<ReadingLine["id"], string>> = {
  structure: "O viés principal pela leitura de topos e fundos (Smart Money Concepts), com o último evento de estrutura — BOS (continuação) ou CHoCH (mudança de caráter).",
  internal: "A tendência dos movimentos menores dentro da principal. Quando diverge, pode indicar pivô de curto prazo ou pullback.",
  zone: "Onde o preço está no range: discount (barato — zona de compra da mão forte), equilíbrio ou premium (caro — zona de venda).",
  liqAbove: "Pool de liquidez (stops) acima do preço — alvo provável de varredura.",
  liqBelow: "Pool de liquidez (stops) abaixo do preço — alvo provável de varredura.",
  obAbove: "Order block acima — zona de ordens institucionais que pode atuar como resistência.",
  obBelow: "Order block abaixo — zona de ordens institucionais que pode atuar como suporte.",
  sweep: "Varredura recente de liquidez (stop hunt) — atenção a reversão se o preço rejeitar o nível.",
};

/** Smart Money do Forex — fluxo institucional (COT) + estrutura de mercado (SMC) com
 *  leitura automática, top-down multi-timeframe e vento de fundo (força das moedas +
 *  carry). Mesmo motor/gráfico do cripto. FX não tem feed Binance → sem WebSocket,
 *  CVD ou liquidação; Volume Profile = perfil tempo-no-preço (FX vem sem volume). */
export default function ForexSmartMoneyTab({ pair }: { pair: string }) {
  const [tf, setTf] = usePersistentState<Timeframe>("cm.fx-smc-tf", "1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ForexQuote[]>([]);
  const [mtf, setMtf] = useState<{ tf: Timeframe; bias: "bullish" | "bearish" | "neutral" }[]>([]);
  const [layers, setLayers] = useState<SmcLayers>({ ...DEFAULT_LAYERS, liquidations: false, cvd: false, htf: false });
  const toggle = (k: keyof SmcLayers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  // Velas do timeframe selecionado (base do gráfico e da estrutura).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchForexChart(pair, tf).then((c) => {
      if (!alive) return;
      setCandles(c as unknown as Candle[]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair, tf]);

  // Cotações (força das moedas) — atualiza a cada 60s com a aba visível.
  useEffect(() => {
    let alive = true;
    const load = () => fetchForexOverview().then((q) => alive && setOverview(q));
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Viés multi-timeframe (top-down): estrutura em 1D/4H/1H.
  useEffect(() => {
    let alive = true;
    const tfs: Timeframe[] = ["1d", "4h", "1h"];
    setMtf([]);
    Promise.all(
      tfs.map(async (t) => {
        try {
          const k = await fetchForexChart(pair, t);
          const r = k.length >= 60 ? computeSmc(k as unknown as Candle[]) : null;
          return { tf: t, bias: (r?.swingBias ?? "neutral") as "bullish" | "bearish" | "neutral" };
        } catch {
          return { tf: t, bias: "neutral" as const };
        }
      }),
    ).then((out) => alive && setMtf(out));
    return () => {
      alive = false;
    };
  }, [pair]);

  const smc: SmcResult | null = useMemo(() => (candles.length >= 60 ? computeSmc(candles) : null), [candles]);
  const profile = useMemo(() => (candles.length > 10 ? computeForexProfile(candles.slice(-150)) : null), [candles]);
  const dec = pairDecimals(pair);
  const fx = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // Fontes de confluência (SMC + Perfil de preço) — reusadas na leitura e na tabela.
  const sources = useMemo(() => {
    const s = buildConfluenceSources(null, [], (v) => fx(v));
    if (profile) {
      s.push({ kind: "vp", label: "POC", price: profile.poc });
      s.push({ kind: "vp", label: "VA High", price: profile.vah });
      s.push({ kind: "vp", label: "VA Low", price: profile.val });
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, dec]);

  const keyLevels = useMemo<KeyLevel[]>(() => (smc ? buildKeyLevels(smc, sources) : []), [smc, sources]);
  const narrative = useMemo<ReadingLine[]>(() => (smc ? buildNarrative(smc, sources) : []), [smc, sources]);
  const bias = smc?.swingBias ?? "neutral";

  // Força das moedas do par (base vs cotação, 24h) — vento de fundo.
  const strength = useMemo(() => {
    if (!overview.length || !pair.includes("/")) return null;
    const m = new Map(computeCurrencyStrength(overview).map((s) => [s.ccy, s.score]));
    const [base, quote] = pair.split("/");
    const bs = m.get(base);
    const qs = m.get(quote);
    if (bs == null || qs == null) return null;
    return { base, quote, bs, qs, diff: bs - qs };
  }, [overview, pair]);
  const carry = pairCarry(pair);

  // Medidor de posição no range (0% = fundo/discount, 100% = topo/premium).
  const gauge = useMemo(() => {
    if (!smc) return null;
    const range = smc.trailingTop - smc.trailingBottom;
    const pos = range > 0 ? Math.max(0, Math.min(1, (smc.price - smc.trailingBottom) / range)) : 0.5;
    const zoneKey = smc.price >= smc.premium.bottom ? "premium" : smc.price <= smc.discount.top ? "discount" : "eq";
    const label = zoneKey === "premium" ? "Premium (caro)" : zoneKey === "discount" ? "Discount (barato)" : "Equilíbrio";
    const cls = zoneKey === "premium" ? "text-rose-500" : zoneKey === "discount" ? "text-emerald-500" : "text-muted-foreground";
    return { pos, label, cls };
  }, [smc]);

  const strBar = (v: number) => Math.min(50, (Math.abs(v) / 0.8) * 50); // ±0,8%/dia ≈ extremo

  return (
    <div className="space-y-4">
      {/* Cabeçalho: viés + ao vivo */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">Smart Money</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">{pair}</span>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${BIAS_TONE[bias]}`}>
          Viés: {biasWord(bias)}
          <InfoTip text="O viés estrutural do par pela leitura de topos e fundos (Smart Money Concepts) no timeframe selecionado." />
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Atualiza sozinho enquanto a aba está aberta.">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> ao vivo
        </span>
      </div>

      {/* Fluxo institucional (COT) — o "smart money" do câmbio */}
      <ForexCotCard pair={pair} />

      {/* Vento de fundo: força das moedas (base×cotação) + carry */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            Força das moedas (24h)
            <InfoTip text="Quão forte/fraca está cada moeda do par hoje, pela média da variação contra as demais. Base forte + cotação fraca = vento a favor da alta do par; o contrário favorece a baixa." />
          </div>
          {!strength ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted/40" />
          ) : (
            <div className="space-y-2">
              {[{ ccy: strength.base, v: strength.bs }, { ccy: strength.quote, v: strength.qs }].map((r) => (
                <div key={r.ccy} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 font-semibold text-foreground">{r.ccy}</span>
                  <div className="relative h-2 flex-1 rounded-full bg-muted/50">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                    <div className={`absolute top-0 h-full rounded-full ${r.v >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={r.v >= 0 ? { left: "50%", width: `${strBar(r.v)}%` } : { right: "50%", width: `${strBar(r.v)}%` }} />
                  </div>
                  <span className={`num w-14 shrink-0 text-right font-medium ${r.v >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{r.v >= 0 ? "+" : ""}{r.v.toFixed(2)}%</span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {strength.base} {strength.diff >= 0 ? "mais forte" : "mais fraca"} que {strength.quote} — {strength.diff >= 0 ? `vento a favor da alta de ${pair}` : `vento a favor da baixa de ${pair}`}.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            Carry (diferencial de juros)
            <InfoTip text="Diferença de juros entre as duas moedas do par. Positivo = carregar o par comprado RENDE juros (vento a favor de comprar); negativo = paga juros (favorece vender). Motor central do FX no médio prazo." />
          </div>
          {!carry ? (
            <p className="text-xs text-muted-foreground">Sem taxa básica cadastrada para uma das moedas.</p>
          ) : (
            <div>
              <div className={`num text-2xl font-bold ${carry.diff >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{carry.diff >= 0 ? "+" : ""}{carry.diff.toFixed(2)}% <span className="text-sm font-medium text-muted-foreground">a.a.</span></div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {carry.base} {carry.baseRate.toFixed(2)}% − {carry.quote} {carry.quoteRate.toFixed(2)}% · {carry.diff >= 0 ? `comprar ${pair} RENDE juros (carry positivo)` : `comprar ${pair} PAGA juros (carry negativo — favorece vender)`}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/70">Taxas básicas aproximadas.</p>
            </div>
          )}
        </div>
      </div>

      {/* Top-down (1D/4H/1H) + posição no range */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Tendência top-down
            <InfoTip text="A estrutura (viés Smart Money) em vários tempos gráficos ao mesmo tempo. Quando 1D, 4H e 1H concordam, o sinal é mais forte; quando divergem, o mercado pode estar em transição." />
          </span>
          {mtf.length === 0 ? (
            <span className="text-xs text-muted-foreground">calculando…</span>
          ) : (
            mtf.map((m) => (
              <span key={m.tf} className={`rounded-full border px-2 py-0.5 text-xs ${BIAS_TONE[m.bias]}`}>
                {TF_SHORT[m.tf] ?? m.tf} · {biasWord(m.bias)}
              </span>
            ))
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              Posição no range
              <InfoTip text="Onde o preço está dentro da faixa recente: Discount (barato, metade de baixo — zona de compra), Equilíbrio ou Premium (caro, metade de cima — zona de venda). Smart Money compra no discount e vende no premium." />
            </span>
            <span className={`num ${gauge?.cls ?? "text-muted-foreground"}`}>{gauge ? `${Math.round(gauge.pos * 100)}% · ${gauge.label}` : "—"}</span>
          </div>
          <div className="relative mt-2 h-2 rounded-full" style={{ background: "linear-gradient(to right, rgba(34,197,94,0.5), rgba(148,163,184,0.3), rgba(239,68,68,0.5))" }}>
            {gauge && <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background" style={{ left: `${gauge.pos * 100}%` }} />}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Discount</span>
            <span>Equilíbrio</span>
            <span>Premium</span>
          </div>
        </div>
      </div>

      {/* Leitura automática (estrutura, zona, liquidez, order blocks) */}
      {narrative.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {narrative.map((l, i) => (
            <div key={i} className="flex gap-2 rounded-xl border border-border bg-card p-3 dark:bg-card/60">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[l.tone]}`} />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {l.title}
                  {READING_HELP[l.id] && <InfoTip text={READING_HELP[l.id]!} />}
                </div>
                <div className="text-xs text-muted-foreground">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico SMC + timeframe + camadas */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="mb-2 flex justify-end">
          <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-background p-0.5">
            {TFS.map((t) => (
              <button key={t.id} onClick={() => setTf(t.id)} className={`rounded-md px-3 py-1 text-xs transition-colors ${tf === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[380px] animate-pulse rounded-xl bg-muted/40" />
        ) : candles.length < 60 ? (
          <div className="grid h-[380px] place-items-center text-sm text-muted-foreground">Sem dados suficientes para {pair} em {tf}.</div>
        ) : (
          <SmartMoneyChart candles={candles} smc={smc} layers={layers} viewKey={`${pair}-${tf}`} vp={layers.volumeProfile ? profile : null} tf={tf} />
        )}
        <div className="mt-2">
          <PillRow label="Camadas:">
            {LAYER_DEFS.map((l) => (
              <TogglePill key={l.key} label={l.label} active={layers[l.key]} onToggle={() => toggle(l.key)} color={l.color} desc={l.desc} />
            ))}
          </PillRow>
        </div>
        {smc && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Range recente {fx(smc.trailingBottom)} — {fx(smc.trailingTop)} · preço {fx(smc.price)}. Estrutura de mercado (Smart Money Concepts) das velas {TF_WORD[tf] ?? tf}. Educacional — não é recomendação.
          </p>
        )}
      </div>

      {/* Níveis-chave por confluência (SMC × Perfil de preço) */}
      {keyLevels.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card dark:bg-card/60">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Níveis-chave por confluência
              <InfoTip text="Os preços mais importantes perto do atual, do mais próximo ao mais distante. Vêm da estrutura (order blocks, liquidez, premium/discount) e do perfil de preço (POC). 'Confluência' = quando vários fatores apontam o mesmo nível — quanto mais, mais forte. Verde = suporte (compra), vermelho = resistência (venda)." />
            </h3>
            <span className="text-xs text-muted-foreground">SMC × Perfil de preço — por distância</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Nível</th>
                  <th className="px-4 py-2 text-right font-medium">Preço</th>
                  <th className="px-4 py-2 text-right font-medium">Distância</th>
                  <th className="px-4 py-2 font-medium">Confluência</th>
                </tr>
              </thead>
              <tbody>
                {keyLevels.slice(0, 12).map((lvl, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${lvl.confluence.length >= 1 ? "bg-primary/5" : ""} ${lvl.swept ? "opacity-50" : ""}`}>
                    <td className="border-l-2 px-4 py-2.5" style={{ borderLeftColor: lvl.bias === "bullish" ? "#22c55e" : lvl.bias === "bearish" ? "#ef4444" : "#475569" }}>
                      <span className="text-foreground">{lvl.label}</span>
                      {lvl.note && <div className="text-[11px] text-muted-foreground">{lvl.note}</div>}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-foreground">{fx(lvl.price)}</td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">{lvl.distancePct >= 0 ? "+" : ""}{lvl.distancePct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      {lvl.confluence.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {lvl.confluence.map((c, j) => (
                            <span key={j} className="rounded-full border border-sky-500/40 px-2 py-0.5 text-[10px] text-sky-400">{c.source.label}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
