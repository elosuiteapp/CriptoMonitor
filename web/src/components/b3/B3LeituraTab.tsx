import { useEffect, useState } from "react";

import { fetchB3Chart, fetchB3FundamentalsAll, fetchB3Macro, type B3Fund, type B3MacroData } from "../../lib/b3";
import { ema, last, macd, rsi } from "../../lib/indicators/ta";
import { BiasGauge, biasTone, toneText } from "./B3Shared";

const clamp = (v: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));

interface Axis {
  key: string;
  label: string;
  score: number; // -100..+100
  note: string;
}
interface Read {
  bias: number;
  label: string;
  axes: Axis[];
  sentence: string;
}

function leanWord(s: number): string {
  if (s >= 40) return "alta";
  if (s >= 12) return "leve alta";
  if (s <= -40) return "baixa";
  if (s <= -12) return "leve baixa";
  return "neutro";
}

function computeRead(asset: string, closes: number[], macro: B3MacroData | null, fund: B3Fund | null): Read | null {
  if (closes.length < 25) return null;
  const price = last(closes);
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const r = last(rsi(closes, 14));
  const hist = last(macd(closes).hist);

  const trend = clamp((price > e20 ? 50 : -50) + (e20 > e50 ? 50 : -50));
  const mom = clamp((Number.isFinite(r) ? (r - 50) * 4 : 0) * 0.7 + (hist > 0 ? 25 : -25));

  const axes: Axis[] = [
    { key: "trend", label: "Tendência", score: trend, note: `preço ${price > e20 ? "acima" : "abaixo"} da MM20 · MM20 ${e20 > e50 ? ">" : "<"} MM50` },
    { key: "mom", label: "Momento", score: mom, note: `RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${hist > 0 ? "positivo" : "negativo"}` },
  ];

  let macroScore = 0;
  if (macro) {
    const sp = macro.globals.find((g) => g.symbol === "S&P 500")?.changePct ?? null;
    const dollar = macro.globals.find((g) => g.symbol === "Dólar")?.changePct ?? null;
    const vix = macro.globals.find((g) => g.symbol === "VIX")?.price ?? null;
    macroScore = clamp((sp != null ? (sp >= 0 ? 34 : -34) : 0) + (dollar != null ? (dollar <= 0 ? 33 : -33) : 0) + (vix != null ? (vix < 20 ? 33 : -33) : 0));
    axes.push({ key: "macro", label: "Macro / risco", score: macroScore, note: `${sp != null && sp >= 0 ? "EUA em alta" : "EUA em baixa"} · ${dollar != null && dollar <= 0 ? "dólar cede" : "dólar sobe"} · VIX ${vix != null ? vix.toFixed(0) : "—"}` });
  }

  let fundScore = 0;
  let hasFund = false;
  if (fund) {
    let s = 0;
    let n = 0;
    if (fund.pl != null && fund.pl > 0) {
      s += fund.pl < 8 ? 35 : fund.pl < 15 ? 12 : fund.pl < 25 ? -8 : -28;
      n++;
    }
    if (fund.pvp != null && fund.pvp > 0) {
      s += fund.pvp < 1 ? 30 : fund.pvp < 2 ? 10 : fund.pvp < 4 ? -8 : -22;
      n++;
    }
    if (fund.roe != null) {
      s += fund.roe >= 20 ? 30 : fund.roe >= 12 ? 15 : fund.roe >= 6 ? 0 : -20;
      n++;
    }
    if (fund.dy != null) {
      s += fund.dy >= 8 ? 25 : fund.dy >= 5 ? 12 : fund.dy >= 2 ? 4 : 0;
      n++;
    }
    if (n > 0) {
      hasFund = true;
      fundScore = clamp(s);
      const bits = [fund.pl != null ? `P/L ${fund.pl.toFixed(1)}` : null, fund.pvp != null ? `P/VP ${fund.pvp.toFixed(2)}` : null, fund.roe != null ? `ROE ${fund.roe.toFixed(0)}%` : null, fund.dy != null ? `DY ${fund.dy.toFixed(1)}%` : null].filter(Boolean);
      axes.push({ key: "fund", label: "Qualidade & Valuation", score: fundScore, note: bits.join(" · ") });
    }
  }

  const bias = Math.round(hasFund ? clamp(0.35 * trend + 0.25 * mom + 0.25 * macroScore + 0.15 * fundScore) : clamp(0.42 * trend + 0.32 * mom + 0.26 * macroScore));
  const label = leanWord(bias);
  const sentence = `${asset}: tendência de ${leanWord(trend)}, momento ${leanWord(mom)}${macro ? `, pano de fundo macro ${leanWord(macroScore)}` : ""}${hasFund ? `, valuation ${leanWord(fundScore)}` : ""}. Viés geral: ${label}.`;
  return { bias, label, axes, sentence };
}

function AxisRow({ a }: { a: Axis }) {
  const dir = a.score > 6 ? 1 : a.score < -6 ? -1 : 0;
  const glyph = dir > 0 ? "▲" : dir < 0 ? "▼" : "—";
  const dirT = dir > 0 ? "text-emerald-500" : dir < 0 ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className={`w-5 shrink-0 text-center text-sm ${dirT}`} aria-hidden>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{a.label}</span>
          <span className={`text-[11px] font-semibold capitalize ${dirT}`}>{leanWord(a.score)}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{a.note}</p>
      </div>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${dir > 0 ? "bg-emerald-500" : dir < 0 ? "bg-rose-500" : "bg-muted-foreground/50"}`} style={{ width: `${Math.round(Math.abs(a.score))}%` }} />
      </div>
    </div>
  );
}

/** Leitura do Mercado da B3 — mesmo padrão do cripto: medidor + convicção + forças. */
export default function B3LeituraTab({ asset }: { asset: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchB3Chart(asset, "1d"), fetchB3Macro(), fetchB3FundamentalsAll()]).then(([candles, macro, funds]) => {
      if (!alive) return;
      setRead(computeRead(asset, candles.map((c) => c.close), macro, funds[asset] ?? null));
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
  const agree = read.axes.filter((a) => Math.sign(a.score) === biasSign && a.score !== 0).length;
  const conviction = read.axes.length ? Math.round((agree / read.axes.length) * 100) : 0;

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
              {agree} de {read.axes.length} forças
            </span>
          </div>
        </div>
        <p className="mt-4 border-t border-border/60 pt-3 text-sm text-foreground">{read.sentence}</p>
      </div>

      {/* Forças */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-1 text-sm font-semibold text-foreground">As forças por trás da leitura</h3>
        <div>
          {read.axes.map((a) => (
            <AxisRow key={a.key} a={a} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Confluência ponderada (mais peso na tendência) das velas diárias + macro global + valuation. Educacional — não é recomendação. Próximo: o fluxo de investidor entra como força.
        </p>
      </div>
    </div>
  );
}
