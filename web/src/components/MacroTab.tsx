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

interface CorrVal {
  c30: number;
  c90: number | null;
}

const fmtCorr = (c: number) => `${c >= 0 ? "+" : ""}${c.toFixed(2)}`;
const corrStrength = (c: number) => (Math.abs(c) >= 0.5 ? "forte" : Math.abs(c) >= 0.3 ? "moderada" : "fraca");
const corrDir = (c: number) => (c > 0.05 ? "direta" : c < -0.05 ? "inversa" : "neutra");
const clampPos = (c: number) => (Math.max(-1, Math.min(1, c)) + 1) / 2;

/** Medidor de correlação: −1 (inversa, vermelho) ↔ +1 (direta, verde). Marcador
 *  cheio = 30d; marcador fantasma = 90d (mostra se a relação fortaleceu/enfraqueceu). */
function CorrGauge({ corr }: { corr: CorrVal | null }) {
  const c30 = corr?.c30 ?? null;
  const c90 = corr?.c90 ?? null;
  const color = c30 == null ? "text-slate-500" : c30 > 0.05 ? "text-signal-green" : c30 < -0.05 ? "text-signal-red" : "text-slate-400";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">correlação</span>
        <span className={`text-xs font-semibold ${color}`}>
          {c30 == null ? "sem dado ainda" : `${fmtCorr(c30)} · ${corrStrength(c30)} ${corrDir(c30)}`}
          {c90 != null && <span className="ml-1 font-normal text-slate-500">· 90d {fmtCorr(c90)}</span>}
        </span>
      </div>
      <div
        className="relative mt-1.5 h-2 rounded-full"
        style={{ background: "linear-gradient(to right, rgba(239,68,68,0.55), rgba(148,163,184,0.3), rgba(34,197,94,0.55))" }}
      >
        {c90 != null && (
          <div
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40"
            style={{ left: `${clampPos(c90) * 100}%` }}
            title={`90d ${fmtCorr(c90)}`}
          />
        )}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900"
          style={{ left: `${clampPos(c30 ?? 0) * 100}%` }}
          title={c30 == null ? "" : `30d ${fmtCorr(c30)}`}
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

function buildSynthesis(corr: Record<string, CorrVal>, asset: string): string | null {
  const btc = corr["BTC"]?.c30;
  const spx = corr["SPX"]?.c30;
  const ndx = corr["NASDAQ"]?.c30;
  const dxy = corr["DXY"]?.c30;
  const vix = corr["VIX"]?.c30;
  const parts: string[] = [];

  if (asset !== "BTC" && btc != null) {
    if (btc >= 0.7) parts.push(`segue de perto o Bitcoin (${fmtCorr(btc)}) — principal motor; quando o BTC anda, ${asset} vai junto`);
    else if (btc >= 0.4) parts.push(`anda bastante com o Bitcoin (${fmtCorr(btc)})`);
    else parts.push(`relativamente descolada do Bitcoin (${fmtCorr(btc)}) — movimento mais próprio`);
  }

  const risk = ndx ?? spx;
  const riskName = ndx != null ? "Nasdaq" : "S&P 500";
  if (risk != null) {
    if (risk >= 0.4) parts.push(`risco-on: acompanha a bolsa de tecnologia (${riskName} ${fmtCorr(risk)})`);
    else if (risk <= -0.2) parts.push(`inversa às ações (${riskName} ${fmtCorr(risk)})`);
  }
  if (dxy != null && dxy <= -0.3) parts.push(`tende a subir quando o dólar cai (DXY ${fmtCorr(dxy)})`);
  if (vix != null) {
    if (vix <= -0.3) parts.push(`cai quando o medo aumenta (VIX ${fmtCorr(vix)})`);
    else if (vix >= 0.3) parts.push(`sobe junto com o VIX (${fmtCorr(vix)}), o que é incomum`);
  }

  if (!parts.length) return null;
  return `${asset}: ${parts.join("; ")}. Em dias de CPI/FOMC o macro costuma dominar — veja o calendário.`;
}

function countdown(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const days = Math.round((a - today) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

function fmtEvtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Aba "Macro & Correlações" (PRD §8.7 / §8.8.3) — Pro+. */
export default function MacroTab({ asset }: { asset: string }) {
  const [macro, setMacro] = useState<MacroAssetRow[]>([]);
  const [corr, setCorr] = useState<Record<string, CorrVal>>({});
  const [events, setEvents] = useState<EconEvent[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("macro_assets")
      .select("symbol, name, price, change_24h, change_7d, ts")
      .order("ts", { ascending: false })
      .limit(24)
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
      .select("macro_symbol, corr_30d, corr_90d, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(24)
      .then(({ data }) => {
        if (!active) return;
        const map: Record<string, CorrVal> = {};
        for (const r of (data as { macro_symbol: string; corr_30d: number; corr_90d: number | null }[]) ?? []) {
          if (!(r.macro_symbol in map)) map[r.macro_symbol] = { c30: r.corr_30d, c90: r.corr_90d ?? null };
        }
        setCorr(map);
      });

    return () => {
      active = false;
    };
  }, [asset]);

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
  const showBtc = asset !== "BTC" && corr["BTC"] != null;
  const sortedMacro = [...macro].sort((a, b) => {
    const ca = corr[a.symbol]?.c30;
    const cb = corr[b.symbol]?.c30;
    if (ca == null && cb == null) return 0;
    if (ca == null) return 1;
    if (cb == null) return -1;
    return Math.abs(cb) - Math.abs(ca);
  });

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Macro & Correlações · {asset}</h2>

      {synthesis && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-slate-200">
          <span className="mr-2">🧭</span>
          {synthesis}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Card de referência cripto: correlação com o BTC (o maior driver das alts) */}
        {showBtc && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-200">₿ Bitcoin</span>
              <span className="text-xs text-amber-500/80">referência cripto</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">o maior motor das altcoins</div>
            <CorrGauge corr={corr["BTC"] ?? null} />
          </div>
        )}

        {sortedMacro.map((m) => (
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
          {events?.map((e, i) => {
            const cd = countdown(e.date);
            return (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700/60 px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${e.impact === "High" ? "bg-signal-red" : "bg-signal-yellow"}`} />
                  <span className="truncate text-slate-200">{e.title}</span>
                  {cd && (
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${cd === "hoje" ? "border-signal-red/40 text-signal-red" : "border-ink-500 text-slate-400"}`}>
                      {cd}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-slate-500">
                  {(e.forecast || e.previous) && (
                    <span className="hidden md:inline">
                      ant. {e.previous ?? "—"} · est. {e.forecast ?? "—"}
                    </span>
                  )}
                  <span className="whitespace-nowrap text-slate-400">{fmtEvtDate(e.date)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Fonte: ForexFactory · USD, alto/médio impacto.</p>
      </div>

      <p className="text-xs text-slate-600">
        Correlação de Pearson dos retornos diários entre {asset} e cada referência (marcador cheio = 30d, fantasma = 90d).
        Cotações via Yahoo Finance.
      </p>
    </section>
  );
}
