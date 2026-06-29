import { useEffect, useState } from "react";

import { fetchForexChart, fetchForexOverview, type ForexCandle } from "../../lib/forex";
import { ema, last, macd, rsi } from "../../lib/indicators/ta";
import { computeSmc } from "../../lib/smc";
import type { Candle } from "../../lib/marketData";
import BiasGauge, { type Tone } from "../BiasGauge";

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));
const biasTone = (b: number): Tone => (b >= 12 ? "bull" : b <= -12 ? "bear" : "neutral");
const toneText = (t: Tone) => (t === "bull" ? "text-emerald-500" : t === "bear" ? "text-rose-500" : "text-muted-foreground");
const leanWord = (s: number) => (s >= 40 ? "alta" : s >= 12 ? "leve alta" : s <= -40 ? "baixa" : s <= -12 ? "leve baixa" : "neutro");

interface Axis {
  key: string;
  label: string;
  score: number; // -100..+100
  note: string;
  weight?: number; // só forças que VOTAM
}
interface Scenario {
  name: string;
  price: number;
  pct: number;
}
interface Read {
  bias: number;
  axes: Axis[];
  divergences: string[];
  scenarios: { up: Scenario | null; down: Scenario | null };
}

function weightedBias(axes: Axis[]): number {
  let num = 0, den = 0;
  for (const a of axes) {
    if (a.weight == null) continue;
    num += a.score * a.weight;
    den += a.weight;
  }
  return Math.round(clamp(den ? num / den : 0));
}

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
  if (px[h2] > px[h1] && Number.isFinite(ri[h1]) && Number.isFinite(ri[h2]) && ri[h2] < ri[h1]) return "Divergência de baixa: preço fez topo mais alto, mas o RSI não acompanhou.";
  const l1 = minIdx(px, 0, half), l2 = minIdx(px, half, look);
  if (px[l2] < px[l1] && Number.isFinite(ri[l1]) && Number.isFinite(ri[l2]) && ri[l2] > ri[l1]) return "Divergência de alta: preço fez fundo mais baixo, mas o RSI segurou.";
  return null;
}

/** Força do DÓLAR (DXY) aplicada ao par — o motor central do câmbio. Pares com USD
 *  na cotação (XXX/USD): dólar fraco = par sobe. Com USD na base (USD/XXX): dólar
 *  forte = par sobe. Sem USD (cross): não se aplica. */
function dollarAxis(pair: string, dxyChg: number | null): Axis | null {
  if (dxyChg == null) return null;
  const role = pair.startsWith("USD/") ? "base" : pair.endsWith("/USD") ? "quote" : "none";
  if (role === "none") return null;
  const str = clamp(Math.abs(dxyChg) / 0.5, 0, 1) * 100;
  // dólar forte (+dxy) favorece o par se USD é base; prejudica se é cotação
  const score = clamp((role === "base" ? 1 : -1) * Math.sign(dxyChg) * str);
  const dir = dxyChg >= 0 ? "forte" : "fraco";
  return { key: "dollar", label: "Dólar (DXY)", score, note: `Dólar ${dir} (DXY ${dxyChg >= 0 ? "+" : ""}${dxyChg.toFixed(2)}%) — ${score >= 0 ? "favorece" : "pressiona"} ${pair}`, weight: 0.22 };
}

function computeRead(pair: string, candles: ForexCandle[], dxyChg: number | null): Read | null {
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
    { key: "trend", label: "Tendência", score: trend, note: `preço ${price > e20 ? "acima" : "abaixo"} da MM20 · MM20 ${e20 > e50 ? ">" : "<"} MM50`, weight: 0.26 },
  ];

  // Estrutura (SMC) — reusa o motor compartilhado
  let structScore: number | null = null;
  if (candles.length >= 60) {
    const smc = computeSmc(candles as unknown as Candle[]);
    if (smc?.swingBias) {
      const dir = smc.swingBias === "bullish" ? 1 : -1;
      const agrees = smc.internalBias != null && smc.internalBias === smc.swingBias;
      structScore = dir * (agrees ? 70 : 48);
      const dw = (b: "bullish" | "bearish") => (b === "bullish" ? "alta" : "baixa");
      axes.push({ key: "struct", label: "Estrutura (price action)", score: structScore, note: `Swing ${dw(smc.swingBias)}${smc.lastSwing ? ` · ${smc.lastSwing.type} ${dw(smc.lastSwing.bias)}` : ""}`, weight: 0.2 });
    }
  }
  axes.push({ key: "mom", label: "Momento", score: mom, note: `RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${hist > 0 ? "positivo" : "negativo"}`, weight: 0.2 });
  const dAxis = dollarAxis(pair, dxyChg);
  if (dAxis) axes.push(dAxis);

  // Divergências
  const divergences: string[] = [];
  const sgn = (v: number) => (v > 6 ? 1 : v < -6 ? -1 : 0);
  if (structScore != null && sgn(trend) !== 0 && sgn(structScore) !== 0 && sgn(trend) !== sgn(structScore)) divergences.push("Tendência (médias) e estrutura (price action) divergem — mercado em transição.");
  if (sgn(trend) !== 0 && sgn(mom) !== 0 && sgn(trend) !== sgn(mom)) divergences.push(trend < 0 ? "Tendência de baixa, mas o momento virou pra cima — possível repique." : "Tendência de alta, mas o momento enfraquece — atenção a uma correção.");
  const rd = rsiDivergence(closes);
  if (rd) divergences.push(rd);

  // Cenários (gatilho mais próximo acima/abaixo)
  const recent = candles.slice(-20);
  const hi = recent.length ? Math.max(...recent.map((c) => c.high)) : NaN;
  const lo = recent.length ? Math.min(...recent.map((c) => c.low)) : NaN;
  const levels = [{ p: e20, name: "MM20" }, { p: e50, name: "MM50" }, { p: hi, name: "máxima recente" }, { p: lo, name: "mínima recente" }].filter((l) => Number.isFinite(l.p));
  const above = levels.filter((l) => l.p > price).sort((a, b) => a.p - b.p)[0];
  const below = levels.filter((l) => l.p < price).sort((a, b) => b.p - a.p)[0];
  const scenarios = {
    up: above ? { name: above.name, price: above.p, pct: ((above.p - price) / price) * 100 } : null,
    down: below ? { name: below.name, price: below.p, pct: ((below.p - price) / price) * 100 } : null,
  };

  return { bias: weightedBias(axes), axes, divergences, scenarios };
}

function TugOfWar({ axes }: { axes: Axis[] }) {
  const voting = axes.filter((a) => a.weight != null && Math.abs(a.score) > 6);
  const wsum = axes.filter((a) => a.weight != null).reduce((s, a) => s + (a.weight ?? 0), 0);
  if (!voting.length || wsum <= 0) return null;
  const contrib = voting.map((a) => ({ a, c: (a.score / 100) * (a.weight ?? 0) }));
  const bull = contrib.filter((x) => x.c > 0).sort((x, y) => y.c - x.c);
  const bear = contrib.filter((x) => x.c < 0).sort((x, y) => x.c - y.c);
  const pct = (c: number) => (Math.abs(c) / wsum) * 100;
  const seg = (x: { a: Axis; c: number }, side: "bull" | "bear") => (
    <div key={x.a.key} title={`${x.a.label}: ${x.c >= 0 ? "+" : "−"}${pct(x.c).toFixed(0)}% do viés`} style={{ width: `${pct(x.c)}%` }} className={`h-full ${side === "bull" ? "border-r border-background/40 bg-emerald-500/80 last:border-r-0" : "border-l border-background/40 bg-rose-500/80 first:border-l-0"}`} />
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
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">peso {Math.round((a.weight ?? 0) * 100)}%</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{a.note}</p>
      </div>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${dir > 0 ? "bg-emerald-500" : dir < 0 ? "bg-rose-500" : "bg-muted-foreground/50"}`} style={{ width: `${Math.round(Math.abs(a.score))}%` }} />
      </div>
    </div>
  );
}

/** Leitura do Mercado do Forex — confluência (tendência + estrutura + momento +
 *  dólar/DXY) com cabo de guerra, cenários e divergências. Mesmo padrão dos módulos. */
export default function ForexLeituraTab({ pair }: { pair: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchForexChart(pair, "1d"), fetchForexOverview()]).then(([candles, ov]) => {
      if (!alive) return;
      const dxy = ov.find((q) => q.pair === "DXY")?.changePct ?? null;
      setRead(computeRead(pair, candles, dxy));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair]);

  if (loading) return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!read) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Sem dados suficientes para a leitura de {pair}.</div>;

  const tone = biasTone(read.bias);
  const sign = Math.sign(read.bias);
  const voting = read.axes.filter((a) => a.weight != null);
  const agree = voting.filter((a) => Math.sign(a.score) === sign && a.score !== 0).length;
  const conviction = voting.length ? Math.round((agree / voting.length) * 100) : 0;
  const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 5 });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <BiasGauge value={read.bias} tone={tone} />
              <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                <span className={`text-2xl font-bold ${toneText(tone)}`}>{read.bias > 0 ? "+" : ""}{read.bias}</span>
              </div>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Viés do par · {pair}</span>
              <p className="mt-1 text-sm font-medium capitalize text-foreground">{leanWord(read.bias)}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Convicção</span>
            <div className="text-2xl font-semibold text-foreground">{conviction}%</div>
            <span className="text-[11px] text-muted-foreground">{agree} de {voting.length} forças</span>
          </div>
        </div>
      </div>

      {(read.scenarios.up || read.scenarios.down) && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-1 text-sm font-semibold text-primary">🎯 O que muda a leitura</h3>
          <div className="divide-y divide-border/60">
            {read.scenarios.up && (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-emerald-500">▲</span>
                <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Cenário de alta</span>
                <span className="min-w-0 flex-1 text-foreground">Romper acima de <b>{read.scenarios.up.name}</b> <span className="num text-muted-foreground">{brl(read.scenarios.up.price)}</span></span>
                <span className="num shrink-0 text-xs font-semibold text-emerald-500">+{read.scenarios.up.pct.toFixed(2)}%</span>
              </div>
            )}
            {read.scenarios.down && (
              <div className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-rose-500">▼</span>
                <span className="shrink-0 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">Cenário de baixa</span>
                <span className="min-w-0 flex-1 text-foreground">Perder <b>{read.scenarios.down.name}</b> <span className="num text-muted-foreground">{brl(read.scenarios.down.price)}</span></span>
                <span className="num shrink-0 text-xs font-semibold text-rose-500">{read.scenarios.down.pct.toFixed(2)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {read.divergences.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">⚠ Divergências e riscos</h3>
          <ul className="space-y-1.5">{read.divergences.map((d, i) => <li key={i} className="text-xs text-amber-800 dark:text-amber-200">{d}</li>)}</ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">As forças por trás da leitura</h3>
        <TugOfWar axes={read.axes} />
        <div>{read.axes.map((a) => <AxisRow key={a.key} a={a} />)}</div>
        <p className="mt-2 text-[11px] text-muted-foreground">Confluência das velas diárias (tendência, estrutura/price action, momento) + força do dólar (DXY). Educacional — não é recomendação.</p>
      </div>
    </div>
  );
}
