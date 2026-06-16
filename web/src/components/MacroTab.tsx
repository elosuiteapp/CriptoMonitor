import { useEffect, useState } from "react";

import { fmtPct } from "../lib/format";
import { supabase } from "../lib/supabase";

interface MacroAssetRow {
  symbol: string;
  name: string;
  price: number | null;
  change_24h: number | null;
  change_7d: number | null;
  ts: string;
}

interface EconEvent {
  title: string;
  date: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
}

const fmtCorr = (c: number) => `${c >= 0 ? "+" : ""}${c.toFixed(2)}`;
const corrStrength = (c: number) => (Math.abs(c) >= 0.5 ? "forte" : Math.abs(c) >= 0.3 ? "moderada" : "fraca");
const corrDir = (c: number) => (c > 0.05 ? "direta" : c < -0.05 ? "inversa" : "neutra");

/** Medidor de correlação: −1 (inversa, vermelho) ↔ +1 (direta, verde), marcador no valor. */
function CorrGauge({ corr }: { corr: number | null }) {
  const pos = corr == null ? 0.5 : (Math.max(-1, Math.min(1, corr)) + 1) / 2;
  const color = corr == null ? "text-slate-500" : corr > 0.05 ? "text-signal-green" : corr < -0.05 ? "text-signal-red" : "text-slate-400";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">correlação 30d</span>
        <span className={`text-xs font-semibold ${color}`}>
          {corr == null ? "sem dado ainda" : `${fmtCorr(corr)} · ${corrStrength(corr)} ${corrDir(corr)}`}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-2 rounded-full"
        style={{ background: "linear-gradient(to right, rgba(239,68,68,0.55), rgba(148,163,184,0.3), rgba(34,197,94,0.55))" }}
      >
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>inversa (−1)</span>
        <span>0</span>
        <span>direta (+1)</span>
      </div>
    </div>
  );
}

function buildSynthesis(corr: Record<string, number>, asset: string): string | null {
  const spx = corr["SPX"];
  const dxy = corr["DXY"];
  if (spx == null && dxy == null) return null;
  const parts: string[] = [];
  if (spx != null) {
    if (spx >= 0.4) parts.push(`anda junto com o S&P 500 (${fmtCorr(spx)}) — perfil risco-on`);
    else if (spx <= -0.2) parts.push(`inversa ao S&P (${fmtCorr(spx)}) — descolada das ações`);
    else parts.push(`pouca ligação com as ações (S&P ${fmtCorr(spx)})`);
  }
  if (dxy != null) {
    if (dxy <= -0.3) parts.push(`inversa ao dólar (DXY ${fmtCorr(dxy)}) — tende a subir quando o dólar cai`);
    else if (dxy >= 0.3) parts.push(`positiva com o dólar (${fmtCorr(dxy)}), o que é incomum`);
    else parts.push(`pouco sensível ao dólar (${fmtCorr(dxy)})`);
  }
  return `${asset}: ${parts.join("; ")}. Em dias de CPI/FOMC o macro costuma dominar — veja o calendário abaixo.`;
}

function fmtEvtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Aba "Macro & Correlações" (PRD §8.7 / §8.8.3) — Pro+. */
export default function MacroTab({ asset }: { asset: string }) {
  const [macro, setMacro] = useState<MacroAssetRow[]>([]);
  const [corr, setCorr] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<EconEvent[] | null>(null);

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

  // Calendário econômico (uma vez) — relay ForexFactory via edge function
  useEffect(() => {
    let active = true;
    supabase.functions.invoke("econ-calendar").then(({ data }) => {
      if (active) setEvents(((data as { events?: EconEvent[] })?.events ?? []) as EconEvent[]);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!macro.length) {
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-500">
        Dados macro indisponíveis — aguardando coleta (a cada 30 min).
      </div>
    );
  }

  const synthesis = buildSynthesis(corr, asset);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Macro & Correlações · {asset}</h2>

      {/* Síntese macro do ativo */}
      {synthesis && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-slate-200">
          <span className="mr-2">🧭</span>
          {synthesis}
        </div>
      )}

      {/* Cards macro com medidor de correlação */}
      <div className="grid gap-3 sm:grid-cols-2">
        {macro.map((m) => (
          <div key={m.symbol} className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-200">{m.name}</span>
              <span className="text-xs text-slate-400">
                {m.price ?? "—"}
                {m.symbol === "US10Y" ? "%" : ""}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              7d {fmtPct((m.change_7d ?? 0) * 100, 1)} · 24h {fmtPct((m.change_24h ?? 0) * 100, 1)}
            </div>
            <CorrGauge corr={corr[m.symbol] ?? null} />
          </div>
        ))}
      </div>

      {/* Calendário econômico */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-300">Calendário econômico (EUA)</h3>
          <span className="text-[11px] text-slate-500">eventos que mexem com o macro</span>
        </div>
        {events == null && <p className="mt-3 text-xs text-slate-500">Carregando…</p>}
        {events && events.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">Sem eventos de alto/médio impacto nos próximos dias.</p>
        )}
        <div className="mt-3 space-y-2">
          {events?.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700/60 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${e.impact === "High" ? "bg-signal-red" : "bg-signal-yellow"}`} />
                <span className="truncate text-slate-200">{e.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-slate-500">
                {(e.forecast || e.previous) && (
                  <span className="hidden md:inline">
                    prev {e.previous ?? "—"} · est. {e.forecast ?? "—"}
                  </span>
                )}
                <span className="whitespace-nowrap text-slate-400">{fmtEvtDate(e.date)}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Fonte: ForexFactory · USD, alto/médio impacto.</p>
      </div>

      <p className="text-xs text-slate-600">
        Correlação de Pearson dos retornos diários (30d) entre {asset} e cada ativo macro · cotações via Yahoo Finance.
      </p>
    </section>
  );
}
