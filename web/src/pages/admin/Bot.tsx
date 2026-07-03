import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UTCTimestamp } from "lightweight-charts";

import BotChart, { type BotCandle, type BotIndicatorLine, type BotMarker, type BotPriceLine } from "../../components/admin/BotChart";
import Markdown from "../../components/Markdown";
import { supabase } from "../../lib/supabase";

interface Config {
  enabled: boolean;
  venue: string;
  inst_id: string;
  base_ccy: string;
  quote_ccy: string;
  bar: string;
  ema_fast: number;
  ema_slow: number;
  order_quote_sz: number;
  buy_threshold: number;
  sell_threshold: number;
  leverage: number;
  mgn_mode: string;
  position: string;
  pos_base_sz: number;
  entry_px: number | null;
  pyramid: boolean;
  pyramid_max: number;
  min_votes: number;
  stop_pct: number;
  ct_stop_pct: number;
  counter_trend: string; // 'block' | 'tight'
  auto_weight: boolean;  // auto-ponderar sinais por moeda (usa o aprendizado)
  trail_on: boolean;     // stop móvel (trailing) ligado
  rev_mode?: string;     // reversão: off (nunca vira a mão) | imbalance (só FVG fresco) | any (antigo)
  ta_gate?: boolean;     // LEGADO (v16): filtro técnico — substituído pelo voto do grupo Técnico
  flow_veto?: number;    // LEGADO (v16): veto de fluxo — substituído pelo voto do grupo Fluxo
  conf_min?: number;     // motor v17: nº mínimo de grupos (de 4) votando na direção p/ executar
  target_on?: boolean;   // take-profit estrutural (alvo na liquidez); false = sai só por stop/trailing
  tp_partial?: boolean;  // no alvo, embolsa METADE e o resto corre no trailing (stop ≥ breakeven)
  block_hours?: number[] | null; // gate de sessão GLOBAL: horas UTC sem ENTRADAS novas (saídas normais)
  asset_overrides?: Record<string, { conf_min?: number; block_hours?: number[]; risk_mult?: number }>; // CADA MOEDA É ÚNICA: dose por ativo (sobrepõe o global)
  max_zone_atr?: number; // qualidade 1: entrada imbalance só a ≤ X ATR da borda do FVG (0 = off)
  opp_zone_atr?: number; // qualidade 2: bloqueia entrada com FVG/OB oposto fresco a ≤ X ATR à frente (0 = off)
  trail_pct: number;     // distância do trailing (%) — fallback quando não há ATR
  trail_atr_mult: number; // distância do trailing = k × ATR do ativo (adaptativo)
  stop_atr_on: boolean;  // stop de risco por ATR (senão, % fixo)
  stop_atr_mult: number; // distância do stop de risco = k × ATR do ativo
  risk_pct: number;      // % do patrimônio arriscado por trade (sizing por risco)
  daily_loss_pct: number; // circuit breaker: perda diária máx (%)
  max_positions: number;  // máx. posições simultâneas
  cooldown_min: number;   // cooldown pós-stop (min)
  imbalance_on: boolean;  // override: FVG novo → entra a favor
  imbalance_min_pct: number; // tamanho mínimo do FVG (% do preço); 0 = todo FVG
  signal_toggles: Record<string, boolean>; // sinais de fluxo ligados/desligados (ausente = ligado)
  last_bias: number | null;
  last_conviction: number | null;
  last_decision: string | null;
  last_run: string | null;
  last_reading: Reading | null;
}
interface ReadingSig {
  key: string;
  group: string;
  label: string;
  score: number;
  weight: number;
  note: string;
}
interface ConfGroup { key: string; label: string; score: number; vote: 1 | 0 | -1 }
interface Reading {
  bias: number;              // viés estrutural SMC do 15m (quem decide)
  conviction: number;        // legado: |bias| (fica no payload, não é mais exibido)
  signals: ReadingSig[];
  spot?: number;
  flowTilt?: number;         // placar do grupo Fluxo (limpo, v17)
  confluence?: ConfGroup[];  // motor v17: os 4 grupos (Estrutura/Fluxo/Técnico/Sentimento) e o voto de cada
  confMin?: number;          // grupos necessários p/ executar
  confVotes?: { for: number; against: number } | null; // votos na direção do setup deste ciclo
  setup?: string | null;     // gatilho SMC armado ("imbalance ↑", "OB/FVG + estrutura ↓"…)
  planStop?: number | null;  // stop estrutural do plano
  planTarget?: number | null;// alvo (próxima liquidez) do plano
  want?: string;             // alvo final após vetos (long/short/flat)
  position?: string;
  adds?: number;
  leverage?: number;
  gate?: string | null;      // por que segurou / nota do plano
  ts?: string;
  structure?: { smcBias?: number; setup?: string | null; planStop?: number | null; planTarget?: number | null; flowBias?: number; gammaRegime?: string; zone?: string | null; autoWeight?: { on: boolean; structWAdj?: number } } | null;
}
interface OrderRow {
  id: string;
  source: string;
  action: string | null;
  inst_id: string | null;
  side: string | null;
  ord_type: string | null;
  sz: string | null;
  avg_px: number | null;
  pnl: number | null;
  ok: boolean;
  result: { msg?: string; data?: { sMsg?: string; ordId?: string }[] } | null;
  note: string | null;
  created_at: string;
}
interface LogRow {
  id: number;
  level: string;
  message: string;
  created_at: string;
}
interface BotPosition {
  asset: string;
  inst_id: string | null;
  position: string;
  pos_base_sz: number;
  entry_px: number | null;
  adds: number | null;
  stop_px: number | null;
  ctrend: boolean | null;
  peak_px: number | null;
  target_px: number | null;
  last_bias: number | null;
  last_conviction: number | null;
  last_decision: string | null;
  last_reading: Reading | null;
}
interface LearningSig { key: string; label: string; weight: number; n: number; hitRate: number; edge: number }
interface LearnAssetStat { n: number; hitRate: number; perSignal?: LearningSig[]; ai_report?: string | null }
interface Learning {
  data: { window: string; labeled: number; overall: { n: number; hitRate: number }; byAsset: Record<string, LearnAssetStat>; perSignal: LearningSig[] } | null;
  ai_report: string | null;
  updated_at: string;
}
interface BtTrade { side: string; at: number; r: number; reason: string; counter?: boolean; bars: number }

const BARS = ["15m", "1H", "4H", "1D"];
// Sinais de FLUXO (opcionais) que o robô pode usar como confirmação — cada um liga/desliga (signal_toggles).
// O núcleo SMC price-action (OB/FVG/liquidez/EQH-EQL/zonas/BOS-CHoCH) é sempre usado, fora desta lista.
const FLOW_SIGNALS: { key: string; label: string }[] = [
  { key: "cvd_div", label: "Divergência CVD (inst × varejo)" },
  { key: "cvd", label: "CVD agregado" },
  { key: "book_inst", label: "Book institucional (Coinbase)" },
  { key: "book_retail", label: "Book varejo" },
  { key: "absorb", label: "Absorção (teste de parede)" },
  { key: "walls", label: "Paredes de baleia" },
  { key: "book_trend", label: "Pressão do book" },
  { key: "liqs", label: "Liquidações" },
  { key: "gamma", label: "Put/Call Wall" },
  { key: "gflow", label: "Fluxo de gamma (HIRO)" },
  { key: "funding", label: "Funding (contrário)" },
  { key: "ls_ratio", label: "Long/Short (contrário)" },
  { key: "feargreed", label: "Fear & Greed" },
];
const SIG_GROUPS = ["Estrutura por TF", "Estrutura", "Microestrutura", "Fluxo", "Sentimento", "Opções", "Técnico"];
// Papel REAL de cada sinal no MOTOR v17 (confluência — espelha o bot-run):
// decide = estrutura SMC 15m (arma o setup + vota no grupo Estrutura) · vota = compõe um dos 4
// grupos do placar (Fluxo limpo / Técnico / Sentimento) — a MAIORIA dos grupos libera a entrada ·
// medido = só alimenta o aprendizado (absorção/paredes/pressão/CVD/funding saíram do placar por hit-rate <50%).
const VOTE_GROUP: Record<string, string> = {
  book_inst: "Fluxo", book_retail: "Fluxo", cvd_div: "Fluxo", liqs: "Fluxo", gamma: "Fluxo", gflow: "Fluxo",
  ema2050: "Técnico", vwap: "Técnico",
  feargreed: "Sentimento", ls_ratio: "Sentimento",
};
const sigRole = (key: string): { tag: string; cls: string; title: string } =>
  key.startsWith("tf_")
    ? { tag: "decide", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title: "Estrutura SMC do 15m — arma o setup (entrada/stop/alvo estruturais) e vota como grupo Estrutura no placar de confluência" }
    : VOTE_GROUP[key]
    ? { tag: "vota", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400", title: `Compõe o grupo ${VOTE_GROUP[key]} do placar de confluência: a maioria dos grupos (padrão 3 de 4) precisa votar na direção do setup pra entrada executar` }
    : { tag: "medido", cls: "bg-muted text-muted-foreground", title: "Só medido — não influencia a decisão; alimenta o aprendizado por moeda (pode voltar ao placar se provar edge)" };
const decisionLabel = (d?: string | null) => (d === "long" || d === "buy" ? "Long" : d === "short" || d === "sell" ? "Short" : d === "flat" ? "Sair" : d === "preview" ? "Prévia" : d === "error" ? "Erro" : "Segurar");
const LOG_TONE: Record<string, string> = {
  trade: "bg-primary/15 text-primary",
  info: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

async function invoke(action: string, extra: Record<string, unknown> = {}, fn = "okx-bot") {
  const { data, error } = await supabase.functions.invoke(fn, { body: { action, ...extra } });
  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const b = await ctx.json().catch(() => null);
      if (b?.error) detail = b.error;
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  if (data?.code != null && data.code !== "0" && data.code !== 0) {
    const sMsg = (data?.data?.[0]?.sMsg ?? "").trim();
    throw new Error(sMsg || data?.msg || `Erro ${data.code}`);
  }
  return data;
}

const num = (v: unknown, d = 2) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));

/** Admin · Robô (Lab) — robô de trade PESSOAL no modo DEMO da OKX, isolado e admin-only.
 *  v2: estratégia automática (cruzamento de EMAs) compra/vende sozinha via cron, com
 *  gráfico (marcações de C/V), histórico de ordens e diário das decisões. */
export default function AdminBot() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [cfg, setCfg] = useState<Config | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [totalEq, setTotalEq] = useState<string | null>(null);
  const [candles, setCandles] = useState<BotCandle[]>([]);
  // Ordens SÓ pro gráfico: por moeda em foco + janela das velas (a lista `orders` da aba Ordens
  // é limit(30) misturando as 4 moedas → a entrada da posição atual some dos markers).
  const [chartOrders, setChartOrders] = useState<OrderRow[]>([]);
  const [positions, setPositions] = useState<BotPosition[]>([]);
  const [livePos, setLivePos] = useState<Record<string, { uPnl: number; markPx: number }>>({});
  const [pnlSummary, setPnlSummary] = useState<{ day: { pnl: number; trades: number; wins: number }; months: { month: string; pnl: number; trades: number; wins: number }[] } | null>(null);
  const [selMonth, setSelMonth] = useState(""); // mês escolhido no card "Saldo do mês" (vazio = mês vigente)
  const [learning, setLearning] = useState<Learning | null>(null);
  const [selAsset, setSelAsset] = useState("BTC"); // moeda em foco no painel (leitura + gráfico)
  const [tab, setTab] = useState<"grafico" | "ordens" | "aprendizado" | "config">("grafico"); // aba do módulo do robô
  // Backtester (aba Aprendizado): mede a expectância da estratégia em candles reais.
  const [btAsset, setBtAsset] = useState("BTC");
  const [btDays, setBtDays] = useState(30);
  const [btBusy, setBtBusy] = useState(false);
  const [btResult, setBtResult] = useState<{ params: Record<string, string | number>; metrics: Record<string, number>; trades?: BtTrade[]; equity?: number[] } | null>(null);
  // Busca também a amostra de trades e a curva de capital que o backtester SALVA no banco
  // (o retorno da function traz só params+metrics).
  const loadBt = useCallback(async (asset: string) => {
    const { data } = await supabase.from("bot_backtests").select("params, metrics, trades, equity").eq("asset", asset).maybeSingle();
    setBtResult(data ? { params: data.params as Record<string, string | number>, metrics: data.metrics as Record<string, number>, trades: (data.trades as BtTrade[] | null) ?? [], equity: (data.equity as number[] | null) ?? [] } : null);
  }, []);
  useEffect(() => { loadBt(btAsset); }, [btAsset, loadBt]);
  const runBacktest = async () => {
    setBtBusy(true);
    try {
      const { error } = await supabase.functions.invoke("bot-backtest", { body: { asset: btAsset, days: btDays } });
      if (error) throw error;
      await loadBt(btAsset); // relê do banco com trades+equity persistidos
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha no backtest." });
    } finally {
      setBtBusy(false);
    }
  };
  const [learnAsset, setLearnAsset] = useState("all"); // moeda em foco no aprendizado (all = geral)
  // filtros do Diário do robô (nível / moeda)
  const [dLevel, setDLevel] = useState("all"); // all | trade | info | warn | error
  const [dAssetF, setDAssetF] = useState("all");
  // filtros das ordens (moeda / status / origem / resultado / período)
  const [fAsset, setFAsset] = useState("all");
  const [fStatus, setFStatus] = useState("all"); // all | ok | erro
  const [fSource, setFSource] = useState("all"); // all | auto | manual
  const [fResult, setFResult] = useState("all"); // all | win | loss (só trades encerrados)
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  // conexão (chaves)
  const [showKeys, setShowKeys] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  // ordem manual
  const [showManual, setShowManual] = useState(false);
  const [mSide, setMSide] = useState<"buy" | "sell">("buy");
  const [mOrdType, setMOrdType] = useState<"market" | "limit">("market");
  const [mSz, setMSz] = useState("");
  const [mPx, setMPx] = useState("");

  const loadBase = useCallback(async () => {
    const [{ data: st }, { data: c }, { data: ord }, { data: lg }, { data: pos }, { data: lrn }] = await Promise.all([
      supabase.rpc("bot_config_status"),
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, note, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(60),
      supabase.from("bot_positions").select("asset, inst_id, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, target_px, last_bias, last_conviction, last_decision, last_reading").order("asset"),
      supabase.from("bot_learning").select("data, ai_report, updated_at").eq("id", 1).maybeSingle(),
    ]);
    const conf = (c as Config) ?? null;
    setConnected(conf?.venue === "binance" ? !!(st as { binance?: boolean })?.binance : !!(st as { okx?: boolean })?.okx);
    setCfg(conf);
    setOrders((ord as OrderRow[] | null) ?? []);
    setLogs((lg as LogRow[] | null) ?? []);
    setPositions((pos as BotPosition[] | null) ?? []);
    setLearning((lrn as Learning | null) ?? null);
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Atualização ao vivo: re-lê config (preservando os campos que o usuário edita), ordens e
  // diário — sem sobrescrever o que está sendo digitado na config.
  const loadLive = useCallback(async () => {
    const [{ data: c }, { data: ord }, { data: lg }, { data: pos }] = await Promise.all([
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, note, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(60),
      supabase.from("bot_positions").select("asset, inst_id, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, target_px, last_bias, last_conviction, last_decision, last_reading").order("asset"),
    ]);
    if (c) setCfg((prev) => (prev ? { ...(c as Config), inst_id: prev.inst_id, base_ccy: prev.base_ccy, quote_ccy: prev.quote_ccy, bar: prev.bar, order_quote_sz: prev.order_quote_sz, leverage: prev.leverage, buy_threshold: prev.buy_threshold, sell_threshold: prev.sell_threshold, pyramid: prev.pyramid, pyramid_max: prev.pyramid_max, min_votes: prev.min_votes, stop_pct: prev.stop_pct, ct_stop_pct: prev.ct_stop_pct, counter_trend: prev.counter_trend, auto_weight: prev.auto_weight, trail_on: prev.trail_on, trail_pct: prev.trail_pct, trail_atr_mult: prev.trail_atr_mult, rev_mode: prev.rev_mode, ta_gate: prev.ta_gate, flow_veto: prev.flow_veto } : (c as Config)));
    setOrders((ord as OrderRow[] | null) ?? []);
    setLogs((lg as LogRow[] | null) ?? []);
    setPositions((pos as BotPosition[] | null) ?? []);
  }, []);

  // Guarda contra respostas obsoletas: cada chamada ganha um token; só a MAIS RECENTE
  // aplica o resultado. Sem isso, ao trocar de ativo/TF (ou com o poll + rede lenta) a
  // resposta que chega por último vence — mesmo sendo de outro ativo (velas do BTC sob BNB).
  const chartReqRef = useRef(0);
  const loadChart = useCallback(async (instId: string, bar: string, venue: string) => {
    const token = ++chartReqRef.current;
    try {
      const r = await invoke("candles", { instId, bar, limit: 200 }, venue === "binance" ? "binance-bot" : "okx-bot");
      if (token !== chartReqRef.current) return; // trocou de ativo/TF em voo → descarta
      const rows = ((r?.data ?? []) as string[][]).slice().reverse();
      const cs: BotCandle[] = rows.map((x) => ({ time: Math.floor(Number(x[0]) / 1000) as UTCTimestamp, open: +x[1], high: +x[2], low: +x[3], close: +x[4], volume: +x[5] || 0 }));
      setCandles(cs);
      // Ordens da moeda em foco dentro da janela do gráfico (a lista geral limit(30) não cobre).
      if (cs.length) {
        const sinceIso = new Date(cs[0].time * 1000).toISOString();
        const { data: ord } = await supabase
          .from("bot_orders")
          .select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, created_at")
          .eq("inst_id", instId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true })
          .limit(300);
        if (token !== chartReqRef.current) return; // trocou em voo → descarta
        setChartOrders((ord as OrderRow[] | null) ?? []);
      } else {
        setChartOrders([]);
      }
    } catch {
      if (token === chartReqRef.current) { setCandles([]); setChartOrders([]); }
    }
  }, []);

  // inst_id da moeda em foco (multi-ativo): no binance é ATIVO+quote; fallback ao inst_id do config.
  const selInst = cfg?.venue === "binance" ? `${selAsset}${cfg?.quote_ccy ?? "USDT"}` : (cfg?.inst_id ?? `${selAsset}USDT`);

  // Carrega o gráfico da moeda/TF em foco e reatualiza sozinho a cada 20s (o refresh vivo
  // não passa mais por aqui — evita o poll fixar um selInst obsoleto e sobrescrever o ativo).
  // Limpa na hora ao trocar: nunca mostra as velas do ativo anterior sob o header novo.
  useEffect(() => {
    if (!cfg || !connected) return;
    setCandles([]);
    setChartOrders([]);
    loadChart(selInst, cfg.bar, cfg.venue);
    const id = setInterval(() => loadChart(selInst, cfg.bar, cfg.venue), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selInst, cfg?.bar, cfg?.venue, connected, loadChart]);

  // PnL ao vivo de TODAS as moedas (multi-ativo): 1 call traz todas as posições da Binance.
  useEffect(() => {
    if (!connected || cfg?.venue !== "binance") { setLivePos({}); return; }
    let active = true;
    const poll = async () => {
      try {
        const r = await invoke("positions", {}, "binance-bot");
        const arr = (r?.data as { symbol?: string; unRealizedProfit?: string; markPrice?: string; positionAmt?: string }[]) ?? [];
        const map: Record<string, { uPnl: number; markPx: number }> = {};
        for (const p of arr) { if (p.symbol && Math.abs(Number(p.positionAmt)) > 0) map[p.symbol] = { uPnl: Number(p.unRealizedProfit), markPx: Number(p.markPrice) || 0 }; }
        if (active) setLivePos(map);
      } catch { /* ignora */ }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { active = false; clearInterval(id); };
  }, [connected, cfg?.venue]);

  // Painel ao vivo: patrimônio + gráfico + leitura/posição/ordens/diário a cada 20s (silencioso).
  useEffect(() => {
    if (!connected || !cfg) return;
    const venueFn = cfg.venue === "binance" ? "binance-bot" : "okx-bot";
    let active = true;
    const tick = async () => {
      try {
        const bal = await invoke("balance", {}, venueFn);
        if (active) setTotalEq(bal?.data?.[0]?.totalEq ?? null);
      } catch { /* silencioso */ }
      if (!active) return;
      await loadLive(); // o gráfico se atualiza sozinho no efeito dedicado (nada de selInst obsoleto aqui)
      try { const { data: sum } = await supabase.rpc("bot_pnl_summary"); if (active && sum) setPnlSummary(sum as { day: { pnl: number; trades: number; wins: number }; months: { month: string; pnl: number; trades: number; wins: number }[] }); } catch { /* silencioso */ }
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => { active = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cfg?.inst_id, cfg?.venue, loadLive]);

  async function refresh() {
    if (!connected || !cfg) return;
    setBusy("refresh");
    setMsg(null);
    try {
      const bal = await invoke("balance", {}, cfg.venue === "binance" ? "binance-bot" : "okx-bot");
      setTotalEq(bal?.data?.[0]?.totalEq ?? null);
      if (cfg) await loadChart(selInst, cfg.bar, cfg.venue);
      await loadBase();
      setMsg({ kind: "ok", text: "Atualizado." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  async function saveKeys() {
    setBusy("keys");
    setMsg(null);
    try {
      const save = async (k: string, v: string) => {
        if (!v.trim()) return;
        const { error } = await supabase.rpc("set_bot_secret", { p_key: k, p_value: v.trim() });
        if (error) throw new Error(error.message);
      };
      if (cfg?.venue === "binance") {
        await save("binance_test_key", apiKey);
        await save("binance_test_secret", apiSecret);
      } else {
        await save("okx_api_key", apiKey);
        await save("okx_api_secret", apiSecret);
        await save("okx_api_passphrase", passphrase);
      }
      setApiKey(""); setApiSecret(""); setPassphrase("");
      setMsg({ kind: "ok", text: cfg?.venue === "binance" ? "Chaves da Binance testnet salvas." : "Chaves da OKX demo salvas." });
      await loadBase();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig(patch: Partial<Config>) {
    if (!cfg) return;
    setBusy("cfg");
    setMsg(null);
    try {
      const { error } = await supabase.rpc("bot_set_config", { p: patch });
      if (error) throw new Error(error.message);
      setCfg({ ...cfg, ...patch });
      setMsg({ kind: "ok", text: "Config salva." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  async function toggleBot() {
    if (!cfg) return;
    await saveConfig({ enabled: !cfg.enabled });
  }

  async function runNow() {
    setBusy("run");
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("bot-run", { body: { force: true } });
      if (error) throw new Error(error.message);
      const d = data?.decision as string | undefined;
      const map: Record<string, string> = { long: "abriu LONG", short: "abriu SHORT", flat: "saiu (fechou)", buy: "comprou", sell: "vendeu", hold: "segurou (sem ação)", preview: "prévia (sem operar)", error: `erro: ${data?.error ?? ""}` };
      const label = (d && map[d]) ?? (data?.skipped ?? "executado");
      setMsg({ kind: "ok", text: `Robô rodou: ${label}.` });
      await loadBase();
      if (cfg) await loadChart(selInst, cfg.bar, cfg.venue);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao rodar." });
    } finally {
      setBusy(null);
    }
  }

  async function runLearn() {
    setBusy("learn");
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("bot-learn", { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setMsg({ kind: "ok", text: `Diagnóstico atualizado (${data?.labeled ?? 0} leituras avaliadas).` });
      await loadBase();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao aprender." });
    } finally {
      setBusy(null);
    }
  }

  async function placeManual() {
    if (!cfg || !mSz.trim()) { setMsg({ kind: "err", text: "Informe o tamanho." }); return; }
    setBusy("manual");
    setMsg(null);
    try {
      const fut = cfg.venue === "binance" || cfg.inst_id.toUpperCase().endsWith("-SWAP");
      const sizing = fut ? { quoteSz: mSz.trim() } : { tdMode: "cash", sz: mSz.trim() };
      await invoke("order", { instId: cfg.inst_id, side: mSide, ordType: mOrdType, ...sizing, px: mOrdType === "limit" ? mPx.trim() : undefined }, cfg.venue === "binance" ? "binance-bot" : "okx-bot");
      setMsg({ kind: "ok", text: "Ordem manual enviada (demo)." });
      setMSz(""); setMPx("");
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  // Fecha a posição de UMA moeda a mercado (demo) — botão por card em "Posições abertas".
  async function closeAsset(asset: string, instId: string | null) {
    if (!cfg) return;
    if (!window.confirm(`Fechar a posição de ${asset} a mercado agora? (demo)`)) return;
    setBusy("close" + asset);
    setMsg(null);
    try {
      const fn = cfg.venue === "binance" ? "binance-bot" : "okx-bot";
      const r = await invoke("close", { symbol: instId ?? `${asset}USDT` }, fn);
      if (r?.closed === false) setMsg({ kind: "ok", text: `${asset}: não havia posição aberta.` });
      else setMsg({ kind: "ok", text: `Posição de ${asset} fechada${r?.pnl != null ? ` · PnL ${num(r.pnl)} ${cfg.quote_ccy}` : ""}.` });
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao fechar." });
    } finally {
      setBusy(null);
    }
  }

  // "Excluir" agora CANCELA o trade: se o ativo da ordem tem posição aberta, fecha a mercado;
  // se for ordem pendente (limit), cancela; depois remove o registro. Vale p/ manual e robô.
  async function deleteOrder(o: OrderRow) {
    const asset = o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : null;
    const p = positions.find((x) => x.asset === asset);
    const hasPos = !!p && p.position !== "flat";
    const isLimit = o.ord_type === "limit" && !!o.result?.data?.[0]?.ordId;
    // Ordem que FALHOU (erro) não executou nada na corretora → só remove do histórico, nunca fecha posição.
    const failed = !o.ok;
    const confirmMsg = failed
      ? "Remover esta ordem com erro do histórico? (ela não executou na corretora, não afeta a posição)"
      : isLimit
        ? "Cancelar esta ordem pendente e removê-la do histórico?"
        : hasPos
          ? `Fechar a posição de ${asset} (${p!.position === "long" ? "long" : "short"}) a mercado e remover esta ordem? (demo)`
          : "Remover esta ordem do histórico? (não afeta a corretora)";
    if (!window.confirm(confirmMsg)) return;
    setBusy("row" + o.id);
    setMsg(null);
    try {
      const fn = cfg?.venue === "binance" ? "binance-bot" : "okx-bot";
      if (!failed) {
        if (isLimit) {
          await invoke("cancel", { instId: o.inst_id, ordId: o.result!.data![0].ordId }, fn);
        } else if (hasPos) {
          const r = await invoke("close", { symbol: o.inst_id }, fn);
          setMsg({ kind: "ok", text: r?.closed === false ? "Não havia posição aberta." : `Posição de ${asset} fechada${r?.pnl != null ? ` · PnL ${num(r.pnl)} ${cfg?.quote_ccy}` : ""}.` });
        }
      }
      const { error } = await supabase.rpc("bot_delete_order", { p_id: o.id });
      if (error) throw new Error(error.message);
      if (failed) setMsg({ kind: "ok", text: "Ordem com erro removida do histórico." });
      await loadBase();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao cancelar/excluir." });
    } finally {
      setBusy(null);
    }
  }

  async function cancelOrder(o: OrderRow) {
    const ordId = o.result?.data?.[0]?.ordId;
    if (!ordId || !o.inst_id) return;
    setBusy("row" + o.id);
    setMsg(null);
    try {
      await invoke("cancel", { instId: o.inst_id, ordId }, cfg?.venue === "binance" ? "binance-bot" : "okx-bot");
      setMsg({ kind: "ok", text: "Ordem cancelada na OKX." });
      await loadBase();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao cancelar." });
    } finally {
      setBusy(null);
    }
  }

  // Marcadores no gráfico (alinhados à vela que contém a ordem): entrada C/V, pirâmide "+" e SAÍDA.
  const markers = useMemo<BotMarker[]>(() => {
    if (!candles.length) return [];
    const times = candles.map((c) => c.time);
    return chartOrders
      .filter((o) => o.ok && o.side && o.inst_id === selInst)
      .map((o) => {
        const t = Math.floor(new Date(o.created_at).getTime() / 1000);
        let bar = times[0];
        for (const tt of times) { if (tt <= t) bar = tt; else break; }
        const kind: BotMarker["kind"] = o.action === "close" ? "exit" : o.action === "add" ? "add" : "entry";
        const text = kind === "exit" ? "Saída" : kind === "add" ? "+" : o.side === "buy" ? "C" : "V";
        return { time: bar as UTCTimestamp, side: o.side as "buy" | "sell", kind, text };
      });
  }, [chartOrders, candles, selInst]);

  // Indicadores clássicos plotados sobre as velas — MESMA matemática que o bot-run mede
  // (EMA 20/50, VWAP diário ancorado em 00:00 UTC, ADX/DMI 14 p/ o chip lateral × tendência).
  const indicators = useMemo(() => {
    const none = { lines: [] as BotIndicatorLine[], adx: null as { adx: number; dir: number } | null };
    if (candles.length < 30) return none;
    const ema = (len: number) => {
      const k = 2 / (len + 1);
      let e = 0;
      const out: { time: UTCTimestamp; value: number }[] = [];
      candles.forEach((c, i) => {
        if (i < len) { e += c.close / len; if (i === len - 1) out.push({ time: c.time, value: e }); return; }
        e = c.close * k + e * (1 - k);
        out.push({ time: c.time, value: e });
      });
      return out;
    };
    const vwap: { time: UTCTimestamp; value: number }[] = [];
    let day = -1, pv = 0, vv = 0;
    for (const c of candles) {
      const d = Math.floor(c.time / 86400);
      if (d !== day) { day = d; pv = 0; vv = 0; } // âncora reinicia a cada dia UTC (o degrau na virada é esperado)
      const v = c.volume ?? 0;
      if (v > 0) { pv += ((c.high + c.low + c.close) / 3) * v; vv += v; }
      if (vv > 0) vwap.push({ time: c.time, value: pv / vv });
    }
    let adx: { adx: number; dir: number } | null = null;
    const len = 14;
    if (candles.length >= len * 3) {
      let trS = 0, pS = 0, mS = 0, a = 0, dxN = 0;
      for (let i = 1; i < candles.length; i++) {
        const up = candles[i].high - candles[i - 1].high, dn = candles[i - 1].low - candles[i].low;
        const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
        const tr = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
        if (i <= len) { trS += tr; pS += pdm; mS += mdm; if (i < len) continue; }
        else { trS += tr - trS / len; pS += pdm - pS / len; mS += mdm - mS / len; }
        const diP = trS > 0 ? (100 * pS) / trS : 0, diM = trS > 0 ? (100 * mS) / trS : 0;
        const dx = diP + diM > 0 ? (100 * Math.abs(diP - diM)) / (diP + diM) : 0;
        dxN++;
        a = dxN === 1 ? dx : (a * (len - 1) + dx) / len;
        if (i === candles.length - 1) adx = { adx: a, dir: diP > diM ? 1 : diP < diM ? -1 : 0 };
      }
    }
    const lines: BotIndicatorLine[] = [
      { id: "ema20", title: "EMA 20", color: "#f59e0b", data: ema(20) },
      { id: "ema50", title: "EMA 50", color: "#8b5cf6", data: ema(50) },
    ];
    if (cfg?.bar !== "1D" && vwap.length) lines.push({ id: "vwap", title: "VWAP", color: "#22d3ee", dashed: true, width: 2, data: vwap }); // VWAP diário não faz sentido em vela diária
    return { lines, adx };
  }, [candles, cfg?.bar]);

  // Leitura da moeda em foco (cada ativo tem a sua em bot_positions); fallback ao config (BTC legado).
  const selPos = positions.find((p) => p.asset === selAsset) ?? null;
  const selReading: Reading | null = (selPos?.last_reading as Reading | null) ?? (selAsset === "BTC" ? cfg?.last_reading ?? null : null);
  const ASSET_LIST = positions.length ? positions.map((p) => p.asset) : ["BTC"];

  const lastPx = candles.length ? candles[candles.length - 1].close : 0;
  const dec = lastPx >= 1000 ? 1 : lastPx >= 1 ? 2 : 6;
  const isBinance = cfg?.venue === "binance";
  const isFut = isBinance || (!!cfg?.inst_id && cfg.inst_id.toUpperCase().endsWith("-SWAP"));
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";
  const quote = cfg?.quote_ccy ?? "USDT";
  const pxDec = (v: number | null | undefined) => (v == null ? 2 : v >= 1000 ? 1 : v >= 1 ? 2 : 4);

  // Linhas de nível da posição aberta da moeda em foco: Entrada, Pico e 🛑 Stop (sobe c/ o trailing).
  const priceLines: BotPriceLine[] = [];
  if (selPos && selPos.position !== "flat") {
    if (selPos.entry_px) priceLines.push({ price: selPos.entry_px, color: "#94a3b8", title: "Entrada", dashed: true });
    if (selPos.peak_px && selPos.peak_px !== selPos.entry_px) priceLines.push({ price: selPos.peak_px, color: "#10b981", title: "Pico", dashed: true });
    if (selPos.stop_px) priceLines.push({ price: selPos.stop_px, color: "#f43f5e", title: cfg?.trail_on ? "🛑 Stop móvel" : "🛑 Stop" });
    if (selPos.target_px) priceLines.push({ price: selPos.target_px, color: "#eab308", title: "🎯 Alvo (liquidez)", dashed: true });
  }

  // Posições ABERTAS agora (net por ativo) + as que estão fora do mercado.
  const openPositions = positions.filter((p) => p.position !== "flat");
  const flatAssets = positions.filter((p) => p.position === "flat").map((p) => p.asset);
  // PnL ao vivo somado (só das posições que a Binance devolveu).
  const openPnl = openPositions.reduce((s, p) => { const l = p.inst_id ? livePos[p.inst_id] : undefined; return l ? s + l.uPnl : s; }, 0);
  const hasLivePnl = openPositions.some((p) => p.inst_id && livePos[p.inst_id]);

  // TRADES ENCERRADOS: cada ordem de fechamento (action='close', ok) é um round-trip fechado.
  // O PnL realizado já vem salvo; a entrada média é reconstruída: entry = saída − PnL/(tam·direção).
  // Quando o fill não voltou (demo atrasa e salva sem preço/PnL), PAREIA com as aberturas do CICLO
  // (mesma moeda, entre o fechamento anterior e este) → recupera entrada, duração e PnL estimado (≈).
  // O motivo do fechamento vem da nota da ordem (stop / alvo / trailing / manual / reversão).
  const tms = (iso: string) => new Date(iso).getTime();
  const closedTrades = orders
    .filter((o) => o.action === "close" && o.ok)
    .map((o) => {
      const asset = o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "—";
      const wasLong = o.side === "sell"; // fechou LONG vendendo; SHORT comprando
      const dir = wasLong ? 1 : -1;
      let exit = o.avg_px != null ? Number(o.avg_px) : null;
      const sz = o.sz != null && o.sz !== "" ? Number(o.sz) : null;
      let pnl = o.pnl != null ? Number(o.pnl) : null;
      // Aberturas do ciclo: mesma moeda, depois do close anterior e antes deste, no lado da posição.
      const prevCloseT = orders.reduce((m, x) => (x.inst_id === o.inst_id && x.action === "close" && x.ok && tms(x.created_at) < tms(o.created_at) && tms(x.created_at) > m ? tms(x.created_at) : m), 0);
      const cycleOpens = orders
        .filter((x) => x.inst_id === o.inst_id && x.ok && x.action !== "close" && x.side !== o.side && tms(x.created_at) < tms(o.created_at) && tms(x.created_at) > prevCloseT)
        .sort((a, b) => tms(a.created_at) - tms(b.created_at));
      const openAt = cycleOpens[0]?.created_at ?? null;
      let entry = exit != null && sz && pnl != null && sz !== 0 ? exit - pnl / (sz * dir) : null;
      let estimated = false;
      if (entry == null && cycleOpens.length) {
        // fallback: entrada = média ponderada das aberturas do ciclo (fill do close não voltou)
        let q = 0, qv = 0;
        for (const x of cycleOpens) { const p = x.avg_px != null ? Number(x.avg_px) : null; const xs = x.sz ? Number(x.sz) : null; if (p && xs) { q += xs; qv += p * xs; } }
        if (q > 0) { entry = qv / q; estimated = true; }
      }
      if (exit == null && entry != null && pnl != null && sz) { exit = entry + pnl / (sz * dir); estimated = true; }
      if (pnl == null && entry != null && exit != null && sz) { pnl = (exit - entry) * sz * dir; estimated = true; }
      const pct = entry && entry !== 0 && exit != null ? ((exit - entry) / entry) * 100 * dir : null;
      const durMin = openAt ? Math.max(0, Math.round((tms(o.created_at) - tms(openAt)) / 60000)) : null;
      const note = o.note ?? "";
      const reason = /ALVO/i.test(note) ? "🎯 alvo" : /STOP MÓVEL/i.test(note) ? "🛡️ trailing" : /STOP/i.test(note) ? "🛑 stop" : /manual/i.test(note) ? "✋ manual" : o.source === "auto" ? "↩ reversão" : "✋ manual";
      return { id: o.id, asset, wasLong, entry, exit, sz, pnl, pct, source: o.source, at: o.created_at, openAt, durMin, reason, estimated, note };
    });
  const durLabel = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`);
  // Saldo do dia/mês (RPC bot_pnl_summary, fuso BRT): mês vigente por padrão; seletor navega meses.
  const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_PT[Number(m) - 1] ?? m}/${y.slice(2)}`; };
  const curMonth = selMonth || pnlSummary?.months[0]?.month || "";
  const monthData = pnlSummary?.months.find((m) => m.month === curMonth) ?? null;

  // ── FILTROS (moeda / status / período) aplicados às ordens e aos trades ──
  const assetOf = (o: OrderRow) => (o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "");
  const orderAssets = [...new Set(orders.map(assetOf).filter(Boolean))].sort();
  const inPeriod = (iso: string) => {
    const t = new Date(iso).getTime();
    if (fFrom && t < new Date(fFrom + "T00:00:00").getTime()) return false;
    if (fTo && t > new Date(fTo + "T23:59:59").getTime()) return false;
    return true;
  };
  const matchSource = (src: string) => fSource === "all" || (fSource === "auto" ? src === "auto" : src !== "auto");
  const matchOrder = (o: OrderRow) =>
    (fAsset === "all" || assetOf(o) === fAsset) &&
    (fStatus === "all" || (fStatus === "ok" ? o.ok : !o.ok)) &&
    matchSource(o.source) &&
    inPeriod(o.created_at);
  const filtered = orders.filter(matchOrder);
  const botOrders = filtered.filter((o) => o.source === "auto");
  const manualOrders = filtered.filter((o) => o.source !== "auto");
  const fClosedTrades = closedTrades.filter((t) =>
    (fAsset === "all" || t.asset === fAsset) && matchSource(t.source) && inPeriod(t.at) &&
    (fResult === "all" || (t.pnl != null && (fResult === "win" ? t.pnl > 0 : t.pnl < 0))));
  // Estatísticas do filtro atual (só trades com resultado): win rate, profit factor, extremos, por moeda.
  const scored = fClosedTrades.filter((t) => t.pnl != null);
  const fRealized = scored.reduce((s, t) => s + (t.pnl as number), 0);
  const fWins = scored.filter((t) => (t.pnl as number) > 0).length;
  const fScored = scored.length;
  const grossWin = scored.reduce((s, t) => s + Math.max(0, t.pnl as number), 0);
  const grossLoss = scored.reduce((s, t) => s + Math.max(0, -(t.pnl as number)), 0);
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;
  const avgWin = fWins > 0 ? grossWin / fWins : null;
  const avgLoss = fScored - fWins > 0 ? grossLoss / (fScored - fWins) : null;
  const bestTrade = scored.length ? scored.reduce((a, b) => ((a.pnl as number) >= (b.pnl as number) ? a : b)) : null;
  const worstTrade = scored.length ? scored.reduce((a, b) => ((a.pnl as number) <= (b.pnl as number) ? a : b)) : null;
  const pnlByAsset = [...scored.reduce((m, t) => m.set(t.asset, (m.get(t.asset) ?? 0) + (t.pnl as number)), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const filtersOn = fAsset !== "all" || fStatus !== "all" || fSource !== "all" || fResult !== "all" || !!fFrom || !!fTo;
  const clearFilters = () => { setFAsset("all"); setFStatus("all"); setFSource("all"); setFResult("all"); setFFrom(""); setFTo(""); };
  // Períodos rápidos (hoje / 7d / 30d) — datas locais no formato do input date.
  const dstr = (d: Date) => d.toLocaleDateString("en-CA");
  const quickRange = (days: number) => { const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days - 1)); setFFrom(dstr(from)); setFTo(dstr(to)); };

  // Tabela de execuções reusável (mesmo layout p/ robô e manual).
  const ordersTable = (rows: OrderRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Lado</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Preço</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Situação</th><th className="px-4 py-2 font-medium">Por</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const a = assetOf(o) || null;
            const hasPos = positions.some((x) => x.asset === a && x.position !== "flat");
            const tipo = o.action === "open" ? "Abertura" : o.action === "add" ? "Adição" : o.action === "close" ? "Saída" : "Manual";
            return (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-2 font-semibold text-foreground">{a ?? "—"}</td>
                <td className="px-4 py-2 text-[11px] text-muted-foreground" title={o.note ?? undefined}>{tipo}{o.note ? " ℹ️" : ""}</td>
                <td className={`px-4 py-2 font-medium ${o.side === "buy" ? "text-emerald-500" : "text-rose-500"}`}>{o.side === "buy" ? "compra" : "venda"}</td>
                <td className="num px-4 py-2 text-right text-foreground">{o.sz}</td>
                <td className="num px-4 py-2 text-right text-foreground">{o.avg_px != null ? num(o.avg_px, pxDec(o.avg_px)) : "—"}</td>
                <td className="num px-4 py-2 text-right">{o.pnl != null ? <span className={o.pnl >= 0 ? "text-emerald-500" : "text-rose-500"} title="resultado realizado no fechamento">{o.pnl >= 0 ? "+" : ""}{num(o.pnl)}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2">
                  {!o.ok ? (
                    <span className="text-rose-500" title={o.result?.data?.[0]?.sMsg ?? o.result?.msg ?? ""}>erro</span>
                  ) : o.action === "close" ? (
                    <span className="text-[10px] text-muted-foreground">saída ok</span>
                  ) : (() => {
                    const closedAfter = orders.some((x) => x.inst_id === o.inst_id && x.action === "close" && x.ok && new Date(x.created_at) > new Date(o.created_at));
                    return hasPos && !closedAfter
                      ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />posição aberta</span>
                      : <span className="text-[10px] text-muted-foreground">encerrada</span>;
                  })()}
                </td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{o.source === "auto" ? "robô" : "manual"}</span></td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {o.ord_type === "limit" && o.ok && o.result?.data?.[0]?.ordId && (
                    <button onClick={() => cancelOrder(o)} disabled={busy !== null} className="mr-3 text-[11px] text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400">cancelar</button>
                  )}
                  <button onClick={() => deleteOrder(o)} disabled={busy !== null} className="text-[11px] text-muted-foreground hover:text-rose-500 hover:underline disabled:opacity-50" title={!o.ok ? "Remove a ordem com erro do histórico (não afeta a posição)" : hasPos ? `Fecha a posição de ${a} e remove a ordem` : "Remove do histórico"}>
                    {o.ok && hasPos ? "cancelar" : "excluir"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-foreground">Robô · Lab</h1>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">{isBinance ? "Binance Testnet · futuros fake" : "OKX Demo · dinheiro fake"}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connected ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{connected ? (isBinance ? "Binance conectada" : "OKX conectada") : "não conectada"}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg?.enabled ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{cfg?.enabled ? "ROBÔ LIGADO" : "robô desligado"}</span>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">Robô de trade <strong>pessoal</strong> em simulador, isolado do produto e visível só para você. Compra e vende sozinho pela estratégia abaixo; toda ordem usa o ambiente Demo da OKX (<code>x-simulated-trading</code>) — sem risco.</p>

      {msg && (
        <div className={`rounded-lg border p-3 text-sm ${msg.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"}`}>{msg.text}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patrimônio (demo)</div>
          <div className="num text-lg font-bold text-foreground">{totalEq != null ? `US$ ${num(totalEq)}` : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Par</div>
          <div className="text-lg font-bold text-foreground">{cfg?.inst_id ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">{cfg ? `${isFut ? `Futuros até ${cfg.leverage}x` : "Spot"} · risco ${cfg.risk_pct ?? 1}%/trade` : ""}</div>
        </div>
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Último preço</div>
          <div className="num text-lg font-bold text-foreground">{lastPx ? num(lastPx, dec) : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordens (auto/total)</div>
          <div className="num text-lg font-bold text-foreground">{orders.filter((o) => o.source === "auto").length}/{orders.length}</div>
        </div>
      </div>

      {/* Abas do módulo do robô — organiza a página em seções (menos rolagem) */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {([
          ["grafico", "📈 Gráfico & posições"],
          ["ordens", "📋 Ordens"],
          ["aprendizado", "🧠 Aprendizado"],
          ["config", "⚙️ Configuração"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Robô automático · aba Configuração */}
      {tab === "config" && cfg && (
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">Robô automático</h2>
              <button onClick={toggleBot} disabled={busy !== null || !connected} className={`rounded-lg px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-50 ${cfg.enabled ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"}`}>
                {cfg.enabled ? "■ Desligar robô" : "▶ Ligar robô"}
              </button>
              <span className="text-[11px] text-muted-foreground">{cfg.enabled ? "operando · roda a cada ~5 min" : "desligado · roda a cada ~5 min quando ligar"}</span>
            </div>
            <button onClick={runNow} disabled={busy !== null || !connected} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
              {busy === "run" ? "Rodando…" : cfg.enabled ? "Rodar agora" : "Testar sinal (sem operar)"}
            </button>
          </div>
          <div className="mt-3 space-y-4">
            {/* ── 1 · Execução & risco — quanto arrisca e os freios de segurança ── */}
            <div className="rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">💰 1 · Execução & risco <span className="font-normal normal-case">— quanto arrisca por trade e os freios de segurança</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-muted-foreground">Par (instId)
                  <input className={`${input} mt-1`} value={cfg.inst_id} onChange={(e) => setCfg({ ...cfg, inst_id: e.target.value.toUpperCase(), base_ccy: e.target.value.toUpperCase().split("-")[0] || cfg.base_ccy, quote_ccy: e.target.value.toUpperCase().split("-")[1] || cfg.quote_ccy })} />
                  {isBinance && <span className="mt-0.5 block text-[10px]">na Binance o robô opera <strong>BTC · ETH · SOL · BNB</strong> (este campo vale só p/ OKX/spot)</span>}
                </label>
                {isFut ? (
                  <label className="text-xs text-muted-foreground">Risco por trade (% do patrimônio)
                    <input type="number" step="0.1" min="0.1" className={`${input} mt-1`} value={cfg.risk_pct ?? 1} onChange={(e) => setCfg({ ...cfg, risk_pct: Number(e.target.value) })} />
                    <span className="mt-0.5 block text-[10px]">tamanho = risco ÷ distância do stop (stop longe → posição menor)</span>
                  </label>
                ) : (
                  <label className="text-xs text-muted-foreground">Tamanho da compra ({cfg.quote_ccy})
                    <input type="number" className={`${input} mt-1`} value={cfg.order_quote_sz} onChange={(e) => setCfg({ ...cfg, order_quote_sz: Number(e.target.value) })} />
                  </label>
                )}
                {isFut && (
                  <label className="text-xs text-muted-foreground">Alavancagem máx (x · teto)
                    <input type="number" min="1" max="20" className={`${input} mt-1`} value={cfg.leverage} onChange={(e) => setCfg({ ...cfg, leverage: Number(e.target.value) })} />
                    <span className="mt-0.5 block text-[10px]">teto de nocional, não multiplicador do tamanho</span>
                  </label>
                )}
                {isFut && (
                  <label className="text-xs text-muted-foreground">Perda diária máx (%) <span title="Circuit breaker: bateu a perda no dia, o robô para de abrir posição até o dia virar.">ⓘ</span>
                    <input type="number" step="0.5" min="0" className={`${input} mt-1`} value={cfg.daily_loss_pct ?? 5} onChange={(e) => setCfg({ ...cfg, daily_loss_pct: Number(e.target.value) })} />
                  </label>
                )}
                {isFut && (
                  <label className="text-xs text-muted-foreground">Máx. posições simultâneas
                    <input type="number" min="1" max="10" className={`${input} mt-1`} value={cfg.max_positions ?? 4} onChange={(e) => setCfg({ ...cfg, max_positions: Number(e.target.value) })} />
                  </label>
                )}
                {isFut && (
                  <label className="text-xs text-muted-foreground">Cooldown pós-stop (min) <span title="Depois de um stop, a moeda fica de castigo esse tempo antes de reabrir (evita revenge trade no mesmo ruído).">ⓘ</span>
                    <input type="number" min="0" className={`${input} mt-1`} value={cfg.cooldown_min ?? 15} onChange={(e) => setCfg({ ...cfg, cooldown_min: Number(e.target.value) })} />
                  </label>
                )}
              </div>
            </div>

            {/* ── 2 · Entrada — os gatilhos SMC e os filtros que seguram entrada ruim ── */}
            {isFut && (
              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🎯 2 · Entrada <span className="font-normal normal-case">— gatilhos SMC e filtros (espelha o pipeline da aba Gráfico)</span></div>
                <div className="space-y-2">
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={cfg.imbalance_on !== false} onChange={(e) => setCfg({ ...cfg, imbalance_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    <span><strong>Imbalance (FVG novo) → arma o setup</strong>: FVG fresco no 15m arma entrada na direção dele; stop e alvo vêm da estrutura. <strong>Não tem mais passe livre</strong>: passa pelo mesmo placar de confluência abaixo.</span>
                    {cfg.imbalance_on !== false && (
                      <span className="flex items-center gap-1">· tamanho mín <input type="number" step="0.05" min="0" value={cfg.imbalance_min_pct ?? 0} onChange={(e) => setCfg({ ...cfg, imbalance_min_pct: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />% (0 = todo FVG)</span>
                    )}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-xs text-muted-foreground">Confluência mínima (grupos a favor) <span title="Os 4 grupos — Estrutura SMC · Fluxo (book inst+varejo, liquidações, gamma, divergência CVD) · Técnico (EMA20×50+VWAP) · Sentimento (F&G, L/S) — votam na direção do setup. Só executa com essa maioria a favor e sem empate contra. Vale pra TODA entrada, imbalance incluído.">ⓘ</span>
                      <select className={`${input} mt-1`} value={cfg.conf_min ?? 3} onChange={(e) => setCfg({ ...cfg, conf_min: Number(e.target.value) })}>
                        <option value={2}>2 de 4 — maioria simples (mais trades)</option>
                        <option value={3}>3 de 4 — confluência forte (recomendado)</option>
                        <option value={4}>4 de 4 — unanimidade (raro, pouquíssimos trades)</option>
                      </select>
                      <span className="mt-0.5 block text-[10px]">Nos trades reais: fluxo a favor = 60% de acerto (+683) × contra = 20% (−152). Setup segurado fica no Diário com o placar.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Entrada perto da zona (× ATR) <span title="Qualidade 1: entrada imbalance só com o preço a até X ATR da borda do FVG (0 = desligado). REPROVADA no backtest de 03/jul (mata ETH/SOL — o chase é o que paga lá); fica disponível p/ experimento.">ⓘ</span>
                      <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.max_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, max_zone_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Backtest 90+180d: ligar piora ETH/SOL.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Bloqueio por zona oposta (× ATR) <span title="Qualidade 2: segura a entrada quando há FVG/OB oposto fresco a até X ATR à frente (0 = desligado). REPROVADA no backtest de 03/jul junto com a regra 1; fica disponível p/ experimento.">ⓘ</span>
                      <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.opp_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, opp_zone_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Idem: reprovada em ETH/SOL.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Sessão bloqueada (horas UTC, vírgula) <span title="Gate de sessão: nessas horas UTC o robô NÃO abre posição nova nem piramida — saídas (stop/alvo/trailing) seguem normais. Estudo 03/jul (28 backtests): 9-12h e 18-24h UTC negativas em 7-8 de 8 janelas; bloquear melhorou o agregado nas 2 janelas (180d: −6,5%→+42,1%). Em Brasília: 6-9h e 15-21h. Vazio = sem filtro.">ⓘ</span>
                      <input type="text" className={`${input} mt-1`} value={(cfg.block_hours ?? []).join(",")} onChange={(e) => setCfg({ ...cfg, block_hours: e.target.value.split(",").map((s) => Number(s.trim())).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) })} placeholder="ex.: 9,10,11,18,19,20,21,22,23" />
                      <span className="mt-0.5 block text-[10px]">GLOBAL (fallback) — a config POR MOEDA abaixo sobrepõe. Só entradas; posição aberta segue gerida.</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2b · CONFIG POR MOEDA — cada moeda é única (motor idêntico, dose diferente) ── */}
            {isFut && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">🪙 2b · Configuração por moeda <span className="font-normal normal-case text-muted-foreground">— CADA MOEDA É ÚNICA: o motor é o mesmo, a dose é a que o backtest validou POR ATIVO</span></div>
                <p className="mb-2 text-[11px] text-muted-foreground">O <strong>aprendizado é individual por moeda</strong> (aba Aprendizado mede acerto por sinal em cada ativo; o dataset <code>bot_trades_hist</code> arquiva cada trade por moeda) — as melhorias são testadas e aplicadas <strong>separadamente</strong> em cada uma. Regra anti-overfit: parâmetro só muda com melhora nas DUAS janelas (90d+180d) do backtester. Base validada 03/jul: <strong>BTC/BNB defensivos</strong> (sessão bloqueada; BNB meio risco — candidato a pausa), <strong>ETH/SOL livres</strong> (SMC puro é a edge).</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {["BTC", "ETH", "SOL", "BNB"].map((a) => {
                    const ov = cfg.asset_overrides?.[a] ?? {};
                    const setOv = (patch: Record<string, unknown>) => setCfg({ ...cfg, asset_overrides: { ...(cfg.asset_overrides ?? {}), [a]: { ...ov, ...patch } } });
                    return (
                      <div key={a} className="rounded-lg border border-border/70 bg-background/60 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{a}</span>
                          <span className="text-[9px] text-muted-foreground">{(ov.block_hours ?? []).length ? "🛡 defensiva" : "🟢 livre"}{(ov.risk_mult ?? 1) < 1 ? ` · ${Math.round((ov.risk_mult ?? 1) * 100)}% risco` : ""}</span>
                        </div>
                        <label className="block text-[10px] text-muted-foreground">Sessão bloqueada (h UTC) <span title="Horas UTC em que ESTA moeda não abre posição nem piramida (saídas normais). Vazio = livre 24h. Validado: BTC/BNB [9-11,18-23]; ETH/SOL livres.">ⓘ</span>
                          <input type="text" className={`${input} mt-0.5`} value={(ov.block_hours ?? []).join(",")} onChange={(e) => setOv({ block_hours: e.target.value.split(",").map((s) => Number(s.trim())).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) })} placeholder="vazio = livre 24h" />
                        </label>
                        <label className="mt-1 block text-[10px] text-muted-foreground">Confluência mínima <span title="Grupos (de 4) votando na direção p/ ESTA moeda executar. Vazio = usa o global.">ⓘ</span>
                          <select className={`${input} mt-0.5`} value={ov.conf_min ?? ""} onChange={(e) => setOv({ conf_min: e.target.value === "" ? undefined : Number(e.target.value) })}>
                            <option value="">global ({cfg.conf_min ?? 3} de 4)</option>
                            <option value={2}>2 de 4</option>
                            <option value={3}>3 de 4</option>
                            <option value={4}>4 de 4</option>
                          </select>
                        </label>
                        <label className="mt-1 block text-[10px] text-muted-foreground">Multiplicador de risco <span title="Fração do risco por trade (0.1–1) p/ ESTA moeda. BNB em 0.5 = meio risco enquanto for a pior do backtest (candidata a pausa).">ⓘ</span>
                          <input type="number" step="0.1" min="0.1" max="1" className={`${input} mt-0.5`} value={ov.risk_mult ?? 1} onChange={(e) => setOv({ risk_mult: Number(e.target.value) })} />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 3 · Saída & gestão — como a posição é protegida e encerrada ── */}
            {isFut && (
              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🚪 3 · Saída & gestão da posição <span className="font-normal normal-case">— stop, trailing, reversão e pirâmide</span></div>
                <div className="space-y-2">
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!!cfg.stop_atr_on} onChange={(e) => setCfg({ ...cfg, stop_atr_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    <span><strong>Stop de risco por ATR</strong> (fallback): quando o setup não traz stop estrutural, usa a volatilidade do ativo — cada moeda ganha um stop na sua escala. Desligado, o fallback é % fixo (config legada).</span>
                    {cfg.stop_atr_on && (
                      <span className="flex items-center gap-1">· distância <input type="number" step="0.5" min="0.5" value={cfg.stop_atr_mult ?? 4} onChange={(e) => setCfg({ ...cfg, stop_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR</span>
                    )}
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={cfg.target_on !== false} onChange={(e) => setCfg({ ...cfg, target_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    <span><strong>Alvo de lucro (take-profit) na liquidez</strong>: fecha a posição na próxima poça de liquidez do plano SMC. <strong>Desligado</strong> = sem teto de ganho — <em>reprovado no backtest 03/jul (pior em 7 de 8 janelas; o trailing devolve o pico da liquidez)</em>.</span>
                    {cfg.target_on !== false && (
                      <span className="flex items-center gap-1.5">
                        · <input type="checkbox" checked={!!cfg.tp_partial} onChange={(e) => setCfg({ ...cfg, tp_partial: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
                        <span><strong>parcial 50%</strong>: embolsa metade no alvo, resto no trailing (stop ≥ breakeven) — <em>reprovado no backtest 03/jul (8/8 janelas; o alvo cheio venceu)</em></span>
                      </span>
                    )}
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!!cfg.trail_on} onChange={(e) => setCfg({ ...cfg, trail_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    <span><strong>Stop móvel (trailing) por ATR</strong>: sobe com o pico e nunca desce — trava lucro se o preço voltar. Distância <strong>k × ATR</strong> com piso de estrutura; arma só no lucro.</span>
                    {cfg.trail_on && (
                      <span className="flex items-center gap-1">· trava <input type="number" step="0.5" min="0.5" value={cfg.trail_atr_mult ?? 3} onChange={(e) => setCfg({ ...cfg, trail_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR abaixo do pico</span>
                    )}
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={!!cfg.pyramid} onChange={(e) => setCfg({ ...cfg, pyramid: e.target.checked })} className="h-4 w-4 rounded border-border" />
                    <span><strong>Pirâmide</strong>: adiciona à posição em novo sinal na MESMA direção — só no lucro, com metade do risco</span>
                    {cfg.pyramid && (
                      <span className="flex items-center gap-1">· máx <input type="number" min="1" max="10" value={cfg.pyramid_max ?? 2} onChange={(e) => setCfg({ ...cfg, pyramid_max: Number(e.target.value) })} className="w-14 rounded border border-border bg-background px-2 py-0.5 num" /> adições</span>
                    )}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="text-xs text-muted-foreground">Reversão (virar a mão)
                      <select className={`${input} mt-1`} value={cfg.rev_mode ?? "off"} onChange={(e) => setCfg({ ...cfg, rev_mode: e.target.value })}>
                        <option value="off">Nunca — sai só por stop/alvo/trailing (recomendado)</option>
                        <option value="imbalance">Só imbalance (FVG fresco) contra</option>
                        <option value="any">Sempre que o sinal virar (antigo)</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── 4 · Aprendizado & sinais de fluxo ── */}
            <div className="rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🧠 4 · Aprendizado & sinais de fluxo <span className="font-normal normal-case">— o que alimenta o veto e a auto-ponderação</span></div>
              <div className="space-y-2">
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={!!cfg.auto_weight} onChange={(e) => setCfg({ ...cfg, auto_weight: e.target.checked })} className="h-4 w-4 rounded border-border" />
                  <span><strong>Auto-ponderar por moeda</strong>: usa o que o robô aprendeu em CADA ativo p/ pesar os sinais (estrutura pesada onde acerta, leve onde erra). Trava anti-overfit: só age com amostra ≥20, ajuste cresce devagar e limitado. <em>Deixe desligado até o aprendizado amadurecer.</em></span>
                </label>
                {isFut && (
                  <div className="text-xs text-muted-foreground">
                    <p className="mb-2 text-[11px]">O núcleo <strong>SMC price-action</strong> (Order Blocks, Imbalance, Liquidez, EQH/EQL, Zonas, BOS/CHoCH no 15m) é <strong>sempre</strong> usado. Estes compõem os grupos do <strong>placar de confluência</strong> (Fluxo/Técnico/Sentimento) e o aprendizado — desligar um sinal tira ele do grupo dele. Absorção, paredes, pressão, CVD agregado e funding já estão fora do placar (acerto &lt;50% no aprendizado; seguem medidos).</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {FLOW_SIGNALS.map((s) => (
                        <label key={s.key} className="flex items-center gap-1.5">
                          <input type="checkbox" checked={cfg.signal_toggles?.[s.key] !== false} onChange={(e) => setCfg({ ...cfg, signal_toggles: { ...(cfg.signal_toggles ?? {}), [s.key]: e.target.checked } })} className="h-3.5 w-3.5 rounded border-border" />
                          <span>{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => saveConfig({ inst_id: cfg.inst_id, base_ccy: cfg.base_ccy, quote_ccy: cfg.quote_ccy, order_quote_sz: cfg.order_quote_sz, buy_threshold: cfg.buy_threshold, sell_threshold: cfg.sell_threshold, leverage: cfg.leverage, pyramid: cfg.pyramid, pyramid_max: cfg.pyramid_max, min_votes: cfg.min_votes, stop_pct: cfg.stop_pct, ct_stop_pct: cfg.ct_stop_pct, counter_trend: cfg.counter_trend, auto_weight: cfg.auto_weight, trail_on: cfg.trail_on, trail_pct: cfg.trail_pct, trail_atr_mult: cfg.trail_atr_mult, stop_atr_on: cfg.stop_atr_on, stop_atr_mult: cfg.stop_atr_mult, risk_pct: cfg.risk_pct, daily_loss_pct: cfg.daily_loss_pct, max_positions: cfg.max_positions, cooldown_min: cfg.cooldown_min, imbalance_on: cfg.imbalance_on, imbalance_min_pct: cfg.imbalance_min_pct, signal_toggles: cfg.signal_toggles, rev_mode: cfg.rev_mode ?? "off", conf_min: cfg.conf_min ?? 3, max_zone_atr: cfg.max_zone_atr ?? 0, opp_zone_atr: cfg.opp_zone_atr ?? 0, target_on: cfg.target_on !== false, tp_partial: !!cfg.tp_partial, block_hours: cfg.block_hours ?? [], asset_overrides: cfg.asset_overrides ?? {} })} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "cfg" ? "Salvando…" : "Salvar config"}
            </button>
            <span className="text-[11px] text-muted-foreground">Estratégia (motor v17 — confluência): o <strong>SMC do 15m arma o setup</strong> (Order Block/FVG/imbalance a favor de BOS/CHoCH; <strong>stop = invalidação estrutural</strong>, <strong>alvo = próxima liquidez</strong>, R:R ≥ 1) e <strong>4 grupos votam</strong> na direção — Estrutura SMC · Fluxo limpo (book inst+varejo, liquidações, gamma, divergência CVD) · Técnico (EMA20×50 + VWAP) · Sentimento (F&G, L/S). <strong>Só executa com a maioria configurada a favor — toda entrada, imbalance incluído</strong> (fim do passe livre que entrava contra fluxo/EMAs/VWAP). Sinais com acerto &lt;50% no aprendizado (absorção, paredes, pressão do book, CVD agregado, funding) <strong>saíram do placar</strong> — só medidos. <strong>Reversão disciplinada</strong>: por padrão a posição sai só por stop/alvo/trailing. Sizing por risco, alavancagem como teto, circuit breaker diário, cooldown pós-stop; pirâmide só no lucro e a favor. <strong>CADA MOEDA É ÚNICA</strong> (seção 2b): mesmo motor, dose validada por ativo — BTC/BNB defensivos, ETH/SOL livres; aprendizado e melhorias individuais por moeda.</span>
          </div>
        </div>
      )}

      {/* Gráfico, leitura e posições · aba Gráfico */}
      {tab === "grafico" && (<>
      {/* Leitura do robô (fluxo) — da moeda em foco (seletor no cabeçalho do gráfico) */}
      {selReading && (() => {
        const r = selReading;
        const bias = r.bias;
        // ±18 = limiar de regime do bot-run (up/down/range) — mesma régua do backend.
        const bc = bias >= 18 ? "text-emerald-500" : bias <= -18 ? "text-rose-500" : "text-muted-foreground";
        const flow = r.flowTilt ?? r.structure?.flowBias ?? 0;
        const vetoAt = Math.max(1, Number(cfg?.flow_veto ?? 10));
        const revMode = String(cfg?.rev_mode ?? "off");
        const setup = r.setup ?? r.structure?.setup ?? null;
        const planStop = r.planStop ?? r.structure?.planStop ?? null;
        const planTarget = r.planTarget ?? r.structure?.planTarget ?? null;
        const gate = r.gate ?? null;
        const held = !!gate && /contra|bloqueada|segura|não faz short/i.test(gate);
        const posNow = selPos?.position ?? r.position ?? "flat";
        const setupUp = !!setup && setup.includes("↑");
        return (
          <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">🧠 Leitura do robô · {selAsset} · SMC price-action 15m</h2>
              <span className="text-[11px] text-muted-foreground">{cfg?.last_run ? `atualizado ${new Date(cfg.last_run).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            </div>
            {/* Contexto — regime estrutural, zona, gamma, posição e auto-peso */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Contexto</span>
              <span className={`rounded px-1.5 py-0.5 font-bold ${bias >= 18 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : bias <= -18 ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`} title="Regime pela estrutura SMC do 15m (BOS/CHoCH + swings): ±18 = tendência; entre eles = range.">estrutura 15m: {bias >= 18 ? "ALTA" : bias <= -18 ? "BAIXA" : "range"}</span>
              {r.structure?.zone && (
                <span className="text-muted-foreground" title="Zona do range entre swing low e swing high: discount = barato (favorece compra) · premium = caro (favorece venda) · equilíbrio = meio.">zona: <span className="text-foreground">{r.structure.zone}</span></span>
              )}
              {r.structure?.gammaRegime && r.structure.gammaRegime !== "neutral" && (
                <span className={`rounded px-1.5 py-0.5 font-semibold ${r.structure.gammaRegime === "negative" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`} title={r.structure.gammaRegime === "positive" ? "Gamma positivo: dealers amortecem o preço (pinning/reversão) — rompimento tende a falhar" : "Gamma negativo: dealers amplificam (tendência) — rompimento anda mais"}>γ {r.structure.gammaRegime === "positive" ? "positivo (reversão)" : "negativo (tendência)"}</span>
              )}
              <span className={`rounded px-1.5 py-0.5 font-semibold ${posNow === "long" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : posNow === "short" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`} title="Posição atual do robô nesta moeda (pirâmide = adições no lucro).">posição: {posNow === "long" ? "LONG" : posNow === "short" ? "SHORT" : "fora"}{posNow !== "flat" && (selPos?.adds ?? r.adds ?? 0) > 0 ? ` +${selPos?.adds ?? r.adds}` : ""}{posNow !== "flat" && r.leverage ? ` · ${r.leverage}x` : ""}</span>
              {r.structure?.autoWeight?.on && (
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-semibold text-violet-600 dark:text-violet-400" title="Auto-ponderação ligada: o aprendizado desta moeda ajusta o peso dos sinais (o que acerta pesa mais).">auto-peso on</span>
              )}
            </div>
            {/* Pipeline de decisão: estrutura decide → gatilho arma → fluxo/técnico vetam → decisão */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Viés da estrutura SMC do 15m — a ÚNICA leitura que abre trade.">1 · Estrutura 15m</div>
                <div className={`num text-2xl font-bold ${bc}`}>{bias >= 0 ? "+" : ""}{bias}</div>
                <div className="relative mt-1 h-1.5 rounded-full bg-muted/50">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                  <div className={`absolute top-0 h-full rounded-full ${bias >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={bias >= 0 ? { left: "50%", width: `${Math.abs(bias) / 2}%` } : { right: "50%", width: `${Math.abs(bias) / 2}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">decide entrada, stop e alvo</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Setup SMC armado agora: imbalance (FVG fresco) ou OB/FVG a favor de BOS/CHoCH após varrer liquidez ou em discount/premium.">2 · Gatilho (setup)</div>
                <div className={`truncate text-lg font-bold leading-8 ${setup ? (setupUp ? "text-emerald-500" : "text-rose-500") : "text-muted-foreground"}`} title={setup ?? undefined}>{setup ?? "nenhum"}</div>
                <div className="text-[10px] text-muted-foreground">{setup ? `stop ${num(planStop)} · alvo ${num(planTarget)}` : "aguarda OB/FVG ou imbalance"}</div>
              </div>
              <div className={`rounded-lg border p-3 text-center ${held && gate!.includes("confluência") ? "border-amber-500/40 bg-amber-500/5" : "border-border/70 bg-background/40"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Placar de confluência: 4 grupos (Estrutura SMC · Fluxo limpo · Técnico EMA/VWAP · Sentimento) votam na direção do setup. Só executa com a maioria configurada a favor — vale pra TODA entrada, imbalance incluído.">3 · Confluência (maioria)</div>
                {r.confluence?.length ? (<>
                  <div className="num text-2xl font-bold text-foreground" title={r.confVotes ? `${r.confVotes.for} a favor × ${r.confVotes.against} contra` : undefined}>{r.confVotes ? `${r.confVotes.for}/${r.confluence.length}` : "—"}</div>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    {r.confluence.map((g) => (
                      <span key={g.key} title={`${g.label}: ${g.score >= 0 ? "+" : ""}${g.score} (${g.vote === 1 ? "compra" : g.vote === -1 ? "venda" : "neutro"})`} className={`h-2.5 w-2.5 rounded-full ${g.vote === 1 ? "bg-emerald-500" : g.vote === -1 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">precisa {r.confMin ?? cfg?.conf_min ?? 3} de {r.confluence.length} · fluxo {flow >= 0 ? "+" : ""}{flow}</div>
                </>) : (<>
                  <div className={`num text-2xl font-bold ${flow >= vetoAt ? "text-emerald-500" : flow <= -vetoAt ? "text-rose-500" : "text-muted-foreground"}`}>{flow >= 0 ? "+" : ""}{flow}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">aguardando 1º ciclo do motor v17…</div>
                </>)}
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">4 · Decisão</div>
                {(() => { const d = selPos?.last_decision ?? cfg?.last_decision; return <div className={`text-2xl font-bold ${d === "buy" || d === "long" || d === "add" ? "text-emerald-500" : d === "sell" || d === "short" ? "text-rose-500" : "text-foreground"}`}>{d === "add" ? "Pirâmide" : decisionLabel(d)}</div>; })()}
                <div className="text-[10px] text-muted-foreground">{revMode === "off" ? "sai só por stop/alvo/trailing" : revMode === "imbalance" ? "reverte só com FVG fresco contra" : "reverte a cada sinal contrário"}</div>
              </div>
            </div>
            {/* Motivo — o porquê da decisão deste ciclo (gate de veto ou nota do plano) */}
            {gate && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${held ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : gate.startsWith("sem") ? "border-border/70 bg-background/40 text-muted-foreground" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                {held ? <>⏸ <strong>Segurou:</strong> {gate}</> : gate.startsWith("sem") ? <>Sem gatilho neste ciclo: {gate} — o robô aguarda um setup SMC a favor da estrutura.</> : <>🎯 <strong>Gatilho armado:</strong> {gate}</>}
              </div>
            )}
            <div className="mt-3 space-y-3">
              {SIG_GROUPS.map((grp) => {
                const items = r.signals.filter((s) => s.group === grp);
                if (!items.length) return null;
                return (
                  <div key={grp}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{grp}</div>
                    <div className="space-y-1">
                      {items.map((s) => { const role = sigRole(s.key); return (
                        <div key={s.key} className="flex items-center gap-2 text-xs">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.score > 8 ? "bg-emerald-500" : s.score < -8 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                          <span className="w-40 shrink-0 truncate text-foreground" title={s.label}>{s.label}</span>
                          <span className={`hidden w-12 shrink-0 rounded px-1 py-px text-center text-[9px] font-semibold uppercase sm:inline-block ${role.cls}`} title={role.title}>{role.tag}</span>
                          <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block" title={s.note}>{s.note}</span>
                          <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-muted/50">
                            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                            <div className={`absolute top-0 h-full rounded-full ${s.score >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={s.score >= 0 ? { left: "50%", width: `${Math.abs(s.score) / 2}%` } : { right: "50%", width: `${Math.abs(s.score) / 2}%` }} />
                          </div>
                          <span className={`num w-8 shrink-0 text-right ${s.score >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{s.score >= 0 ? "+" : ""}{s.score}</span>
                        </div>
                      ); })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Como o robô decide (motor v17): a <strong>estrutura SMC do 15m</strong> (badge <em>decide</em>) arma o setup — OB/FVG/imbalance a favor de BOS/CHoCH, stop na invalidação estrutural, alvo na próxima liquidez. Os sinais <em>vota</em> formam os 4 grupos do placar de confluência (Estrutura · Fluxo · Técnico · Sentimento); a entrada — <strong>imbalance incluído</strong> — só executa com a maioria dos grupos a favor ({r.confMin ?? cfg?.conf_min ?? 3} de 4). Os <em>medido</em> não influenciam — alimentam o aprendizado por moeda. Atualizado a cada ~5 min. Educacional — não é recomendação.</p>
          </div>
        );
      })()}

      {/* Gráfico com marcações */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Gráfico · {selInst} <span className="text-xs font-normal text-muted-foreground">({cfg?.bar})</span></h2>
            {/* Seletor de moeda: troca o gráfico + a leitura (viés/decisão/sinais) para o ativo escolhido. */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              {ASSET_LIST.map((a) => (
                <button key={a} onClick={() => setSelAsset(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${selAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {BARS.map((b) => <button key={b} onClick={() => cfg && setCfg({ ...cfg, bar: b })} className={`rounded-md px-2 py-0.5 transition-colors ${cfg?.bar === b ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{b}</button>)}
            </div>
            <span className="flex items-center gap-1"><span className="text-emerald-500">▲</span> compra</span>
            <span className="flex items-center gap-1"><span className="text-rose-500">▼</span> venda</span>
            <span className="flex items-center gap-1"><span className="text-blue-500">■</span> saída</span>
            <span className="hidden items-center gap-1 md:flex"><span className="inline-block h-0.5 w-3 rounded bg-[#f59e0b]" /> EMA20</span>
            <span className="hidden items-center gap-1 md:flex"><span className="inline-block h-0.5 w-3 rounded bg-[#8b5cf6]" /> EMA50</span>
            {cfg?.bar !== "1D" && <span className="hidden items-center gap-1 md:flex"><span className="inline-block h-0.5 w-3 rounded bg-[#22d3ee]" /> VWAP</span>}
            {indicators.adx && (
              <span className={`rounded-md border border-border px-1.5 py-0.5 font-semibold ${indicators.adx.adx < 20 ? "text-amber-500" : indicators.adx.dir >= 0 ? "text-emerald-500" : "text-rose-500"}`} title="ADX/DMI 14 — força da tendência no timeframe do gráfico (<20 = lateral/chop, onde setup de continuação apanha)">
                ADX {Math.round(indicators.adx.adx)}{indicators.adx.adx < 20 ? " · lateral" : indicators.adx.dir >= 0 ? " · tendência ↑" : " · tendência ↓"}
              </span>
            )}
            <button onClick={refresh} disabled={busy !== null || !connected} className="rounded-lg border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">{busy === "refresh" ? "…" : "Atualizar"}</button>
          </div>
        </div>
        {connected && candles.length > 0 ? (
          <BotChart candles={candles} markers={markers} priceLines={priceLines} lines={indicators.lines} decimals={dec} fitKey={`${selInst}-${cfg?.bar ?? ""}`} />
        ) : (
          <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">{connected ? "Carregando velas…" : "Conecte a OKX para ver o gráfico."}</div>
        )}
      </div>

      {/* Resumo da conta — quanto está rendendo agora e o que já foi realizado */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Resumo da conta (demo)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patrimônio total</div>
            <div className="num text-2xl font-bold text-foreground">{totalEq != null ? `US$ ${num(totalEq)}` : "—"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">PnL aberto agora</div>
            <div className={`num text-2xl font-bold ${!hasLivePnl ? "text-muted-foreground" : openPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{hasLivePnl ? `${openPnl >= 0 ? "+" : ""}${num(openPnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">soma das posições em aberto</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do dia</div>
            <div className={`num text-2xl font-bold ${!pnlSummary || !pnlSummary.day.trades ? "text-muted-foreground" : pnlSummary.day.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{pnlSummary && pnlSummary.day.trades ? `${pnlSummary.day.pnl >= 0 ? "+" : ""}${num(pnlSummary.day.pnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{pnlSummary && pnlSummary.day.trades ? `${pnlSummary.day.wins}/${pnlSummary.day.trades} no verde · hoje` : "sem trades hoje"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="mb-0.5 flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do mês</span>
              {pnlSummary && pnlSummary.months.length > 0 && (
                <select value={curMonth} onChange={(e) => setSelMonth(e.target.value)} className="rounded border border-border/70 bg-background/60 px-1 py-0.5 text-[10px] text-foreground focus:outline-none" title="escolher mês">
                  {pnlSummary.months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
                </select>
              )}
            </div>
            <div className={`num text-2xl font-bold ${!monthData || !monthData.trades ? "text-muted-foreground" : monthData.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{monthData && monthData.trades ? `${monthData.pnl >= 0 ? "+" : ""}${num(monthData.pnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{monthData && monthData.trades ? `${monthData.wins}/${monthData.trades} no verde` : "sem trades no mês"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</div>
            <div className={`text-lg font-bold ${openPositions.length ? "text-foreground" : "text-muted-foreground"}`}>{openPositions.length ? `${openPositions.length} rodando` : "Fora do mercado"}</div>
            <div className="text-[10px] text-muted-foreground">{cfg?.enabled ? "robô ligado" : "robô desligado"}</div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{isFut ? "Futuros: long e short com margem em " : "Opera com capital em "}{quote}; saldos pré-existentes ficam intocados.</p>
      </div>

      {/* Posições abertas — o que o robô tem em aberto AGORA, com PnL ao vivo e fechar por moeda. */}
      {positions.length > 0 && (
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Posições abertas</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${openPositions.length ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{openPositions.length ? `${openPositions.length} rodando` : "nenhuma aberta"}</span>
          </div>
          {openPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma posição aberta — o robô está <strong>fora do mercado</strong> em todas as moedas.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {openPositions.map((p) => {
                const live = p.inst_id ? livePos[p.inst_id] : undefined;
                const long = p.position === "long";
                const pdec = pxDec(p.entry_px);
                const mark = live?.markPx ?? null;
                const movePct = p.entry_px && mark ? ((mark - p.entry_px) / p.entry_px) * 100 * (long ? 1 : -1) : null;
                return (
                  <div key={p.asset} className={`rounded-lg border p-3 ${long ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">{p.asset}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${long ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/20 text-rose-600 dark:text-rose-400"}`}>{long ? "▲ LONG" : "▼ SHORT"}{isFut && cfg?.leverage ? ` ${cfg.leverage}x` : ""}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold"><span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />rodando</span>{p.ctrend && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-amber-600 dark:text-amber-400" title="Aberta contra a tendência — stop curto e tamanho reduzido">contra-tend.</span>}</div>
                    {live ? (
                      <div className={`num mt-1 text-lg font-bold ${live.uPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{live.uPnl >= 0 ? "+" : ""}{num(live.uPnl)} {quote}{movePct != null && <span className="ml-1 text-[11px] font-medium">({live.uPnl >= 0 ? "+" : ""}{movePct.toFixed(2)}%)</span>}</div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted-foreground">PnL ao vivo indisponível</div>
                    )}
                    <div className="mt-1 text-[10px] text-muted-foreground">entrada <span className="num">{p.entry_px != null ? num(p.entry_px, pdec) : "—"}</span>{mark ? <> · agora <span className="num">{num(mark, pdec)}</span></> : null}{p.adds != null && p.adds > 0 && <span className="ml-1 text-amber-500">· 🔺{p.adds}x</span>}{p.stop_px != null && <span className="ml-1 text-rose-500/80" title="Nível de stop de risco (fecha se furar)"> · stop <span className="num">{num(p.stop_px, pdec)}</span></span>}</div>
                    {p.last_bias != null && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">viés atual <span className={`num font-semibold ${p.last_bias > 0 ? "text-emerald-600 dark:text-emerald-400" : p.last_bias < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{p.last_bias >= 0 ? "+" : ""}{p.last_bias}</span></div>
                    )}
                    <button onClick={() => closeAsset(p.asset, p.inst_id)} disabled={busy !== null || !connected} className="mt-2 w-full rounded-md bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-50 dark:text-rose-400">{busy === "close" + p.asset ? "Fechando…" : "✕ Fechar agora"}</button>
                  </div>
                );
              })}
            </div>
          )}
          {flatAssets.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">Fora do mercado: <span className="font-medium text-foreground">{flatAssets.join(" · ")}</span></p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">Cada moeda opera sozinha (consenso de 5 timeframes; a tendência 4H+1D manda no lado). PnL ao vivo da Binance demo; “rodando” = posição aberta agora.</p>
        </div>
      )}
      </>)}

      {/* Ordens (trades, execuções, diário) · aba Ordens */}
      {tab === "ordens" && (<>
      {/* Filtros — moeda / origem / resultado / status / período (valem p/ KPIs, trades e execuções). */}
      <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filtros</span>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Moeda
            <select value={fAsset} onChange={(e) => setFAsset(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todas</option>
              {orderAssets.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem
            <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todas</option>
              <option value="auto">Robô</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado
            <select value={fResult} onChange={(e) => setFResult(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todos</option>
              <option value="win">No verde</option>
              <option value="loss">No vermelho</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="erro">Erro</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">De
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
            <button onClick={() => quickRange(1)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">Hoje</button>
            <button onClick={() => quickRange(7)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">7d</button>
            <button onClick={() => quickRange(30)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">30d</button>
            <button onClick={() => { setFFrom(""); setFTo(""); }} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">Tudo</button>
          </div>
          {filtersOn && (
            <button onClick={clearFilters} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Limpar filtros</button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{fClosedTrades.length} trades · {filtered.length} ordens{filtersOn ? " (filtradas)" : ""}</span>
        </div>
      </div>

      {/* KPIs do período filtrado — desempenho REALIZADO (trades que já fecharam) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado (período)</div>
          <div className={`num text-lg font-bold ${fRealized >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fRealized >= 0 ? "+" : ""}{num(fRealized)} {quote}</div>
          <div className="text-[11px] text-muted-foreground">{fScored} trades com resultado</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Acerto</div>
          <div className="num text-lg font-bold text-foreground">{fScored > 0 ? `${Math.round((fWins / fScored) * 100)}%` : "—"}</div>
          <div className="text-[11px] text-muted-foreground">{fWins} verdes · {fScored - fWins} vermelhos</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Soma dos ganhos ÷ soma das perdas. Acima de 1 = estratégia lucrativa no período.">Profit factor</div>
          <div className={`num text-lg font-bold ${profitFactor == null ? "text-foreground" : profitFactor >= 1 ? "text-emerald-500" : "text-rose-500"}`}>{profitFactor != null ? profitFactor.toFixed(2) : fScored > 0 ? "∞" : "—"}</div>
          <div className="text-[11px] text-muted-foreground">{avgWin != null || avgLoss != null ? <>ganho médio {avgWin != null ? `+${num(avgWin)}` : "—"} · perda média {avgLoss != null ? `−${num(avgLoss)}` : "—"}</> : "sem trades no período"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor · pior trade</div>
          <div className="num text-lg font-bold"><span className="text-emerald-500">{bestTrade?.pnl != null ? `+${num(bestTrade.pnl)}` : "—"}</span> <span className="text-muted-foreground">·</span> <span className="text-rose-500">{worstTrade?.pnl != null && worstTrade.pnl < 0 ? num(worstTrade.pnl) : "—"}</span></div>
          <div className="text-[11px] text-muted-foreground">{bestTrade ? `${bestTrade.asset} ${bestTrade.wasLong ? "long" : "short"}` : "—"} · {worstTrade && worstTrade.pnl != null && worstTrade.pnl < 0 ? `${worstTrade.asset} ${worstTrade.wasLong ? "long" : "short"}` : "—"}</div>
        </div>
      </div>

      {/* Trades encerrados — round-trips fechados (pelo robô ou por você), com resultado realizado. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Trades encerrados <span className="text-xs font-normal text-muted-foreground">· receita realizada</span></h2>
          {pnlByAsset.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {pnlByAsset.map(([a, v]) => (
                <span key={a} className={`num rounded px-1.5 py-0.5 font-semibold ${v >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>{a} {v >= 0 ? "+" : ""}{num(v)}</span>
              ))}
            </span>
          )}
        </div>
        {fClosedTrades.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{closedTrades.length === 0 ? "Nenhum trade encerrado ainda. Quando o robô sair de uma posição (ou você fechar), o resultado aparece aqui." : "Nenhum trade encerrado no filtro atual."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 font-medium">Fechado</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Direção</th><th className="px-4 py-2 text-right font-medium">Entrada → Saída</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Duração</th><th className="px-4 py-2 font-medium">Motivo</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Por</th></tr>
              </thead>
              <tbody>
                {fClosedTrades.map((t) => {
                  const pdec = pxDec(t.exit ?? t.entry);
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(t.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-2 font-semibold text-foreground">{t.asset}</td>
                      <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.wasLong ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{t.wasLong ? "long" : "short"}</span></td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right text-muted-foreground" title={t.estimated ? "≈ reconstruído da ordem de abertura (o fill do fechamento não retornou da corretora)" : undefined}>{t.estimated ? "≈ " : ""}{t.entry != null ? num(t.entry, pdec) : "—"} <span className="text-muted-foreground/50">→</span> <span className="text-foreground">{t.exit != null ? num(t.exit, pdec) : "—"}</span></td>
                      <td className="num px-4 py-2 text-right text-foreground">{t.sz != null ? num(t.sz, 6) : "—"}</td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right text-muted-foreground" title={t.openAt ? `aberto ${new Date(t.openAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : undefined}>{durLabel(t.durMin)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted-foreground" title={t.note || undefined}>{t.reason}</td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right">{t.pnl != null ? <span className={`font-semibold ${t.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`} title={t.estimated ? "≈ estimado (reconstruído da abertura)" : undefined}>{t.estimated ? "≈ " : ""}{t.pnl >= 0 ? "+" : ""}{num(t.pnl)} {quote}{t.pct != null && <span className="ml-1 text-[11px] font-normal">({t.pct >= 0 ? "+" : ""}{t.pct.toFixed(2)}%)</span>}</span> : <span className="text-muted-foreground" title="sem preço de entrada nem PnL salvos — não deu pra reconstruir">—</span>}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t.source === "auto" ? "robô" : "manual"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[10px] text-muted-foreground">Cada linha é um trade que <strong>já fechou</strong> (abriu → fechou). Entrada = preço médio (reconstruído do PnL; com <strong>≈</strong> = recuperado da ordem de abertura quando a corretora não devolveu o fill). <strong>Motivo</strong>: 🎯 alvo na liquidez · 🛡️ trailing (lucro travado) · 🛑 stop · ↩ reversão do robô · ✋ manual.</p>
          </div>
        )}
      </div>

      {/* Execuções — TODAS as ordens enviadas (robô + manuais numa tabela só; use o filtro Origem). */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Execuções <span className="text-xs font-normal text-muted-foreground">· toda ordem enviada à corretora</span></h2>
          <span className="text-[11px] text-muted-foreground">{botOrders.length} do robô · {manualOrders.length} manuais</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{orders.length ? "Nenhuma ordem no filtro atual." : "Nenhuma ordem enviada ainda."}</p>
        ) : ordersTable(filtered)}
        <p className="px-4 py-2 text-[10px] text-muted-foreground"><strong>Resultado</strong> só aparece na <strong>Saída</strong> (o lucro/prejuízo é do trade inteiro, não de cada compra/venda) — o consolidado está em “Trades encerrados” acima. Passe o mouse no <strong>Tipo</strong> pra ver a nota da ordem. PnL ao vivo das posições abertas está em “Posições abertas”.</p>
      </div>

      </>)}

      {tab === "aprendizado" && (<>
      {/* Backtester — mede a expectância da estratégia em candles reais */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">📈 Backtester · a estratégia dá lucro?</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {["BTC", "ETH", "SOL", "BNB"].map((a) => (
                <button key={a} onClick={() => setBtAsset(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${btAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">janela <input type="number" min="3" max="60" value={btDays} onChange={(e) => setBtDays(Number(e.target.value))} className="w-14 rounded border border-border bg-background px-2 py-0.5 num" /> dias</label>
            <button onClick={runBacktest} disabled={btBusy} className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50">{btBusy ? "Rodando…" : "Rodar backtest"}</button>
          </div>
        </div>
        {btResult ? (() => {
          const m = btResult.metrics, p = btResult.params;
          const hrs = m.avg_bars != null ? (m.avg_bars * 15) / 60 : null; // barras de 15m → horas
          const cards: { label: string; value: string; tone: "up" | "down" | ""; title?: string }[] = [
            { label: "Expectância (R/trade)", value: `${m.expectancy_r >= 0 ? "+" : ""}${m.expectancy_r}R`, tone: m.expectancy_r > 0 ? "up" : m.expectancy_r < 0 ? "down" : "", title: "R líquido médio por trade (1R = distância da entrada ao stop). Positivo = estratégia com edge no período." },
            { label: "Win rate", value: `${m.win_rate}%`, tone: "" },
            { label: "Profit factor", value: `${m.profit_factor}`, tone: m.profit_factor >= 1 ? "up" : "down", title: "Soma dos ganhos ÷ soma das perdas (em R). Acima de 1 = lucrativo." },
            { label: "Retorno (risco composto)", value: `${m.total_return_pct >= 0 ? "+" : ""}${m.total_return_pct}%`, tone: m.total_return_pct > 0 ? "up" : "down" },
            { label: "Max drawdown", value: `-${m.max_drawdown_pct}%`, tone: "down" },
            { label: "Trades", value: `${m.trades}`, tone: "" },
            { label: "Ganho / Perda médio", value: `+${m.avg_win_r}R / ${m.avg_loss_r}R`, tone: "" },
            { label: "Long / Short (win%)", value: `${m.longs}·${m.longs_win}% / ${m.shorts}·${m.shorts_win}%`, tone: "" },
            { label: "Exposição", value: m.exposure_pct != null ? `${m.exposure_pct}%` : "—", tone: "", title: "% do tempo com posição aberta. Baixa exposição com boa expectância = estratégia seletiva (bom)." },
            { label: "Duração média", value: hrs != null ? (hrs < 24 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(1)}d`) : "—", tone: "", title: "Tempo médio de cada trade (barras de 15m)." },
          ];
          // Curva de capital + saídas por motivo (amostra dos últimos 60 trades salvos pelo backtester)
          const eqs = btResult.equity ?? [];
          const sample = btResult.trades ?? [];
          const byReason = ["alvo", "stop", "reversão", "fim"].map((rz) => {
            const g = sample.filter((t) => t.reason === rz);
            return g.length ? { rz, n: g.length, win: Math.round((g.filter((t) => t.r > 0).length / g.length) * 100), r: Math.round(g.reduce((s, t) => s + t.r, 0) * 10) / 10 } : null;
          }).filter(Boolean) as { rz: string; n: number; win: number; r: number }[];
          const RZ_ICON: Record<string, string> = { alvo: "🎯", stop: "🛑", "reversão": "↩", fim: "🏁" };
          return (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {cards.map((c) => (
                  <div key={c.label} className="rounded-lg border border-border/70 bg-background/40 p-2.5" title={c.title}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                    <div className={`num text-lg font-bold ${c.tone === "up" ? "text-emerald-500" : c.tone === "down" ? "text-rose-500" : "text-foreground"}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              {eqs.length > 1 && (() => {
                const min = Math.min(...eqs, 1), max = Math.max(...eqs, 1);
                const W = 600, H = 64, span = max - min || 1;
                const pts = eqs.map((v, i) => `${((i / (eqs.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(" ");
                const fin = eqs[eqs.length - 1];
                const y1 = H - ((1 - min) / span) * H; // linha do capital inicial (1.0)
                return (
                  <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Curva de capital (risco composto, trade a trade)</span>
                      <span className={`num font-bold normal-case ${fin >= 1 ? "text-emerald-500" : "text-rose-500"}`}>{fin >= 1 ? "+" : ""}{((fin - 1) * 100).toFixed(1)}%</span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
                      <line x1="0" y1={y1} x2={W} y2={y1} stroke="currentColor" className="text-border" strokeDasharray="4 4" strokeWidth="1" />
                      <polyline points={pts} fill="none" stroke={fin >= 1 ? "#10b981" : "#f43f5e"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </div>
                );
              })()}
              {byReason.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">Saídas</span>
                  {byReason.map((b) => (
                    <span key={b.rz} className={`num rounded px-1.5 py-0.5 font-semibold ${b.r >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`} title={`${b.n} trades fechados por ${b.rz} · ${b.win}% no verde · soma ${b.r >= 0 ? "+" : ""}${b.r}R`}>{RZ_ICON[b.rz]} {b.rz} {b.n} · {b.win}% · {b.r >= 0 ? "+" : ""}{b.r}R</span>
                  ))}
                  <span className="text-muted-foreground">(últimos {sample.length} trades)</span>
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">{p.asset} · {p.days}d · motor <strong>{p.engine ?? "SMC 15m"}</strong> · entrada {p.entry_mode ?? "smc"} · imbalance {p.imbalance}{p.imb_mode ? ` (${p.imb_mode})` : ""} · stop {p.stop} · alvo {p.target} · trailing {p.trailing}{p.trail_floor ? ` (piso ${p.trail_floor})` : ""} · técnico {p.ta_filter ?? "off"}{p.ta_scope ? `/${p.ta_scope}` : ""} · reversão {p.rev_mode ?? "off"} · risco {p.risk_pct}% · taxa+slip {p.fee_pct}+{p.slip_pct}%/lado · <strong>fluxo neutro (não backtestável)</strong>; fills no fechamento do candle. Educacional — não garante o futuro.</p>
            </>
          );
        })() : (
          <p className="text-sm text-muted-foreground">Escolha a moeda e a janela e clique <strong>Rodar backtest</strong> — o MESMO motor do robô roda sobre candles reais e mede se a estratégia teria dado lucro: <strong>expectância em R</strong>, win rate, profit factor e drawdown. Leva ~5-15s.</p>
        )}
      </div>

      {/* Aprendizado do robô · aba Aprendizado */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">🧠 Aprendizado do robô</h2>
          <button onClick={runLearn} disabled={busy !== null} className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50">{busy === "learn" ? "Analisando…" : "Gerar diagnóstico"}</button>
        </div>
        {learning?.data ? (() => {
          const d = learning.data!;
          const assetKeys = Object.keys(d.byAsset ?? {}).sort();
          const cur = learnAsset === "all" ? null : d.byAsset?.[learnAsset];
          // Geral usa overall + perSignal global; por-moeda usa o breakdown do ativo.
          const stat = learnAsset === "all" ? { hitRate: d.overall.hitRate, n: d.overall.n } : cur ? { hitRate: cur.hitRate, n: cur.n } : null;
          // Ordena do que mais ajuda pro que mais atrapalha (desempate: mais amostras primeiro).
          const sigs = (learnAsset === "all" ? d.perSignal : cur?.perSignal ?? []).slice().sort((a, b) => b.hitRate - a.hitRate || b.n - a.n);
          const report = learnAsset === "all" ? learning.ai_report : cur?.ai_report ?? null;
          return (
            <>
              {/* Seletor de moeda do aprendizado (Geral + cada ativo com amostra) */}
              <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5 w-fit">
                <button onClick={() => setLearnAsset("all")} className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${learnAsset === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Geral</button>
                {assetKeys.map((a) => (
                  <button key={a} onClick={() => setLearnAsset(a)} className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${learnAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a} <span className="opacity-60">{d.byAsset[a].hitRate}%</span></button>
                ))}
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground">
                {learnAsset === "all" ? "Acerto direcional do viés (geral" : `Acerto do viés em ${learnAsset} (`}{d.window}): {stat ? <><span className={`num font-bold ${stat.hitRate >= 52 ? "text-emerald-500" : stat.hitRate <= 48 ? "text-rose-500" : "text-foreground"}`}>{stat.hitRate}%</span> em {stat.n} amostras</> : "amostra insuficiente"}{learnAsset === "all" ? <> · {d.labeled} leituras rotuladas</> : null}
              </div>
              {sigs.length > 0 ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {sigs.map((s) => {
                    const good = s.hitRate >= 55, bad = s.hitRate <= 45;
                    return (
                      <div key={s.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-36 shrink-0 truncate text-muted-foreground" title={s.label}>{s.label}</span>
                        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="absolute inset-y-0 left-1/2 z-10 w-px bg-background/80" />
                          <span className={`absolute inset-y-0 left-0 ${good ? "bg-emerald-500" : bad ? "bg-rose-500" : "bg-muted-foreground/50"}`} style={{ width: `${s.hitRate}%` }} />
                        </span>
                        <span className={`num w-9 text-right font-semibold ${good ? "text-emerald-500" : bad ? "text-rose-500" : "text-muted-foreground"}`}>{s.hitRate}%</span>
                        <span className="num w-16 text-right text-muted-foreground/70" title={`${s.n} amostras rotuladas · peso ${s.weight} no viés${s.edge != null ? ` · edge ${s.edge >= 0 ? "+" : ""}${s.edge} (acerto − 50%)` : ""}`}>n{s.n} · p{s.weight}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Ainda sem acerto por sinal para {learnAsset === "all" ? "o geral" : learnAsset} — precisa de mais leituras rotuladas nessa moeda.</p>
              )}
              {report && (
                <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs">
                  <Markdown text={report} />
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">Rotula cada leitura com o que o preço fez ~1h depois → mede quantas vezes cada sinal acertou a direção, <strong>por moeda</strong>. &gt;55% ajuda, &lt;45% atrapalha (contrário). Amostra ainda pequena; melhora conforme o robô roda. Atualizado {new Date(learning.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</p>
            </>
          );
        })() : (
          <p className="text-sm text-muted-foreground">Sem diagnóstico ainda. Clique em <strong>Gerar diagnóstico</strong> — o robô analisa o próprio histórico de leituras e mede o acerto de cada sinal, separado por moeda.</p>
        )}
      </div>

      {/* Diário do robô — histórico de leituras/decisões (aba Aprendizado: é a matéria-prima do que o robô aprende) */}
      {logs.length > 0 && (() => {
        const dAssets = [...new Set(logs.map((l) => l.message.match(/^\[(\w+)\]/)?.[1]).filter(Boolean))].sort() as string[];
        const rows = logs.filter((l) => (dLevel === "all" || l.level === dLevel) && (dAssetF === "all" || l.message.startsWith(`[${dAssetF}]`)));
        return (
          <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Diário do robô</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                  {["all", "trade", "info", "warn", "error"].map((lv) => (
                    <button key={lv} onClick={() => setDLevel(lv)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dLevel === lv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{lv === "all" ? "todos" : lv}</button>
                  ))}
                </div>
                {dAssets.length > 1 && (
                  <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
                    <button onClick={() => setDAssetF("all")} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dAssetF === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>todas</button>
                    {dAssets.map((a) => (
                      <button key={a} onClick={() => setDAssetF(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${dAssetF === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground">{rows.length} de {logs.length}</span>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nada no filtro atual (o diário guarda as últimas {logs.length} entradas carregadas).</p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${LOG_TONE[l.level] ?? LOG_TONE.info}`}>{l.level}</span>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-foreground">{l.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      </>)}

      {/* Conexão (chaves) · aba Configuração */}
      {tab === "config" && (
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <button onClick={() => setShowKeys((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
          <span>{isBinance ? "Conexão Binance (Testnet)" : "Conexão OKX (Demo)"} {connected && <span className="ml-1 text-[11px] font-normal text-emerald-500">· conectada</span>}</span>
          <span className="text-muted-foreground">{showKeys ? "▲" : "▼"}</span>
        </button>
        {showKeys && (
          <div className="mt-3">
            <div className={`grid gap-2 ${isBinance ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              <input className={input} placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              <input className={input} placeholder="API Secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
              {!isBinance && <input className={input} placeholder="Passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
            </div>
            <button onClick={saveKeys} disabled={busy !== null} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy === "keys" ? "Salvando…" : "Salvar chaves"}</button>
            {isBinance
              ? <p className="mt-2 text-[11px] text-muted-foreground">Chaves do <strong>Binance Futures Testnet</strong> (testnet.binancefuture.com) — dinheiro fake, sem KYC. Cole a API Key e a Secret.</p>
              : <p className="mt-2 text-[11px] text-muted-foreground">Chaves do <strong>Demo Trading</strong> da OKX (não as reais). Permissão de <strong>Trade</strong>; nunca saque; sem restrição de IP.</p>}
          </div>
        )}
      </div>
      )}

      {/* Ordem manual (avançado) · aba Ordens */}
      {tab === "ordens" && (
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <button onClick={() => setShowManual((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
          <span>Ordem manual (avançado)</span>
          <span className="text-muted-foreground">{showManual ? "▲" : "▼"}</span>
        </button>
        {showManual && cfg && (
          <div className="mt-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select className={input} value={mSide} onChange={(e) => setMSide(e.target.value as "buy" | "sell")}><option value="buy">Comprar</option><option value="sell">Vender</option></select>
              <select className={input} value={mOrdType} onChange={(e) => setMOrdType(e.target.value as "market" | "limit")}><option value="market">A mercado</option><option value="limit">Limite</option></select>
              <input className={input} placeholder={isFut ? "Tamanho em USDT (ex.: 50)" : mSide === "buy" ? `Tamanho em ${cfg.quote_ccy} (ex.: 50)` : `Tamanho em ${cfg.base_ccy} (ex.: 0.001)`} value={mSz} onChange={(e) => setMSz(e.target.value)} />
              <input className={input} placeholder="Preço (limite)" value={mPx} onChange={(e) => setMPx(e.target.value)} disabled={mOrdType !== "limit"} />
            </div>
            <button onClick={placeManual} disabled={busy !== null || !connected} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">{busy === "manual" ? "Enviando…" : `Enviar ${mSide === "buy" ? "compra" : "venda"} de ${cfg.inst_id} (demo)`}</button>
            <p className="mt-2 text-[11px] text-muted-foreground">{isFut ? `Futuros demo (${cfg.inst_id}). Tamanho em USDT (nocional); Comprar = abrir/aumentar long, Vender = abrir/aumentar short.` : `Spot demo. Compra a mercado: tamanho em ${cfg.quote_ccy}; venda: na moeda base.`} Tudo fake.</p>
          </div>
        )}
      </div>
      )}
    </section>
  );
}
