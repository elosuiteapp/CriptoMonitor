import { useEffect, useState } from "react";

import { fetchB3Chart, fetchB3FiisAll, fetchB3FundamentalsAll, fetchB3Macro, fetchMacroGlobal, globalTideScore, isFii, type B3Candle, type B3FiiFund, type B3Fund, type B3MacroData, type B3MacroGlobal } from "../../lib/b3";
import { ema, last, macd, rsi } from "../../lib/indicators/ta";
import { computeSmc } from "../../lib/smc";
import type { Candle } from "../../lib/marketData";
import { BiasGauge, biasTone, selicAA, toneText } from "./B3Shared";

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Axis {
  key: string;
  label: string;
  score: number; // -100..+100
  note: string;
  weight?: number; // peso no viés — presente só nas forças que VOTAM (ausente = contexto)
}
interface Scenario {
  name: string;
  price: number;
  pct: number;
}
export interface Read {
  bias: number;
  label: string;
  axes: Axis[];
  sentence: string;
  divergences: string[];
  scenarios: { up: Scenario | null; down: Scenario | null };
}

/** Resumo da leitura no formato do badge do header (viés + convicção + regime). */
export function b3BadgeRead(read: Read | null): { bias: number; conviction: number; regime: { key: string; label: string; tone: "bull" | "bear" | "neutral" }; hasData: boolean } | null {
  if (!read) return null;
  const bias = read.bias;
  const tone: "bull" | "bear" | "neutral" = bias >= 12 ? "bull" : bias <= -12 ? "bear" : "neutral";
  const voting = read.axes.filter((a) => a.weight != null);
  const agree = voting.filter((a) => Math.sign(a.score) === Math.sign(bias) && a.score !== 0).length;
  const word = bias >= 40 ? "Tendência de alta" : bias >= 12 ? "Leve alta" : bias <= -40 ? "Tendência de baixa" : bias <= -12 ? "Leve baixa" : "Indeciso";
  return { bias, conviction: voting.length ? Math.round((agree / voting.length) * 100) : 0, regime: { key: "b3", label: `${word} — ${agree} de ${voting.length} forças`, tone }, hasData: true };
}

function leanWord(s: number): string {
  if (s >= 40) return "alta";
  if (s >= 12) return "leve alta";
  if (s <= -40) return "baixa";
  if (s <= -12) return "leve baixa";
  return "neutro";
}

// ─── Eixo de ESTRUTURA (SMC) — reusa o motor compartilhado (price action das velas) ──
function structureAxis(candles: B3Candle[]): { axis: Axis; smc: ReturnType<typeof computeSmc> } | null {
  if (candles.length < 60) return null;
  const smc = computeSmc(candles as unknown as Candle[]);
  if (!smc || !smc.swingBias) return null;
  const dir = smc.swingBias === "bullish" ? 1 : -1;
  const agrees = smc.internalBias != null && smc.internalBias === smc.swingBias;
  const dw = (b: "bullish" | "bearish") => (b === "bullish" ? "alta" : "baixa");
  const note =
    `Swing ${dw(smc.swingBias)}` +
    (smc.lastSwing ? ` · ${smc.lastSwing.type} ${dw(smc.lastSwing.bias)}` : "") +
    (smc.internalBias ? ` · interno ${dw(smc.internalBias)}` : "");
  return { axis: { key: "struct", label: "Estrutura (price action)", score: dir * (agrees ? 70 : 48), note, weight: 0.2 }, smc };
}

// ─── Divergência simples preço × RSI (topo/fundo) ───────────────────────────────
function rsiDivergence(closes: number[], look = 20): string | null {
  const n = closes.length;
  const rs = rsi(closes, 14);
  if (n < look + 2) return null;
  const px = closes.slice(-look);
  const ri = rs.slice(-look);
  const half = Math.floor(look / 2);
  const maxIdx = (a: number[], s: number, e: number) => { let m = s; for (let i = s + 1; i < e; i++) if (a[i] > a[m]) m = i; return m; };
  const minIdx = (a: number[], s: number, e: number) => { let m = s; for (let i = s + 1; i < e; i++) if (a[i] < a[m]) m = i; return m; };
  const h1 = maxIdx(px, 0, half), h2 = maxIdx(px, half, look);
  if (px[h2] > px[h1] && Number.isFinite(ri[h1]) && Number.isFinite(ri[h2]) && ri[h2] < ri[h1])
    return "Divergência de baixa: preço fez topo mais alto, mas o RSI não acompanhou.";
  const l1 = minIdx(px, 0, half), l2 = minIdx(px, half, look);
  if (px[l2] < px[l1] && Number.isFinite(ri[l1]) && Number.isFinite(ri[l2]) && ri[l2] > ri[l1])
    return "Divergência de alta: preço fez fundo mais baixo, mas o RSI segurou.";
  return null;
}

// ─── Divergências entre as forças (mercado em transição / repique) ──────────────
function forceDivergences(trend: number, struct: number | null, mom: number, closes: number[]): string[] {
  const d: string[] = [];
  const sgn = (v: number) => (v > 6 ? 1 : v < -6 ? -1 : 0);
  if (struct != null && sgn(trend) !== 0 && sgn(struct) !== 0 && sgn(trend) !== sgn(struct))
    d.push("Tendência (médias) e estrutura (price action) divergem — mercado em transição; a estrutura costuma virar antes.");
  if (sgn(trend) !== 0 && sgn(mom) !== 0 && sgn(trend) !== sgn(mom))
    d.push(trend < 0 ? "Tendência de baixa, mas o momento de curto prazo virou pra cima — possível repique." : "Tendência de alta, mas o momento enfraquece — atenção a uma correção.");
  const rd = rsiDivergence(closes);
  if (rd) d.push(rd);
  return d;
}

// ─── Cenários: nível-gatilho mais próximo acima/abaixo do preço ─────────────────
function buildScenarios(price: number, e20: number, e50: number, candles: B3Candle[]): { up: Scenario | null; down: Scenario | null } {
  const recent = candles.slice(-20);
  const hi = recent.length ? Math.max(...recent.map((c) => c.high)) : NaN;
  const lo = recent.length ? Math.min(...recent.map((c) => c.low)) : NaN;
  const levels: { p: number; name: string }[] = [
    { p: e20, name: "MM20" },
    { p: e50, name: "MM50" },
    { p: hi, name: "máxima recente" },
    { p: lo, name: "mínima recente" },
  ].filter((l) => Number.isFinite(l.p) && l.p > 0);
  const above = levels.filter((l) => l.p > price).sort((a, b) => a.p - b.p)[0];
  const below = levels.filter((l) => l.p < price).sort((a, b) => b.p - a.p)[0];
  return {
    up: above ? { name: above.name, price: above.p, pct: ((above.p - price) / price) * 100 } : null,
    down: below ? { name: below.name, price: below.p, pct: ((below.p - price) / price) * 100 } : null,
  };
}

/** Viés = média ponderada das forças que VOTAM (têm weight); normaliza pelos pesos disponíveis. */
function weightedBias(axes: Axis[]): number {
  let num = 0, den = 0;
  for (const a of axes) {
    if (a.weight == null) continue;
    num += a.score * a.weight;
    den += a.weight;
  }
  return Math.round(clamp(den ? num / den : 0));
}

// Eixo "Maré global (Fed/EUA)" — pano de fundo risk-on/off (FRED). Vota com peso modesto.
function globalTideAxis(mg: B3MacroGlobal | null, weight: number): Axis | null {
  const tide = mg ? globalTideScore(mg) : null;
  if (!mg || !tide) return null;
  const note = `${mg.nlChg30dPct != null ? `liquidez ${mg.nlChg30dPct >= 0 ? "↑" : "↓"}` : ""}${mg.realYield10y != null ? ` · juro real ${mg.realYield10y.toFixed(1)}%` : ""}${mg.nfci != null ? ` · NFCI ${mg.nfci < 0 ? "frouxo" : "apertado"}` : ""} — ${tide.label}`;
  return { key: "global", label: "Maré global (Fed/EUA)", score: tide.score, note, weight };
}

export function computeRead(asset: string, candles: B3Candle[], macro: B3MacroData | null, fund: B3Fund | null, mg: B3MacroGlobal | null): Read | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < 25) return null;
  const price = last(closes);
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const r = last(rsi(closes, 14));
  const hist = last(macd(closes).hist);

  const trend = clamp((price > e20 ? 50 : -50) + (e20 > e50 ? 50 : -50));
  const mom = clamp((Number.isFinite(r) ? (r - 50) * 4 : 0) * 0.7 + (hist > 0 ? 25 : -25));

  const axes: Axis[] = [
    { key: "trend", label: "Tendência", score: trend, note: `preço ${price > e20 ? "acima" : "abaixo"} da MM20 · MM20 ${e20 > e50 ? ">" : "<"} MM50`, weight: 0.24 },
  ];
  const st = structureAxis(candles);
  if (st) axes.push(st.axis);
  axes.push({ key: "mom", label: "Momento", score: mom, note: `RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${hist > 0 ? "positivo" : "negativo"}`, weight: 0.18 });

  let macroScore = 0;
  if (macro) {
    const sp = macro.globals.find((g) => g.symbol === "S&P 500")?.changePct ?? null;
    const dollar = macro.globals.find((g) => g.symbol === "Dólar")?.changePct ?? null;
    const vix = macro.globals.find((g) => g.symbol === "VIX")?.price ?? null;
    macroScore = clamp((sp != null ? (sp >= 0 ? 34 : -34) : 0) + (dollar != null ? (dollar <= 0 ? 33 : -33) : 0) + (vix != null ? (vix < 20 ? 33 : -33) : 0));
    axes.push({ key: "macro", label: "Macro / risco", score: macroScore, note: `${sp != null && sp >= 0 ? "EUA em alta" : "EUA em baixa"} · ${dollar != null && dollar <= 0 ? "dólar cede" : "dólar sobe"} · VIX ${vix != null ? vix.toFixed(0) : "—"}`, weight: 0.22 });
  }
  const gAxis = globalTideAxis(mg, 0.12);
  if (gAxis) axes.push(gAxis);

  let fundScore = 0;
  let hasFund = false;
  if (fund) {
    let s = 0;
    let n = 0;
    if (fund.pl != null && fund.pl > 0) { s += fund.pl < 8 ? 35 : fund.pl < 15 ? 12 : fund.pl < 25 ? -8 : -28; n++; }
    if (fund.pvp != null && fund.pvp > 0) { s += fund.pvp < 1 ? 30 : fund.pvp < 2 ? 10 : fund.pvp < 4 ? -8 : -22; n++; }
    if (fund.roe != null) { s += fund.roe >= 20 ? 30 : fund.roe >= 12 ? 15 : fund.roe >= 6 ? 0 : -20; n++; }
    if (fund.dy != null) { s += fund.dy >= 8 ? 25 : fund.dy >= 5 ? 12 : fund.dy >= 2 ? 4 : 0; n++; }
    if (n > 0) {
      hasFund = true;
      fundScore = clamp(s);
      const bits = [fund.pl != null ? `P/L ${fund.pl.toFixed(1)}` : null, fund.pvp != null ? `P/VP ${fund.pvp.toFixed(2)}` : null, fund.roe != null ? `ROE ${fund.roe.toFixed(0)}%` : null, fund.dy != null ? `DY ${fund.dy.toFixed(1)}%` : null].filter(Boolean);
      axes.push({ key: "fund", label: "Qualidade & Valuation", score: fundScore, note: bits.join(" · "), weight: 0.14 });
    }
  }

  const bias = weightedBias(axes);
  const label = leanWord(bias);
  const divergences = forceDivergences(trend, st ? st.axis.score : null, mom, closes);
  if (macroScore !== 0 && bias !== 0) {
    if (bias > 0 && macroScore <= -34) divergences.push("Viés de alta contra um pano de fundo macro de risco (EUA/dólar/VIX) — vento contra.");
    else if (bias < 0 && macroScore >= 34) divergences.push("Viés de baixa, mas a maré macro é favorável (risk-on) — pode limitar a queda.");
  }
  const scenarios = buildScenarios(price, e20, e50, candles);
  const sentence = `${asset}: tendência de ${leanWord(trend)}${st ? `, estrutura ${leanWord(st.axis.score)}` : ""}, momento ${leanWord(mom)}${macro ? `, pano de fundo macro ${leanWord(macroScore)}` : ""}${hasFund ? `, valuation ${leanWord(fundScore)}` : ""}. Viés geral: ${label}.`;
  return { bias, label, axes, sentence, divergences, scenarios };
}

/** Leitura específica de FII: tendência + estrutura + momento + renda (DY) + valuation (P/VP) + juros (Selic). */
function computeReadFii(asset: string, candles: B3Candle[], macro: B3MacroData | null, fund: B3FiiFund | null, mg: B3MacroGlobal | null): Read | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < 25) return null;
  const price = last(closes);
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const r = last(rsi(closes, 14));
  const hist = last(macd(closes).hist);

  const trend = clamp((price > e20 ? 50 : -50) + (e20 > e50 ? 50 : -50));
  const mom = clamp((Number.isFinite(r) ? (r - 50) * 4 : 0) * 0.7 + (hist > 0 ? 25 : -25));
  const axes: Axis[] = [
    { key: "trend", label: "Tendência", score: trend, note: `cota ${price > e20 ? "acima" : "abaixo"} da MM20 · MM20 ${e20 > e50 ? ">" : "<"} MM50`, weight: 0.18 },
  ];
  const st = structureAxis(candles);
  if (st) { st.axis.weight = 0.14; axes.push(st.axis); }
  axes.push({ key: "mom", label: "Momento", score: mom, note: `RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${hist > 0 ? "positivo" : "negativo"}`, weight: 0.13 });

  if (fund?.dy != null) {
    const s = fund.dy >= 11 ? 30 : fund.dy >= 9 ? 18 : fund.dy >= 7 ? 6 : -8;
    axes.push({ key: "renda", label: "Renda (DY)", score: s, note: `DY ${fund.dy.toFixed(1)}% — ${fund.dy >= 9 ? "renda alta" : fund.dy >= 7 ? "renda ok" : "renda baixa"}`, weight: 0.22 });
  }
  if (fund?.pvp != null && fund.pvp > 0) {
    const s = fund.pvp < 0.9 ? 30 : fund.pvp < 1 ? 12 : fund.pvp < 1.1 ? -4 : -20;
    axes.push({ key: "val", label: "Valuation (P/VP)", score: s, note: `P/VP ${fund.pvp.toFixed(2)} — ${fund.pvp < 1 ? "desconto" : "ágio"}`, weight: 0.22 });
  }
  if (fund?.vacancia != null && (fund.qtdImoveis ?? 0) > 0) {
    const s = fund.vacancia < 8 ? 15 : fund.vacancia < 15 ? 0 : -18;
    axes.push({ key: "occ", label: "Ocupação", score: s, note: `vacância ${fund.vacancia.toFixed(1)}%`, weight: 0.1 });
  }
  const selAA = selicAA(macro?.macro.selic ?? null);
  if (selAA != null) {
    const s = selAA < 10 ? 25 : selAA < 12 ? 8 : selAA < 14 ? -8 : -22;
    axes.push({ key: "juros", label: "Juros (Selic)", score: s, note: `Selic ${selAA.toFixed(1)}% a.a. — ${selAA < 11 ? "favorece FII" : "pressiona FII"}`, weight: 0.13 });
  }
  const gAxis = globalTideAxis(mg, 0.08);
  if (gAxis) axes.push(gAxis);

  const bias = weightedBias(axes);
  const label = leanWord(bias);
  const divergences = forceDivergences(trend, st ? st.axis.score : null, mom, closes);
  const scenarios = buildScenarios(price, e20, e50, candles);
  const rendaTxt = fund?.dy != null ? `, renda ${leanWord(axes.find((a) => a.key === "renda")?.score ?? 0)}` : "";
  const valTxt = fund?.pvp != null ? `, valuation ${leanWord(axes.find((a) => a.key === "val")?.score ?? 0)}` : "";
  const sentence = `${asset} (FII${fund?.segmento ? ` · ${fund.segmento}` : ""}): tendência de ${leanWord(trend)}${rendaTxt}${valTxt}. Viés geral: ${label}.`;
  return { bias, label, axes, sentence, divergences, scenarios };
}

/** Cabo de guerra: cada segmento = peso × força (contribuição real ao viés). */
function TugOfWar({ axes }: { axes: Axis[] }) {
  const voting = axes.filter((a) => a.weight != null && Math.abs(a.score) > 6);
  const wsum = axes.filter((a) => a.weight != null).reduce((s, a) => s + (a.weight ?? 0), 0);
  if (!voting.length || wsum <= 0) return null;
  const contrib = voting.map((a) => ({ a, c: (a.score / 100) * (a.weight ?? 0) }));
  const bull = contrib.filter((x) => x.c > 0).sort((x, y) => y.c - x.c);
  const bear = contrib.filter((x) => x.c < 0).sort((x, y) => x.c - y.c);
  const pct = (c: number) => (Math.abs(c) / wsum) * 100;
  const seg = (x: { a: Axis; c: number }, side: "bull" | "bear") => (
    <div
      key={x.a.key}
      title={`${x.a.label}: ${x.c >= 0 ? "+" : "−"}${pct(x.c).toFixed(0)}% do viés`}
      style={{ width: `${pct(x.c)}%` }}
      className={`h-full ${side === "bull" ? "border-r border-background/40 bg-emerald-500/80 last:border-r-0" : "border-l border-background/40 bg-rose-500/80 first:border-l-0"}`}
    />
  );
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide">
        <span className="font-semibold text-rose-500">◀ baixa</span>
        <span className="text-muted-foreground">cabo de guerra (peso × força)</span>
        <span className="font-semibold text-emerald-500">alta ▶</span>
      </div>
      <div className="flex h-7 overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex w-1/2 flex-row-reverse">{bear.map((x) => seg(x, "bear"))}</div>
        <div className="w-px shrink-0 bg-foreground/50" />
        <div className="flex w-1/2">{bull.map((x) => seg(x, "bull"))}</div>
      </div>
    </div>
  );
}

function ScenarioRow({ side, s }: { side: "up" | "down"; s: Scenario }) {
  const up = side === "up";
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className={up ? "text-emerald-500" : "text-rose-500"}>{up ? "▲" : "▼"}</span>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${up ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
        {up ? "Cenário de alta" : "Cenário de baixa"}
      </span>
      <span className="min-w-0 flex-1 text-foreground">
        {up ? "Romper acima de" : "Perder"} <b>{s.name}</b> <span className="num text-muted-foreground">{brl(s.price)}</span>
      </span>
      <span className={`num shrink-0 text-xs font-semibold ${up ? "text-emerald-500" : "text-rose-500"}`}>
        {s.pct >= 0 ? "+" : ""}{s.pct.toFixed(1)}%
      </span>
    </div>
  );
}

function AxisRow({ a }: { a: Axis }) {
  const dir = a.score > 6 ? 1 : a.score < -6 ? -1 : 0;
  const glyph = dir > 0 ? "▲" : dir < 0 ? "▼" : "—";
  const dirT = dir > 0 ? "text-emerald-500" : dir < 0 ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className={`w-5 shrink-0 text-center text-sm ${dirT}`} aria-hidden>{glyph}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{a.label}</span>
          {a.weight != null ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title="peso no viés">peso {Math.round((a.weight ?? 0) * 100)}%</span>
          ) : (
            <span className={`text-[11px] font-semibold capitalize ${dirT}`}>{leanWord(a.score)}</span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{a.note}</p>
      </div>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${dir > 0 ? "bg-emerald-500" : dir < 0 ? "bg-rose-500" : "bg-muted-foreground/50"}`} style={{ width: `${Math.round(Math.abs(a.score))}%` }} />
      </div>
    </div>
  );
}

/** Leitura do Mercado da B3 — mesmo padrão do cripto: medidor + convicção + forças + cenários. */
export default function B3LeituraTab({ asset }: { asset: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchB3Chart(asset, "1d"), fetchB3Macro(), fetchB3FundamentalsAll(), fetchB3FiisAll(), fetchMacroGlobal()]).then(([candles, macro, funds, fiis, mg]) => {
      if (!alive) return;
      setRead(isFii(asset) ? computeReadFii(asset, candles, macro, fiis[asset] ?? null, mg) : computeRead(asset, candles, macro, funds[asset] ?? null, mg));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [asset]);

  if (loading) return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!read) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Sem dados suficientes para a leitura de {asset}.</div>;

  const tone = biasTone(read.bias);
  const biasSign = Math.sign(read.bias);
  const voting = read.axes.filter((a) => a.weight != null);
  const agree = voting.filter((a) => Math.sign(a.score) === biasSign && a.score !== 0).length;
  const conviction = voting.length ? Math.round((agree / voting.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Hero — medidor + viés + convicção */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <BiasGauge value={read.bias} tone={tone} />
              <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                <span className={`text-2xl font-bold ${toneText(tone)}`}>
                  {read.bias > 0 ? "+" : ""}
                  {read.bias}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Viés do ativo · {asset}</span>
              <p className="mt-1 text-sm font-medium capitalize text-foreground">{read.label}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Convicção</span>
            <div className="text-2xl font-semibold text-foreground">{conviction}%</div>
            <span className="text-[11px] text-muted-foreground">
              {agree} de {voting.length} forças
            </span>
          </div>
        </div>
        <p className="mt-4 border-t border-border/60 pt-3 text-sm text-foreground">{read.sentence}</p>
      </div>

      {/* O que muda a leitura — cenários acionáveis dos 2 lados */}
      {(read.scenarios.up || read.scenarios.down) && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-1 text-sm font-semibold text-primary">🎯 O que muda a leitura</h3>
          <div className="divide-y divide-border/60">
            {read.scenarios.up && <ScenarioRow side="up" s={read.scenarios.up} />}
            {read.scenarios.down && <ScenarioRow side="down" s={read.scenarios.down} />}
          </div>
        </div>
      )}

      {/* Divergências e riscos */}
      {read.divergences.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">⚠ Divergências e riscos</h3>
          <ul className="space-y-1.5">
            {read.divergences.map((d, i) => (
              <li key={i} className="text-xs text-amber-800 dark:text-amber-200">{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Forças */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">As forças por trás da leitura</h3>
        <TugOfWar axes={read.axes} />
        <div>
          {read.axes.map((a) => (
            <AxisRow key={a.key} a={a} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Confluência ponderada das velas diárias (tendência, estrutura/price action, momento) + macro global + valuation. Educacional — não é recomendação. Próximo: o fluxo de investidor entra como força.
        </p>
      </div>
    </div>
  );
}
