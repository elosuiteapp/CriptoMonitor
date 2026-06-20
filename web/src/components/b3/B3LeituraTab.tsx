import { useEffect, useState } from "react";

import { fetchB3Chart, fetchB3Fundamentals, fetchB3Macro, type B3Fund, type B3MacroData } from "../../lib/b3";
import { ema, last, macd, rsi } from "../../lib/indicators/ta";

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

  // Tendência: preço vs média curta + média curta vs longa.
  const trend = clamp((price > e20 ? 50 : -50) + (e20 > e50 ? 50 : -50));
  // Momento: RSI + sinal do histograma MACD.
  const mom = clamp((Number.isFinite(r) ? (r - 50) * 4 : 0) * 0.7 + (hist > 0 ? 25 : -25));

  const axes: Axis[] = [
    { key: "trend", label: "Tendência", score: trend, note: `preço ${price > e20 ? "acima" : "abaixo"} da MM20 · MM20 ${e20 > e50 ? ">" : "<"} MM50` },
    { key: "mom", label: "Momento", score: mom, note: `RSI ${Number.isFinite(r) ? r.toFixed(0) : "—"} · MACD ${hist > 0 ? "+" : "−"}` },
  ];

  let macroScore = 0;
  if (macro) {
    const sp = macro.globals.find((g) => g.symbol === "S&P 500")?.changePct ?? null;
    const dollar = macro.globals.find((g) => g.symbol === "Dólar")?.changePct ?? null;
    const vix = macro.globals.find((g) => g.symbol === "VIX")?.price ?? null;
    macroScore = clamp((sp != null ? (sp >= 0 ? 34 : -34) : 0) + (dollar != null ? (dollar <= 0 ? 33 : -33) : 0) + (vix != null ? (vix < 20 ? 33 : -33) : 0));
    axes.push({ key: "macro", label: "Macro / risco", score: macroScore, note: `${sp != null && sp >= 0 ? "EUA↑" : "EUA↓"} · ${dollar != null && dollar <= 0 ? "dólar↓" : "dólar↑"} · VIX ${vix != null ? vix.toFixed(0) : "—"}` });
  }

  let fundScore = 0;
  let hasFund = false;
  if (fund && fund.pe != null && fund.pe > 0) {
    hasFund = true;
    fundScore = fund.pe < 10 ? 30 : fund.pe < 15 ? 12 : fund.pe < 25 ? -5 : -25;
    axes.push({ key: "fund", label: "Valuation", score: fundScore, note: `P/L ${fund.pe.toFixed(1)} (${fund.pe < 12 ? "barato" : fund.pe > 25 ? "caro" : "neutro"})` });
  }

  const bias = hasFund
    ? clamp(0.35 * trend + 0.25 * mom + 0.25 * macroScore + 0.15 * fundScore)
    : clamp(0.42 * trend + 0.32 * mom + 0.26 * macroScore);

  const label = leanWord(bias);
  const sentence = `${asset}: tendência de ${leanWord(trend)}, momento ${leanWord(mom)}${macro ? `, pano de fundo macro ${leanWord(macroScore)}` : ""}${hasFund ? `, valuation ${leanWord(fundScore)}` : ""}. Viés geral: ${label}.`;
  return { bias, label, axes, sentence };
}

function BiasGauge({ bias, label }: { bias: number; label: string }) {
  const pct = (bias + 100) / 2; // 0..100
  const tone = bias >= 12 ? "text-emerald-500" : bias <= -12 ? "text-rose-500" : "text-muted-foreground";
  return (
    <div>
      <div className="flex items-end justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Viés do ativo</span>
        <span className={`text-lg font-bold capitalize ${tone}`}>{label}</span>
      </div>
      <div className="relative mt-2 h-3 rounded-full bg-gradient-to-r from-rose-500/40 via-muted/40 to-emerald-500/40">
        <div className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-foreground shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>baixa</span>
        <span>neutro</span>
        <span>alta</span>
      </div>
    </div>
  );
}

function AxisRow({ a }: { a: Axis }) {
  const tone = a.score >= 12 ? "text-emerald-500" : a.score <= -12 ? "text-rose-500" : "text-muted-foreground";
  const pct = Math.abs(a.score) / 2;
  const pos = a.score >= 0;
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{a.label}</span>
        <span className={`text-xs font-semibold capitalize ${tone}`}>{leanWord(a.score)}</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-muted/50">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div className={`absolute top-0 h-full rounded-full ${pos ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={pos ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{a.note}</div>
    </div>
  );
}

/** Leitura do Mercado da B3: confluência (tendência + momento + macro + valuation). */
export default function B3LeituraTab({ asset }: { asset: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEmpty(false);
    Promise.all([fetchB3Chart(asset), fetchB3Macro(), fetchB3Fundamentals(asset)]).then(([candles, macro, fund]) => {
      if (!alive) return;
      const r = computeRead(asset, candles.map((c) => c.close), macro, fund);
      setRead(r);
      setEmpty(!r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [asset]);

  if (loading) return <div className="h-48 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (empty || !read) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Sem dados suficientes para a leitura de {asset}.</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card dark:bg-card/60 dark:shadow-glow">
        <BiasGauge bias={read.bias} label={read.label} />
        <p className="mt-4 text-sm text-foreground">{read.sentence}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {read.axes.map((a) => (
          <AxisRow key={a.key} a={a} />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Confluência de eixos (peso maior na tendência) a partir das velas diárias + macro global + valuation. Educacional — não é recomendação. Próximo: incorporar o fluxo de investidor ao viés.
      </p>
    </div>
  );
}
