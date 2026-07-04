// Sazonalidade mensal do ativo (estilo TradingView "Seasonals", com dados da Binance):
// média do retorno de cada mês do calendário + taxa de acerto (% de anos positivos),
// calculadas das velas MENSAIS no cliente — zero coleta nova. O mês atual (em formação)
// fica fora da média e aparece destacado. Card LIVRE (vitrine da aba Macro).
import { useEffect, useState } from "react";

import { getLocale } from "../hooks/useLocale";
import { fetchKlines } from "../lib/marketData";
import InfoTip from "./InfoTip";

const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

interface MonthStat {
  avg: number; // média do retorno do mês (%)
  win: number; // % de anos em que o mês fechou positivo
  n: number; // amostra (anos)
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function SeasonalityCard({ asset }: { asset: string }) {
  const [stats, setStats] = useState<MonthStat[] | null>(null);
  const [sinceYear, setSinceYear] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setStats(null);
    fetchKlines(asset, "1M", 200)
      .then((cs) => {
        if (!active) return;
        if (!cs || cs.length < 2) {
          setStats([]);
          return;
        }
        const closed = cs.slice(0, -1); // exclui o mês ATUAL (em formação)
        const by: number[][] = Array.from({ length: 12 }, () => []);
        for (const c of closed) {
          if (c.open > 0) by[new Date((c.time as number) * 1000).getUTCMonth()].push(((c.close - c.open) / c.open) * 100);
        }
        setSinceYear(new Date((closed[0].time as number) * 1000).getUTCFullYear());
        setStats(
          by.map((a) => ({
            avg: a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0,
            win: a.length ? (a.filter((v) => v > 0).length / a.length) * 100 : 0,
            n: a.length,
          })),
        );
      })
      .catch(() => active && setStats([]));
    return () => {
      active = false;
    };
  }, [asset]);

  // Amostra mínima: 3 anos de histórico no mês (senão a média é ruído).
  const maxN = stats ? Math.max(...stats.map((s) => s.n)) : 0;
  if (stats && (stats.length === 0 || maxN < 3)) return null;

  const months = getLocale() === "en" ? MONTHS_EN : MONTHS_PT;
  const nowM = new Date().getUTCMonth();
  const maxAbs = stats ? Math.max(1, ...stats.map((s) => Math.abs(s.avg))) : 1;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {tl("Sazonalidade mensal", "Monthly seasonality")} · {asset}
          <InfoTip
            text={tl(
              "Média do retorno de cada mês do calendário no histórico do ativo (velas mensais da Binance) + % de anos em que o mês fechou positivo. O mês atual fica de fora da média. Sazonalidade é tendência estatística, não garantia — amostra de poucos anos.",
              "Average return of each calendar month across the asset's history (Binance monthly candles) + % of years the month closed positive. The current month is excluded from the average. Seasonality is a statistical tendency, not a guarantee — few-year sample.",
            )}
          />
        </h3>
        {stats && sinceYear != null && (
          <span className="text-[11px] text-muted-foreground">
            {tl("desde", "since")} {sinceYear} · {maxN} {tl("anos", "years")}
          </span>
        )}
      </div>

      {!stats ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-muted/40" />
      ) : (
        <>
          <div className="mt-3 flex h-28 items-end gap-1.5">
            {stats.map((s, i) => {
              const up = s.avg >= 0;
              const h = Math.max(4, (Math.abs(s.avg) / maxAbs) * 88);
              const isNow = i === nowM;
              return (
                <div key={i} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${months[i]}: ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(1)}% ${tl("na média", "avg")} · ${tl("fechou positivo em", "closed positive in")} ${s.win.toFixed(0)}% ${tl("dos anos", "of years")} (n=${s.n})`}>
                  <div
                    className={`w-full rounded-sm ${up ? "bg-emerald-500/70" : "bg-rose-500/70"} ${isNow ? "ring-2 ring-primary" : ""}`}
                    style={{ height: `${h}px` }}
                  />
                  <span className={`mt-1 text-[9px] ${isNow ? "font-bold text-primary" : "text-muted-foreground"}`}>{months[i]}</span>
                  <span className={`num text-[8px] ${up ? "text-emerald-500" : "text-rose-500"}`}>
                    {s.avg >= 0 ? "+" : ""}
                    {s.avg.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {tl(
              "Barra = retorno médio do mês no histórico · contorno = mês atual · passe o mouse para ver a taxa de acerto. Tendência estatística, não garantia.",
              "Bar = the month's average historical return · outline = current month · hover for the win rate. Statistical tendency, not a guarantee.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
