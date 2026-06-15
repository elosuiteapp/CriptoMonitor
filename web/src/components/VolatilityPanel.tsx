import { useEffect, useState } from "react";

import { LEVEL_DOT, readIvp, readIvRvSpread, readTermStructure, relativeTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Level } from "../lib/types";

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
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4 text-sm text-slate-500">
        Painel de volatilidade — acumulando dados (a cada 5 min).
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
    <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Painel de volatilidade (opções)
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <VolCard
          title="DVOL (vol implícita)"
          level="neutral"
          value={latest.dvol != null ? `${latest.dvol.toFixed(1)}%` : "—"}
          label={
            asset === "SOL"
              ? "DVOL é índice da Deribit — indisponível p/ SOL"
              : dvolVar != null
                ? `24h: ${dvolVar >= 0 ? "+" : ""}${dvolVar.toFixed(2)} pts`
                : "Variação 24h — acumulando"
          }
          foot={asset !== "SOL" && dvolVar == null && histDays < 1 ? `histórico parcial: ${partialLabel}` : undefined}
        />
        <VolCard
          title="IV Percentile 90d"
          level={ivp.level}
          value={latest.ivp_90d != null ? `${latest.ivp_90d.toFixed(0)}/100` : "—"}
          label={ivp.label}
          foot={histDays < 90 ? `histórico parcial: ${partialLabel} (enche até 90d)` : undefined}
        />
        <VolCard
          title="IV − RV spread"
          level={spread.level}
          value={latest.iv_rv_spread != null ? `${latest.iv_rv_spread >= 0 ? "+" : ""}${latest.iv_rv_spread.toFixed(1)}` : "—"}
          label={spread.label}
          foot={latest.rv_30d != null ? `RV 30d: ${latest.rv_30d.toFixed(1)}%` : undefined}
        />
        {/* Term structure — mini-chart de barras por tenor */}
        <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[tsRead.level]}`} />
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Term structure</span>
          </div>
          <div className="mt-2 space-y-1">
            {TENORS.map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-7 text-slate-500">{t}</span>
                <div className="h-2 flex-1 rounded bg-ink-700">
                  <div className="h-2 rounded bg-accent/70" style={{ width: `${((term[t] ?? 0) / maxIv) * 100}%` }} />
                </div>
                <span className="w-10 text-right tabular-nums text-slate-400">
                  {term[t] != null ? `${term[t].toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-snug text-slate-500">{tsRead.label}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">
        Fonte: {asset === "SOL" ? "Bybit (opções)" : "Deribit"} · {relativeTime(latest.ts)} · leitura informativa, não é recomendação.
      </p>
    </div>
  );
}

function VolCard({ title, level, value, label, foot }: { title: string; level: Level; value: string; label: string; foot?: string }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`} />
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{title}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{label}</div>
      {foot && <div className="mt-1 text-[10px] text-amber-400/80">{foot}</div>}
    </div>
  );
}
