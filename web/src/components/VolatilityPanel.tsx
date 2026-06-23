import { useEffect, useState } from "react";

import { LEVEL_DOT, readIvp, readIvRvSpread, readTermStructure, relativeTime } from "../lib/format";
import { useGlossary } from "../lib/glossary";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import type { Level } from "../lib/types";
import InfoTip from "./InfoTip";

interface VolRow {
  asset: string;
  dvol: number | null;
  ivp_90d: number | null;
  rv_30d: number | null;
  iv_rv_spread: number | null;
  term_structure: Record<string, number> | null;
  ts: string;
}

const TENORS = ["7d", "30d", "90d", "180d"];

/** Painel de volatilidade (PRD §8.9): DVOL, IV Percentile 90d, IV-RV spread e term
 *  structure. Complementa os cards de IV/Put-Call/Skew do Módulo Gamma (não duplica).
 *  BTC/ETH via Deribit (com DVOL) e SOL via Bybit (sem DVOL). RLS restringe a Pro+. */
export default function VolatilityPanel({ asset }: { asset: string }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const GLOSSARY = useGlossary();
  const [rows, setRows] = useState<VolRow[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("volatility_index")
        .select("asset, dvol, ivp_90d, rv_30d, iv_rv_spread, term_structure, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(300);
      if (active) setRows((data as VolRow[]) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [asset]);

  if (rows == null) return null;
  const latest = rows[0];
  if (!latest) {
    return (
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4 text-sm text-muted-foreground">
        {tt("Painel de volatilidade — acumulando dados (a cada 5 min).", "Volatility panel — building data (every 5 min).")}
      </div>
    );
  }

  const latestMs = new Date(latest.ts).getTime();
  const oldestMs = new Date(rows[rows.length - 1].ts).getTime();
  const histDays = (latestMs - oldestMs) / 86_400_000;
  const partialLabel = histDays >= 1 ? `${Math.round(histDays)}d` : `${Math.max(1, Math.round(histDays * 24))}h`;

  // Variação 24h do DVOL (procura o ponto mais próximo de 24h atrás)
  let dvolVar: number | null = null;
  const ref = rows.find((r) => new Date(r.ts).getTime() <= latestMs - 86_400_000);
  if (ref?.dvol != null && latest.dvol != null) dvolVar = latest.dvol - ref.dvol;

  const ivp = readIvp(latest.ivp_90d);
  const spread = readIvRvSpread(latest.iv_rv_spread, latest.rv_30d);
  const tsRead = readTermStructure(latest.term_structure);
  const term = latest.term_structure ?? {};
  const maxIv = Math.max(1, ...TENORS.map((t) => term[t] ?? 0));

  return (
    <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tt("Painel de volatilidade (opções)", "Volatility panel (options)")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <VolCard
          info={GLOSSARY.dvol}
          title={tt("DVOL (vol implícita)", "DVOL (implied vol)")}
          level="neutral"
          value={latest.dvol != null ? `${latest.dvol.toFixed(1)}%` : "—"}
          label={
            asset === "SOL"
              ? tt("DVOL é índice da Deribit — indisponível p/ SOL", "DVOL is a Deribit index — unavailable for SOL")
              : dvolVar != null
                ? `24h: ${dvolVar >= 0 ? "+" : ""}${dvolVar.toFixed(2)} pts`
                : tt("Variação 24h — acumulando", "24h change — building")
          }
          foot={asset !== "SOL" && dvolVar == null && histDays < 1 ? `${tt("histórico parcial:", "partial history:")} ${partialLabel}` : undefined}
        />
        <VolCard
          info={GLOSSARY.ivp}
          title="IV Percentile 90d"
          level={ivp.level}
          value={latest.ivp_90d != null ? `${latest.ivp_90d.toFixed(0)}/100` : "—"}
          label={ivp.label}
          foot={histDays < 90 ? `${tt("histórico parcial:", "partial history:")} ${partialLabel} ${tt("(enche até 90d)", "(fills to 90d)")}` : undefined}
        />
        <VolCard
          info={GLOSSARY.ivRv}
          title="IV − RV spread"
          level={spread.level}
          value={latest.iv_rv_spread != null ? `${latest.iv_rv_spread >= 0 ? "+" : ""}${latest.iv_rv_spread.toFixed(1)}` : "—"}
          label={spread.label}
          foot={latest.rv_30d != null ? `RV 30d: ${latest.rv_30d.toFixed(1)}%` : undefined}
        />
        {/* Term structure — mini-chart de barras por tenor */}
        <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[tsRead.level]}`} />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Term structure</span>
            <span className="ml-auto">{<InfoTip text={GLOSSARY.termStructure} />}</span>
          </div>
          <div className="mt-2 space-y-1">
            {TENORS.map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-[10px]">
                <span className="num w-7 text-muted-foreground">{t}</span>
                <div className="h-2 flex-1 rounded bg-muted">
                  <div className="h-2 rounded bg-primary/70" style={{ width: `${((term[t] ?? 0) / maxIv) * 100}%` }} />
                </div>
                <span className="num w-10 text-right text-muted-foreground">
                  {term[t] != null ? `${term[t].toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{tsRead.label}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {tt("Fonte:", "Source:")} {asset === "SOL" ? tt("Bybit (opções)", "Bybit (options)") : "Deribit"} · {relativeTime(latest.ts)} · {tt("leitura informativa, não é recomendação.", "informational read, not a recommendation.")}
      </p>
    </div>
  );
}

function VolCard({ title, level, value, label, foot, info }: { title: string; level: Level; value: string; label: string; foot?: string; info?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</span>
        {info && <span className="ml-auto">{<InfoTip text={info} />}</span>}
      </div>
      <div className="num mt-1 text-lg font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{label}</div>
      {foot && <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">{foot}</div>}
    </div>
  );
}
