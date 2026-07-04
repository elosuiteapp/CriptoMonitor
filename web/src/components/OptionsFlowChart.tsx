import { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, LineStyle, createChart, type IChartApi } from "lightweight-charts";

import { useTheme } from "../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../lib/chartTheme";
import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";

interface FlowRow {
  net_delta_flow: number | null;
  ts: string;
}
interface SpotRow {
  spot_price: number | null;
  ts: string;
}

/** Proxy de fluxo de opções (HIRO simplificado, PRD3). Linha do delta-fluxo
 *  acumulado (eixo esquerdo), colorida por direção (verde sobe / vermelho cai),
 *  sobre o preço spot (eixo direito). Resolução 5 min.
 *  v2 (03/jul): janela 12/24/48h, fetch com retry + estados de verdade, resumo
 *  numérico (Δ1h) e DETECTOR de divergência fluxo × preço — a leitura de ouro
 *  do HIRO (preço subindo sem hedge comprador = rali sem suporte de opções). */
export default function OptionsFlowChart({ asset }: { asset: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { isDark } = useTheme();
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);

  const [hours, setHours] = useState<12 | 24 | 48>(24);
  const [flowRows, setFlowRows] = useState<FlowRow[] | null>(null);
  const [gpRows, setGpRows] = useState<SpotRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [reload, setReload] = useState(0);

  // ── Fetch com retry: falha de rede não pode virar "acumulando" mudo nem apagar o gráfico bom ──
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(false);
    const limit = hours * 12; // linhas de 5 min
    (async () => {
      for (let attempt = 0; attempt < 2 && active; attempt++) {
        const [{ data: flow, error: fErr }, { data: gp, error: gErr }] = await Promise.all([
          supabase.from("options_flow").select("net_delta_flow, ts").eq("asset", asset).order("ts", { ascending: false }).limit(limit),
          supabase.from("gamma_profile").select("spot_price, ts").eq("asset", asset).order("ts", { ascending: false }).limit(limit),
        ]);
        if (!active) return;
        if (!fErr && !gErr && flow) {
          // desc + limit pega as MAIS RECENTES; inverte p/ crescente (exigência do gráfico)
          setFlowRows((flow as FlowRow[]).slice().reverse());
          setGpRows(((gp as SpotRow[]) ?? []).slice().reverse());
          setLoading(false);
          return;
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      }
      if (active) {
        setErr(true); // mantém os dados anteriores, se existirem
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [asset, hours, reload]);

  // ── Série acumulada (uma passada; reusada pelo gráfico e pelo resumo/divergência) ──
  const cumData = useMemo(() => {
    if (!flowRows) return null;
    let cum = 0;
    const seen = new Set<number>();
    return flowRows
      .filter((r) => r.net_delta_flow != null)
      .map((r) => {
        cum += Number(r.net_delta_flow);
        return { time: Math.floor(new Date(r.ts).getTime() / 1000), value: Number(cum.toFixed(4)) };
      })
      .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
  }, [flowRows]);

  // ── Resumo + divergência fluxo × preço (~última hora) ──
  const stats = useMemo(() => {
    if (!cumData || cumData.length < 2 || !gpRows?.length) return null;
    const lastT = cumData[cumData.length - 1].time;
    const cutoff = lastT - 3600;
    const at = (t: number) => {
      let best = cumData[0];
      for (const p of cumData) if (Math.abs(p.time - t) < Math.abs(best.time - t)) best = p;
      return best.value;
    };
    const flowNow = cumData[cumData.length - 1].value;
    const flow1h = flowNow - at(cutoff);
    const spots = gpRows.filter((r) => r.spot_price != null);
    const spotNow = spots.length ? Number(spots[spots.length - 1].spot_price) : null;
    let spot1hPct: number | null = null;
    if (spotNow != null && spots.length >= 2) {
      let ref0 = spots[0];
      for (const r of spots) {
        const ts = Math.floor(new Date(r.ts).getTime() / 1000);
        if (Math.abs(ts - cutoff) < Math.abs(Math.floor(new Date(ref0.ts).getTime() / 1000) - cutoff)) ref0 = r;
      }
      const p0 = Number(ref0.spot_price);
      if (p0 > 0) spot1hPct = ((spotNow - p0) / p0) * 100;
    }
    // Divergência: preço e hedge em direções opostas na última hora (limiares anti-ruído).
    const span = Math.max(1, Math.abs(flowNow) + Math.abs(flow1h));
    const flowSig = Math.abs(flow1h) > span * 0.02 ? Math.sign(flow1h) : 0;
    const spotSig = spot1hPct != null && Math.abs(spot1hPct) > 0.15 ? Math.sign(spot1hPct) : 0;
    const divergent = flowSig !== 0 && spotSig !== 0 && flowSig !== spotSig;
    const aligned = flowSig !== 0 && spotSig !== 0 && flowSig === spotSig;
    return { flowNow, flow1h, spot1hPct, divergent, aligned, lastT };
  }, [cumData, gpRows]);

  // ── Gráfico (reconstruído quando os dados mudam) ──
  useEffect(() => {
    const el = ref.current;
    if (!el || !cumData || cumData.length < 2) return;
    const ax = chartAxisColors(isDark);
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: ax.text, fontFamily: "system-ui, sans-serif" },
      grid: { vertLines: { color: ax.grid }, horzLines: { color: ax.grid } },
      localization: chartLocalization,
      rightPriceScale: { borderColor: ax.border },
      leftPriceScale: { visible: true, borderColor: ax.border },
      timeScale: { borderColor: ax.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
    });

    const spotSeries = chart.addLineSeries({
      color: ax.text, lineWidth: 1, lineStyle: LineStyle.Dotted, priceScaleId: "right", priceLineVisible: false, lastValueVisible: true, title: "Spot",
    });

    // Cor por direção do acumulado: cada trecho contíguo de mesma direção é UMA série
    // própria (séries sobrepostas vazariam cor). Direção por média móvel curta (anti-confete).
    const win = 5;
    const sm = cumData.map((_, i) => {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - win + 1); j <= i; j++) {
        s += cumData[j].value;
        c++;
      }
      return s / c;
    });
    const runs: { up: boolean; pts: { time: number; value: number }[] }[] = [];
    for (let i = 1; i < cumData.length; i++) {
      const up = sm[i] >= sm[i - 1];
      const last = runs[runs.length - 1];
      if (last && last.up === up) last.pts.push(cumData[i]);
      else runs.push({ up, pts: [cumData[i - 1], cumData[i]] });
    }
    runs.forEach((run, idx) => {
      const isLast = idx === runs.length - 1;
      const s = chart.addLineSeries({
        color: run.up ? "#22c55e" : "#ef4444",
        lineWidth: 2,
        priceScaleId: "left",
        priceLineVisible: false,
        lastValueVisible: isLast,
        title: isLast ? tt("Fluxo acum.", "Cum. flow") : "",
      });
      s.setData(run.pts as never);
      if (idx === 0) {
        s.createPriceLine({ price: 0, color: "rgba(148,163,184,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      }
    });

    if (gpRows) {
      const seen2 = new Set<number>();
      const spotData = gpRows
        .filter((r) => r.spot_price != null)
        .map((r) => ({ time: Math.floor(new Date(r.ts).getTime() / 1000), value: Number(r.spot_price) }))
        .filter((p) => (seen2.has(p.time) ? false : (seen2.add(p.time), true)));
      spotSeries.setData(spotData as never);
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumData, gpRows, isDark, isEn]);

  const hasChart = !!cumData && cumData.length >= 2;
  const loc = getLocale() === "en" ? "en-US" : "pt-BR";

  return (
    <div>
      {/* Resumo + divergência + janela */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {stats && (
            <>
              <span className={`num rounded-full px-2 py-0.5 font-semibold ${stats.flow1h >= 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
                Δ1h {stats.flow1h >= 0 ? "+" : ""}{Math.round(stats.flow1h)}
              </span>
              {stats.spot1hPct != null && (
                <span className="num text-muted-foreground">
                  spot {stats.spot1hPct >= 0 ? "+" : ""}{stats.spot1hPct.toFixed(2)}% · 1h
                </span>
              )}
              {stats.divergent && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 dark:text-amber-400">
                  ⚠ {stats.spot1hPct != null && stats.spot1hPct > 0
                    ? tt("divergência: preço sobe com hedge VENDEDOR — rali sem suporte de opções", "divergence: price up with SELL hedge — rally without options support")
                    : tt("divergência: preço cai com hedge COMPRADOR — queda sem confirmação do hedge", "divergence: price down with BUY hedge — decline without hedge confirmation")}
                </span>
              )}
              {stats.aligned && (
                <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                  {tt("fluxo confirma o preço", "flow confirms price")}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1 rounded-md bg-muted p-0.5">
          {([12, 24, 48] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${hours === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {err && hasChart && (
        <div className="mb-1 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-500">
          {tt("Falha ao atualizar — mostrando os últimos dados carregados.", "Update failed — showing the last loaded data.")}
          <button onClick={() => setReload((r) => r + 1)} className="ml-2 underline">{tt("tentar de novo", "retry")}</button>
        </div>
      )}

      <div className="relative">
        {loading && !hasChart ? (
          <div className="h-[260px] animate-pulse rounded-lg bg-muted/40" />
        ) : err && !hasChart ? (
          <div className="grid h-[260px] place-items-center">
            <div className="text-center text-xs text-muted-foreground">
              <p>{tt("Não foi possível carregar o fluxo de opções agora.", "Couldn't load the options flow right now.")}</p>
              <button onClick={() => setReload((r) => r + 1)} className="mt-2 rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted">
                {tt("Tentar de novo", "Try again")}
              </button>
            </div>
          </div>
        ) : !hasChart ? (
          <div className="grid h-[260px] place-items-center text-xs text-muted-foreground">
            {tt("Acumulando fluxo de opções (a cada 5 min).", "Building options flow (every 5 min).")}
          </div>
        ) : (
          <div ref={ref} className="h-[260px] w-full" />
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-emerald-500" />{tt("Fluxo subindo (hedge comprador: compra de call/venda de put)", "Flow rising (buy hedge: buying calls / selling puts)")}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-rose-500" />{tt("Fluxo caindo (hedge vendedor)", "Flow falling (sell hedge)")}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-muted-foreground" />Spot</span>
        {stats && (
          <span className="ml-auto text-muted-foreground/70">
            {(isEn ? "updated " : "atualizado ") + new Date(stats.lastT * 1000).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
