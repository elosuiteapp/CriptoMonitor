import { useEffect, useState } from "react";

import { fmtPct, readMacro } from "../lib/format";
import { supabase } from "../lib/supabase";
import MetricCard from "./MetricCard";

interface MacroAssetRow {
  symbol: string;
  name: string;
  price: number | null;
  change_24h: number | null;
  change_7d: number | null;
  ts: string;
}

/** Aba "Macro & Correlações" (PRD §8.7 / §8.8.3) — Pro+. */
export default function MacroTab({ asset }: { asset: string }) {
  const [macro, setMacro] = useState<MacroAssetRow[]>([]);
  const [corr, setCorr] = useState<Record<string, number>>({});
  const [ts, setTs] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("macro_assets")
      .select("symbol, name, price, change_24h, change_7d, ts")
      .order("ts", { ascending: false })
      .limit(16)
      .then(({ data }) => {
        if (!active) return;
        const seen = new Set<string>();
        const rows: MacroAssetRow[] = [];
        for (const r of (data as MacroAssetRow[]) ?? []) {
          if (!seen.has(r.symbol)) {
            seen.add(r.symbol);
            rows.push(r);
          }
        }
        setMacro(rows);
        setTs(rows[0]?.ts ?? null);
      });

    supabase
      .from("macro_correlations")
      .select("macro_symbol, corr_30d, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!active) return;
        const map: Record<string, number> = {};
        for (const r of (data as { macro_symbol: string; corr_30d: number }[]) ?? []) {
          if (!(r.macro_symbol in map)) map[r.macro_symbol] = r.corr_30d;
        }
        setCorr(map);
      });

    return () => {
      active = false;
    };
  }, [asset]);

  if (!macro.length) {
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-500">
        Dados macro indisponíveis — aguardando coleta (a cada 30 min).
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Macro & Correlações · {asset}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {macro.map((m) => (
          <MetricCard
            key={m.symbol}
            title={`${m.name} · ${m.price ?? "—"}${m.symbol === "US10Y" ? "%" : ""}`}
            reading={readMacro(m.name, m.change_7d, corr[m.symbol] ?? null, asset)}
            expanded={
              <div className="text-slate-400">
                24h {fmtPct((m.change_24h ?? 0) * 100, 2)} · 7d {fmtPct((m.change_7d ?? 0) * 100, 2)}
              </div>
            }
            source="Yahoo Finance"
            timestamp={ts}
          />
        ))}
      </div>
      <p className="text-xs text-slate-600">
        Correlação de Pearson dos retornos diários (30d). Positiva = anda junto; negativa = inversa.
        Calendário econômico (FOMC/CPI) entra em etapa seguinte.
      </p>
    </section>
  );
}
