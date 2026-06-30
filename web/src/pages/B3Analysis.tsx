import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Disclaimer from "../components/Disclaimer";
import Markdown from "../components/Markdown";
import { selicAA } from "../components/b3/B3Shared";
import { B3_ASSETS, B3_FIIS, fetchB3Chart, fetchB3Dividends, fetchB3FiisAll, fetchB3FundamentalsAll, fetchB3Macro, fetchB3Overview, isFii } from "../lib/b3";
import { useT } from "../lib/i18n";
import { ema, last, rsi } from "../lib/indicators/ta";
import { computeSmc } from "../lib/smc";
import type { Candle } from "../lib/marketData";
import { supabase } from "../lib/supabase";

interface ReportRow {
  content: string;
  model: string | null;
  ts: string;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const assetName = (sym: string) => [...B3_ASSETS, ...B3_FIIS].find((a) => a.symbol === sym)?.name ?? sym;

/** Monta o contexto do ativo (cotação + fundamentos + dividendos + macro + técnico/SMC). */
async function buildContext(asset: string, kind: "stock" | "fii") {
  const [ov, funds, fiis, div, macro, candles] = await Promise.all([
    fetchB3Overview(),
    kind === "fii" ? Promise.resolve({}) : fetchB3FundamentalsAll(),
    kind === "fii" ? fetchB3FiisAll() : Promise.resolve({}),
    fetchB3Dividends(asset),
    fetchB3Macro(),
    fetchB3Chart(asset, "1d"),
  ]);

  const q = ov?.quotes.find((x) => x.symbol === asset) ?? null;
  const quote = q ? { symbol: q.symbol, name: assetName(asset), price: q.price, changePct: q.changePct, semana: q.w1, quinze: q.d15, mes: q.d30 } : { symbol: asset, name: assetName(asset) };
  const fund = kind === "fii" ? (fiis as Record<string, unknown>)[asset] ?? null : (funds as Record<string, unknown>)[asset] ?? null;

  // Dividendos: DY 12m + sazonalidade.
  const divs = div.dividends ?? [];
  const nowS = Date.now() / 1000;
  const last12 = divs.filter((d) => d.date >= nowS - 365 * 86400);
  const paid12m = last12.reduce((s, d) => s + d.amount, 0);
  const dy12m = div.price && div.price > 0 ? (paid12m / div.price) * 100 : null;
  const monthCount = new Array(12).fill(0);
  const years = new Set<number>();
  divs.forEach((d) => {
    const dt = new Date(d.date * 1000);
    monthCount[dt.getUTCMonth()]++;
    years.add(dt.getUTCFullYear());
  });
  const thr = Math.max(2, Math.ceil(years.size * 0.4));
  const mesesQuePaga = monthCount.map((c, i) => (c >= thr ? MONTHS[i] : null)).filter(Boolean);
  const dividends = divs.length ? { dyAnual12m: dy12m, pagoPorAcao12m: paid12m, pagamentos12m: last12.length, mesesQuePaga } : null;

  // Técnico + estrutura Smart Money.
  let technical: Record<string, unknown> | null = null;
  if (candles.length > 25) {
    const closes = candles.map((c) => c.close);
    const e20 = last(ema(closes, 20));
    const e50 = last(ema(closes, 50));
    const r = last(rsi(closes, 14));
    const price = last(closes);
    const smc = computeSmc(candles as Candle[]);
    technical = {
      tendencia: price > e20 ? (e20 > e50 ? "alta" : "alta fraca") : e20 < e50 ? "baixa" : "baixa fraca",
      precoVsMM20: price > e20 ? "acima" : "abaixo",
      mm20: e20,
      mm50: e50,
      rsi14: Number.isFinite(r) ? Math.round(r) : null,
      viesEstrutura: smc?.swingBias ?? null,
      zonaRange: smc ? (smc.price >= smc.premium.bottom ? "premium (caro)" : smc.price <= smc.discount.top ? "discount (barato)" : "equilíbrio") : null,
      rangeMin: smc?.trailingBottom ?? null,
      rangeMax: smc?.trailingTop ?? null,
    };
  }

  const g = (s: string) => macro?.globals.find((x) => x.symbol === s);
  const macroCtx = {
    selicAnual: selicAA(macro?.macro.selic ?? null),
    ipcaMes: macro?.macro.ipca ?? null,
    dolarPtax: macro?.macro.usd_brl ?? null,
    ibovDia: ov?.quotes.find((x) => x.symbol === "IBOV")?.changePct ?? null,
    sp500Dia: g("S&P 500")?.changePct ?? null,
    vix: g("VIX")?.price ?? null,
    dolarDia: g("Dólar")?.changePct ?? null,
  };

  return { quote, fundamentos: fund, dividendos: dividends, tecnico: technical, macro: macroCtx };
}

/** "O que está acontecendo" do B3 — análise por IA DO ATIVO selecionado (ação ou FII). */
export default function B3Analysis() {
  const { t, isEn } = useT();
  const [params] = useSearchParams();
  const asset = (params.get("asset") ?? "PETR4").toUpperCase();
  const kind: "stock" | "fii" = isFii(asset) ? "fii" : "stock";
  const [row, setRow] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("b3_asset_reports").select("content, model, ts").eq("asset", asset).order("ts", { ascending: false }).limit(1).maybeSingle();
    setRow((data as ReportRow) ?? null);
    setLoading(false);
  }, [asset]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const context = await buildContext(asset, kind);
      const { data, error: fnErr } = await supabase.functions.invoke("b3-analysis", { body: { asset, kind, context } });
      if (fnErr) {
        let msg = fnErr.message;
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const b = await ctx.json().catch(() => null);
          if (b?.error) msg = b.error;
        }
        throw new Error(msg);
      }
      setRow({ content: data.content, model: data.model_used, ts: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.pages.analysis.genFail);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          {t.pages.backCockpit}
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            {t.pages.analysis.title} · {asset}
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">{kind === "fii" ? "FII" : "B3"}</span>
          </h1>
          <button onClick={generate} disabled={generating} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {generating ? t.pages.analysis.generating : `✨ ${t.pages.analysis.generate}`}
          </button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}

        <div className="mt-4 rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-6 dark:bg-card/60">
          {loading ? (
            <p className="text-muted-foreground">{t.common.loading}</p>
          ) : row ? (
            <>
              <Markdown text={row.content} />
              <p className="mt-4 text-xs text-muted-foreground">{t.pages.analysis.aiAt.replace("{date}", new Date(row.ts).toLocaleString(isEn ? "en-US" : "pt-BR"))}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.pages.analysis.noneA}<strong>{t.pages.analysis.generate}</strong>{t.pages.b3Analysis.noneB.replace("{asset}", asset)}
            </p>
          )}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
