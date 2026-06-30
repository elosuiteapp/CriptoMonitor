import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fmtPct } from "../lib/format";
import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import type { MacroData, MarketLiquidityData } from "../lib/types";
import CotCard, { type CotRow } from "./CotCard";
import FearGreedHistoryPanel from "./FearGreedHistoryPanel";
import InfoTip from "./InfoTip";
import LiquidityDirectionPanel from "./LiquidityDirectionPanel";
import MacroGlobalPanel from "./MacroGlobalPanel";
import OnchainPanel from "./OnchainPanel";

/** Seletor PT/EN para os helpers de módulo (o componente re-renderiza via useT). */
const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

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
  country: string;
  forecast: string | null;
  previous: string | null;
}

interface CorrVal {
  c30: number;
  c90: number | null;
}

const fmtCorr = (c: number) => `${c >= 0 ? "+" : ""}${c.toFixed(2)}`;
const corrStrength = (c: number) => (Math.abs(c) >= 0.5 ? tl("forte", "strong") : Math.abs(c) >= 0.3 ? tl("moderada", "moderate") : tl("fraca", "weak"));
const corrDir = (c: number) => (c > 0.05 ? tl("direta", "direct") : c < -0.05 ? tl("inversa", "inverse") : tl("neutra", "neutral"));
const clampPos = (c: number) => (Math.max(-1, Math.min(1, c)) + 1) / 2;

/** Medidor de correlação: −1 (inversa, vermelho) ↔ +1 (direta, verde). Marcador
 *  cheio = 30d; marcador fantasma = 90d (mostra se a relação fortaleceu/enfraqueceu). */
function CorrGauge({ corr }: { corr: CorrVal | null }) {
  const c30 = corr?.c30 ?? null;
  const c90 = corr?.c90 ?? null;
  const color = c30 == null ? "text-muted-foreground" : c30 > 0.05 ? "text-emerald-600 dark:text-emerald-400" : c30 < -0.05 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{tl("correlação", "correlation")}</span>
        <span className={`num text-xs font-semibold ${color}`}>
          {c30 == null ? tl("sem dado ainda", "no data yet") : `${fmtCorr(c30)} · ${corrStrength(c30)} ${corrDir(c30)}`}
          {c90 != null && <span className="ml-1 font-normal text-muted-foreground">· 90d {fmtCorr(c90)}</span>}
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
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-background"
          style={{ left: `${clampPos(c30 ?? 0) * 100}%` }}
          title={c30 == null ? "" : `30d ${fmtCorr(c30)}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{tl("inversa (−1)", "inverse (−1)")}</span>
        <span>0</span>
        <span>{tl("direta (+1)", "direct (+1)")}</span>
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
    if (btc >= 0.7) parts.push(tl(`segue de perto o Bitcoin (${fmtCorr(btc)}) — principal motor; quando o BTC anda, ${asset} vai junto`, `closely tracks Bitcoin (${fmtCorr(btc)}) — the main driver; when BTC moves, ${asset} follows`));
    else if (btc >= 0.4) parts.push(tl(`anda bastante com o Bitcoin (${fmtCorr(btc)})`, `moves a lot with Bitcoin (${fmtCorr(btc)})`));
    else parts.push(tl(`relativamente descolada do Bitcoin (${fmtCorr(btc)}) — movimento mais próprio`, `relatively decoupled from Bitcoin (${fmtCorr(btc)}) — more of its own move`));
  }

  const risk = ndx ?? spx;
  const riskName = ndx != null ? "Nasdaq" : "S&P 500";
  if (risk != null) {
    if (risk >= 0.4) parts.push(tl(`risco-on: acompanha a bolsa de tecnologia (${riskName} ${fmtCorr(risk)})`, `risk-on: tracks tech stocks (${riskName} ${fmtCorr(risk)})`));
    else if (risk <= -0.2) parts.push(tl(`inversa às ações (${riskName} ${fmtCorr(risk)})`, `inverse to equities (${riskName} ${fmtCorr(risk)})`));
  }
  if (dxy != null && dxy <= -0.3) parts.push(tl(`tende a subir quando o dólar cai (DXY ${fmtCorr(dxy)})`, `tends to rise when the dollar falls (DXY ${fmtCorr(dxy)})`));
  if (vix != null) {
    if (vix <= -0.3) parts.push(tl(`cai quando o medo aumenta (VIX ${fmtCorr(vix)})`, `falls when fear rises (VIX ${fmtCorr(vix)})`));
    else if (vix >= 0.3) parts.push(tl(`sobe junto com o VIX (${fmtCorr(vix)}), o que é incomum`, `rises alongside the VIX (${fmtCorr(vix)}), which is unusual`));
  }
  const jpy = corr["USDJPY"]?.c30;
  if (jpy != null) {
    if (jpy >= 0.3) parts.push(tl(`risco-on com o iene fraco (USD/JPY ${fmtCorr(jpy)})`, `risk-on with a weak yen (USD/JPY ${fmtCorr(jpy)})`));
    else if (jpy <= -0.3) parts.push(tl(`sobe quando o iene fortalece (USD/JPY ${fmtCorr(jpy)})`, `rises when the yen strengthens (USD/JPY ${fmtCorr(jpy)})`));
  }

  if (!parts.length) return null;
  return tl(
    `${asset}: ${parts.join("; ")}. Em dias de CPI/FOMC o macro costuma dominar — veja o calendário.`,
    `${asset}: ${parts.join("; ")}. On CPI/FOMC days macro usually dominates — check the calendar.`,
  );
}

function countdown(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const days = Math.round((a - today) / 86400000);
  if (days < 0) return "";
  if (days === 0) return tl("hoje", "today");
  if (days === 1) return tl("amanhã", "tomorrow");
  return tl(`em ${days} dias`, `in ${days} days`);
}

function fmtEvtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Calendário: bandeira por moeda + estrelas por impacto (1=baixo, 2=médio, 3=alto).
const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", JPY: "🇯🇵", CNY: "🇨🇳", GBP: "🇬🇧" };
const impactStars = (impact: string) => (impact === "High" ? 3 : impact === "Medium" ? 2 : 1);
const impactLabel = (impact: string) => (impact === "High" ? tl("alto", "high") : impact === "Medium" ? tl("médio", "medium") : tl("baixo", "low"));

function Stars({ impact }: { impact: string }) {
  const n = impactStars(impact);
  const color = impact === "High" ? "text-rose-500" : "text-amber-500";
  return (
    <span className="shrink-0 tracking-tighter" title={`${tl("Impacto", "Impact")} ${impactLabel(impact)}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? color : "text-muted-foreground/30"}>★</span>
      ))}
    </span>
  );
}

// Explicação por referência (tooltip no ⓘ de cada card), bilíngue.
const MACRO_HELP_PT: Record<string, string> = {
  BTC: "Bitcoin é o principal motor das altcoins. Correlação alta (+) = a moeda segue o BTC; baixa = anda mais por conta própria.",
  DXY: "Índice do dólar (força do dólar). Cripto costuma ser inversa: quando o dólar cai (−), a cripto tende a subir.",
  SPX: "S&P 500 — as 500 maiores empresas dos EUA, termômetro de risco. Correlação alta (+) = a moeda anda como ativo de risco (risco-on).",
  NASDAQ: "Nasdaq — bolsa de tecnologia, o ativo tradicional mais parecido com cripto. Correlação alta (+) = perfil risco-on/tech.",
  GOLD: "Ouro — reserva de valor clássica. Correlação direta (+) sugere a moeda sendo tratada como 'ouro digital' / proteção.",
  US10Y: "Juro de 10 anos dos EUA (custo do dinheiro). Juros subindo pressionam ativos de risco — correlação inversa (−) é comum.",
  VIX: "VIX — índice do medo do mercado. Correlação inversa forte (−) = a moeda cai quando o pânico aumenta.",
  USDJPY: "USD/JPY (iene). Sobe quando o iene enfraquece — 'carry trade' ligado, risco-on; quedas bruscas costumam vir com risco-off global.",
  NIKKEI: "Nikkei 225 — bolsa do Japão. Termômetro da sessão asiática; correlação alta (+) = perfil risco-on.",
  HSI: "Hang Seng — bolsa de Hong Kong. Sensível à China e ao PBOC; correlação alta (+) = risco-on asiático.",
  DAX: "DAX — bolsa da Alemanha. Termômetro de risco europeu; correlação alta (+) = risco-on.",
  EURUSD: "EUR/USD — euro vs dólar. Sobe quando o dólar cai; correlação direta (+) com cripto é comum (inverso do DXY).",
};
const MACRO_HELP_EN: Record<string, string> = {
  BTC: "Bitcoin is the main driver of altcoins. High (+) correlation = the coin follows BTC; low = it moves more on its own.",
  DXY: "Dollar index (the dollar's strength). Crypto is usually inverse: when the dollar falls (−), crypto tends to rise.",
  SPX: "S&P 500 — the 500 largest US companies, a risk gauge. High (+) correlation = the coin trades as a risk asset (risk-on).",
  NASDAQ: "Nasdaq — the tech exchange, the traditional asset most like crypto. High (+) correlation = a risk-on/tech profile.",
  GOLD: "Gold — a classic store of value. Direct (+) correlation suggests the coin being treated as 'digital gold' / a hedge.",
  US10Y: "US 10-year yield (the cost of money). Rising rates pressure risk assets — an inverse (−) correlation is common.",
  VIX: "VIX — the market's fear index. A strong inverse (−) correlation = the coin falls when panic rises.",
  USDJPY: "USD/JPY (the yen). Rises when the yen weakens — 'carry trade' on, risk-on; sharp drops often come with global risk-off.",
  NIKKEI: "Nikkei 225 — Japan's exchange. A gauge of the Asian session; high (+) correlation = a risk-on profile.",
  HSI: "Hang Seng — Hong Kong's exchange. Sensitive to China and the PBOC; high (+) correlation = Asian risk-on.",
  DAX: "DAX — Germany's exchange. A European risk gauge; high (+) correlation = risk-on.",
  EURUSD: "EUR/USD — euro vs. dollar. Rises when the dollar falls; a direct (+) correlation with crypto is common (inverse of DXY).",
};
const macroHelp = (symbol: string): string => (getLocale() === "en" ? MACRO_HELP_EN : MACRO_HELP_PT)[symbol] ?? "";


const KEY_FREE = ["NASDAQ", "DXY", "VIX", "USDJPY"]; // "vento macro" no Free: risco, dólar, medo, carry (iene)

/** Camada institucional do Macro — vitrine de upgrade para o Free. */
function MacroUpgradeCard() {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>🔒</span>
        <h3 className="text-sm font-semibold text-foreground">{tl("Camada institucional · Pro", "Institutional layer · Pro")}</h3>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <li className="flex gap-2"><span className="text-primary">›</span><span><strong className="text-foreground">{tl("Liquidez & Direção (DeFi)", "Liquidity & Direction (DeFi)")}</strong>{tl(" — stablecoins (dry powder), volume DEX e fees", " — stablecoins (dry powder), DEX volume, and fees")}</span></li>
        <li className="flex gap-2"><span className="text-primary">›</span><span><strong className="text-foreground">{tl("Posicionamento institucional", "Institutional positioning")}</strong>{tl(" — CME/CFTC (asset managers × hedge funds)", " — CME/CFTC (asset managers vs. hedge funds)")}</span></li>
        <li className="flex gap-2"><span className="text-primary">›</span><span><strong className="text-foreground">{tl("Matriz completa de correlações", "Full correlation matrix")}</strong>{tl(" — S&P 500, Ouro, Treasury 10a e mais", " — S&P 500, Gold, 10Y Treasury, and more")}</span></li>
      </ul>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {tl("Desbloquear no Pro →", "Unlock with Pro →")}
      </Link>
    </div>
  );
}

/** Aba "Macro & Correlações" (PRD §8.7 / §8.8.3). Versão leve liberada no Free
 *  (síntese + 3 correlações-chave + calendário); camada institucional só no Pro. */
export default function MacroTab({ asset, pro }: { asset: string; pro: boolean }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const [macro, setMacro] = useState<MacroAssetRow[]>([]);
  const [corr, setCorr] = useState<Record<string, CorrVal>>({});
  const [events, setEvents] = useState<EconEvent[] | null>(null);
  const [liquidity, setLiquidity] = useState<MarketLiquidityData | null>(null);
  const [liqTs, setLiqTs] = useState<string | null>(null);
  const [macroRow, setMacroRow] = useState<MacroData | null>(null);
  const [cot, setCot] = useState<CotRow | null>(null);

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

    // Pano de fundo do mercado (market-wide + posicionamento institucional CME)
    supabase
      .from("market_liquidity")
      .select("*")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setLiquidity((data as MarketLiquidityData) ?? null);
        setLiqTs((data as { ts?: string } | null)?.ts ?? null);
      });

    supabase
      .from("macro")
      .select("btc_dominance, total_mcap")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setMacroRow((data as MacroData) ?? null);
      });

    if (asset === "BTC" || asset === "ETH") {
      supabase
        .from("cot_positioning")
        .select("*")
        .eq("asset", asset)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (active) setCot((data as CotRow) ?? null);
        });
    } else {
      setCot(null);
    }

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
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-6 text-sm text-muted-foreground">
        {tt("Dados macro indisponíveis — aguardando coleta (a cada 30 min).", "Macro data unavailable — waiting for collection (every 30 min).")}
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
  const visibleMacro = pro ? sortedMacro : sortedMacro.filter((m) => KEY_FREE.includes(m.symbol));

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">{tt("Macro & Correlações", "Macro & Correlations")} · {asset}</h2>

      {synthesis && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
          <span className="mr-2">🧭</span>
          {synthesis}
        </div>
      )}

      {/* Medo & Ganância (histórico + overlay de preço) — sentimento do mercado, livre p/ todos */}
      <FearGreedHistoryPanel />

      {/* Maré de liquidez macro (FRED): net liquidity do Fed + condições financeiras — Pro */}
      {pro && <MacroGlobalPanel />}

      {/* On-chain valuation (MVRV-Z, SOPR, NUPL, Puell) + posição no ciclo — bitcoin-data.com (grátis), Pro */}
      {pro && <OnchainPanel />}

      {/* Pano de fundo do mercado: liquidez/direção (DeFi) + posicionamento institucional CME — Pro */}
      {pro && (liquidity || cot) && (
        <div className="space-y-3">
          {liquidity && <LiquidityDirectionPanel liquidity={liquidity} macro={macroRow} updatedAt={liqTs} />}
          {cot && <CotCard cot={cot} />}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Card de referência cripto: correlação com o BTC (o maior driver das alts) */}
        {showBtc && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">₿ Bitcoin <InfoTip text={macroHelp("BTC")} /></span>
              <span className="text-xs text-amber-500/80">{tt("referência cripto", "crypto benchmark")}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{tt("o maior motor das altcoins", "the biggest driver of altcoins")}</div>
            <CorrGauge corr={corr["BTC"] ?? null} />
          </div>
        )}

        {visibleMacro.map((m) => (
          <div key={m.symbol} className="rounded-2xl border border-border bg-card dark:bg-card/60 p-4">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {m.name} <InfoTip text={macroHelp(m.symbol)} />
              </span>
              <span className="num text-xs text-muted-foreground">
                {m.price ?? "—"}
                {m.symbol === "US10Y" ? "%" : ""}
              </span>
            </div>
            <div className="num mt-0.5 text-xs text-muted-foreground">
              7d {fmtPct((m.change_7d ?? 0) * 100, 1)} · 24h {fmtPct((m.change_24h ?? 0) * 100, 1)}
            </div>
            <CorrGauge corr={corr[m.symbol] ?? null} />
          </div>
        ))}
      </div>

      {!pro && <MacroUpgradeCard />}

      {/* Como ler este painel */}
      <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-4 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground">{tt("Como ler este painel", "How to read this panel")}</div>
        <ul className="mt-2 space-y-1.5">
          <li>
            • <strong>{tt("Correlação", "Correlation")}</strong> {tt("vai de", "ranges from")} <span className="text-rose-600 dark:text-rose-400">{tt("−1 (anda ao contrário)", "−1 (moves opposite)")}</span> {tt("a", "to")}{" "}
            <span className="text-emerald-600 dark:text-emerald-400">{tt("+1 (anda junto)", "+1 (moves together)")}</span>; {tt("quanto maior o valor (em módulo), mais forte a relação.", "the larger the absolute value, the stronger the relationship.")}
          </li>
          <li>
            • {tt("Marcador", "Marker")} <strong>{tt("cheio = 30 dias", "filled = 30 days")}</strong> ({tt("recente", "recent")}); <strong>{tt("fantasma = 90 dias", "ghost = 90 days")}</strong>. {tt("Se o de 30d está mais à direita que o de 90d, a relação está ", "If the 30d marker is further right than the 90d one, the relationship is ")}<strong>{tt("fortalecendo", "strengthening")}</strong>.
          </li>
          <li>
            • <strong>{tt("Vento macro:", "Macro wind:")}</strong> {tt("seguir Nasdaq/S&P =", "tracking Nasdaq/S&P =")} <span className="text-emerald-600 dark:text-emerald-400">risk-on</span> · {tt("inversa ao VIX = sensível ao", "inverse to VIX = sensitive to")} <span className="text-rose-600 dark:text-rose-400">{tt("medo", "fear")}</span> · {tt("inversa ao DXY = sensível ao dólar · alts seguem o ₿ BTC.", "inverse to DXY = sensitive to the dollar · alts follow ₿ BTC.")}
          </li>
          <li>• {tt("Passe o mouse no", "Hover the")} <span className="cursor-help text-foreground">ⓘ</span> {tt("de cada card para entender o que ele significa.", "on each card to learn what it means.")}</li>
        </ul>
      </div>

      {/* Calendário econômico */}
      <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">{tt("Calendário econômico (global)", "Economic calendar (global)")}</h3>
          <span className="text-[11px] text-muted-foreground">{tt("eventos que mexem com o macro", "events that move the macro")}</span>
        </div>
        {events == null && <p className="mt-3 text-xs text-muted-foreground">{tt("Carregando…", "Loading…")}</p>}
        {events && events.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{tt("Sem eventos de alto/médio impacto nos próximos dias.", "No high/medium-impact events in the coming days.")}</p>
        )}
        <div className="mt-3 space-y-2">
          {events?.map((e, i) => {
            const cd = countdown(e.date);
            return (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-sm leading-none" title={e.country} aria-hidden>{FLAG[e.country] ?? "🏳"}</span>
                  <Stars impact={e.impact} />
                  <span className="truncate text-foreground">{e.title}</span>
                  {cd && (
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${cd === "hoje" || cd === "today" ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-border text-muted-foreground"}`}>
                      {cd}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  {(e.forecast || e.previous) && (
                    <span className="num hidden md:inline">
                      {tt("ant.", "prev.")} {e.previous ?? "—"} · {tt("est.", "fcst.")} {e.forecast ?? "—"}
                    </span>
                  )}
                  <span className="num whitespace-nowrap text-muted-foreground">{fmtEvtDate(e.date)}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {tt("Fonte: ForexFactory · EUA (alto/médio) + Japão, Euro e China (alto). ★★★ alto · ★★ médio.", "Source: ForexFactory · US (high/medium) + Japan, Euro, and China (high). ★★★ high · ★★ medium.")}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {tt(
          `Correlação de Pearson dos retornos diários entre ${asset} e cada referência (marcador cheio = 30d, fantasma = 90d). Cotações via Yahoo Finance.`,
          `Pearson correlation of daily returns between ${asset} and each benchmark (filled marker = 30d, ghost = 90d). Quotes via Yahoo Finance.`,
        )}
      </p>
    </section>
  );
}
