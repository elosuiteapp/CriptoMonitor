import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UTCTimestamp } from "lightweight-charts";

import BotChart, { type BotCandle, type BotMarker, type BotPriceLine } from "../../components/admin/BotChart";
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
  trail_pct: number;     // distância do trailing (%) — fallback quando não há ATR
  trail_atr_mult: number; // distância do trailing = k × ATR do ativo (adaptativo)
  stop_atr_on: boolean;  // stop de risco por ATR (senão, % fixo)
  stop_atr_mult: number; // distância do stop de risco = k × ATR do ativo
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
interface Reading {
  bias: number;
  conviction: number;
  signals: ReadingSig[];
  spot?: number;
  desired?: string;
  structure?: { consensus?: { bull: number; bear: number; total: number }; perTf?: { tf: string; bias: number; structure?: number; pressure?: number; swing: string | null }[]; flowTilt?: number; zone?: string | null; regime?: string; trendBias?: number; gammaRegime?: string; counter?: boolean } | null;
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

const BARS = ["15m", "1H", "4H", "1D"];
const SIG_GROUPS = ["Estrutura por TF", "Microestrutura", "Fluxo", "Opções", "Institucional"];
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
  const [positions, setPositions] = useState<BotPosition[]>([]);
  const [livePos, setLivePos] = useState<Record<string, { uPnl: number; markPx: number }>>({});
  const [learning, setLearning] = useState<Learning | null>(null);
  const [selAsset, setSelAsset] = useState("BTC"); // moeda em foco no painel (leitura + gráfico)
  const [tab, setTab] = useState<"grafico" | "ordens" | "aprendizado" | "config">("grafico"); // aba do módulo do robô
  const [learnAsset, setLearnAsset] = useState("all"); // moeda em foco no aprendizado (all = geral)
  // filtros das ordens (moeda / status / período)
  const [fAsset, setFAsset] = useState("all");
  const [fStatus, setFStatus] = useState("all"); // all | ok | erro
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
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("bot_positions").select("asset, inst_id, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, last_bias, last_conviction, last_decision, last_reading").order("asset"),
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
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("bot_positions").select("asset, inst_id, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, last_bias, last_conviction, last_decision, last_reading").order("asset"),
    ]);
    if (c) setCfg((prev) => (prev ? { ...(c as Config), inst_id: prev.inst_id, base_ccy: prev.base_ccy, quote_ccy: prev.quote_ccy, bar: prev.bar, order_quote_sz: prev.order_quote_sz, leverage: prev.leverage, buy_threshold: prev.buy_threshold, sell_threshold: prev.sell_threshold, pyramid: prev.pyramid, pyramid_max: prev.pyramid_max, min_votes: prev.min_votes, stop_pct: prev.stop_pct, ct_stop_pct: prev.ct_stop_pct, counter_trend: prev.counter_trend, auto_weight: prev.auto_weight, trail_on: prev.trail_on, trail_pct: prev.trail_pct } : (c as Config)));
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
      const cs: BotCandle[] = rows.map((x) => ({ time: Math.floor(Number(x[0]) / 1000) as UTCTimestamp, open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
      setCandles(cs);
    } catch {
      if (token === chartReqRef.current) setCandles([]);
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
    return orders
      .filter((o) => o.ok && o.side && o.inst_id === selInst)
      .map((o) => {
        const t = Math.floor(new Date(o.created_at).getTime() / 1000);
        let bar = times[0];
        for (const tt of times) { if (tt <= t) bar = tt; else break; }
        const kind: BotMarker["kind"] = o.action === "close" ? "exit" : o.action === "add" ? "add" : "entry";
        const text = kind === "exit" ? "Saída" : kind === "add" ? "+" : o.side === "buy" ? "C" : "V";
        return { time: bar as UTCTimestamp, side: o.side as "buy" | "sell", kind, text };
      });
  }, [orders, candles, selInst]);

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
  }

  // Posições ABERTAS agora (net por ativo) + as que estão fora do mercado.
  const openPositions = positions.filter((p) => p.position !== "flat");
  const flatAssets = positions.filter((p) => p.position === "flat").map((p) => p.asset);
  // PnL ao vivo somado (só das posições que a Binance devolveu).
  const openPnl = openPositions.reduce((s, p) => { const l = p.inst_id ? livePos[p.inst_id] : undefined; return l ? s + l.uPnl : s; }, 0);
  const hasLivePnl = openPositions.some((p) => p.inst_id && livePos[p.inst_id]);

  // TRADES ENCERRADOS: cada ordem de fechamento (action='close', ok) é um round-trip fechado.
  // O PnL realizado já vem salvo; a entrada média é reconstruída: entry = saída − PnL/(tam·direção).
  const closedTrades = orders
    .filter((o) => o.action === "close" && o.ok)
    .map((o) => {
      const asset = o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "—";
      const wasLong = o.side === "sell"; // fechou LONG vendendo; SHORT comprando
      const dir = wasLong ? 1 : -1;
      const exit = o.avg_px != null ? Number(o.avg_px) : null;
      const sz = o.sz != null && o.sz !== "" ? Number(o.sz) : null;
      const pnl = o.pnl != null ? Number(o.pnl) : null;
      const entry = exit != null && sz && pnl != null && sz !== 0 ? exit - pnl / (sz * dir) : null;
      const pct = entry && entry !== 0 && exit != null ? ((exit - entry) / entry) * 100 * dir : null;
      return { id: o.id, asset, wasLong, entry, exit, sz, pnl, pct, source: o.source, at: o.created_at };
    });
  const realizedSum = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const scored = closedTrades.filter((t) => t.pnl != null).length;
  const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0).length;

  // ── FILTROS (moeda / status / período) aplicados às ordens e aos trades ──
  const assetOf = (o: OrderRow) => (o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "");
  const orderAssets = [...new Set(orders.map(assetOf).filter(Boolean))].sort();
  const inPeriod = (iso: string) => {
    const t = new Date(iso).getTime();
    if (fFrom && t < new Date(fFrom + "T00:00:00").getTime()) return false;
    if (fTo && t > new Date(fTo + "T23:59:59").getTime()) return false;
    return true;
  };
  const matchOrder = (o: OrderRow) =>
    (fAsset === "all" || assetOf(o) === fAsset) &&
    (fStatus === "all" || (fStatus === "ok" ? o.ok : !o.ok)) &&
    inPeriod(o.created_at);
  const filtered = orders.filter(matchOrder);
  const botOrders = filtered.filter((o) => o.source === "auto");
  const manualOrders = filtered.filter((o) => o.source !== "auto");
  const sumPnl = (rows: OrderRow[]) => rows.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const hasPnl = (rows: OrderRow[]) => rows.some((o) => o.pnl != null);
  const fClosedTrades = closedTrades.filter((t) => (fAsset === "all" || t.asset === fAsset) && inPeriod(t.at));
  const fRealized = fClosedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const fWins = fClosedTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const fScored = fClosedTrades.filter((t) => t.pnl != null).length;
  const filtersOn = fAsset !== "all" || fStatus !== "all" || !!fFrom || !!fTo;
  const clearFilters = () => { setFAsset("all"); setFStatus("all"); setFFrom(""); setFTo(""); };

  // Tabela de execuções reusável (mesmo layout p/ robô e manual).
  const ordersTable = (rows: OrderRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Lado</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Preço</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Situação</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr>
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
                <td className="px-4 py-2 text-[11px] text-muted-foreground">{tipo}</td>
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
          <div className="text-[11px] text-muted-foreground">{cfg ? `${isFut ? `Futuros ${cfg.leverage}x` : "Spot"} · limiar ±${cfg.buy_threshold}` : ""}</div>
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
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">Par (instId)
              <input className={`${input} mt-1`} value={cfg.inst_id} onChange={(e) => setCfg({ ...cfg, inst_id: e.target.value.toUpperCase(), base_ccy: e.target.value.toUpperCase().split("-")[0] || cfg.base_ccy, quote_ccy: e.target.value.toUpperCase().split("-")[1] || cfg.quote_ccy })} />
            </label>
            <label className="text-xs text-muted-foreground">{isFut ? "Margem por ordem" : "Tamanho da compra"} ({cfg.quote_ccy})
              <input type="number" className={`${input} mt-1`} value={cfg.order_quote_sz} onChange={(e) => setCfg({ ...cfg, order_quote_sz: Number(e.target.value) })} />
            </label>
            {isFut && (
              <label className="text-xs text-muted-foreground">Alavancagem (x)
                <input type="number" min="1" className={`${input} mt-1`} value={cfg.leverage} onChange={(e) => setCfg({ ...cfg, leverage: Number(e.target.value) })} />
              </label>
            )}
            <label className="text-xs text-muted-foreground">Sensibilidade (limiar de viés ±)
              <input type="number" className={`${input} mt-1`} value={cfg.buy_threshold} onChange={(e) => setCfg({ ...cfg, buy_threshold: Number(e.target.value), sell_threshold: Number(e.target.value) })} />
            </label>
            <label className="text-xs text-muted-foreground">Consenso mínimo (TFs p/ abrir · de 5)
              <input type="number" min="1" max="5" className={`${input} mt-1`} value={cfg.min_votes ?? 3} onChange={(e) => setCfg({ ...cfg, min_votes: Number(e.target.value) })} />
            </label>
            {isFut && (
              <label className="text-xs text-muted-foreground">Stop de risco (%)
                <input type="number" step="0.1" min="0" className={`${input} mt-1`} value={cfg.stop_pct ?? 1.5} onChange={(e) => setCfg({ ...cfg, stop_pct: Number(e.target.value) })} />
              </label>
            )}
            {isFut && (
              <label className="text-xs text-muted-foreground">Contra a tendência (4H+1D)
                <select className={`${input} mt-1`} value={cfg.counter_trend ?? "tight"} onChange={(e) => setCfg({ ...cfg, counter_trend: e.target.value })}>
                  <option value="tight">Permitir com stop curto</option>
                  <option value="block">Bloquear (só a favor)</option>
                </select>
              </label>
            )}
            {isFut && (cfg.counter_trend ?? "tight") !== "block" && (
              <label className="text-xs text-muted-foreground">Stop curto (contra-tendência · %)
                <input type="number" step="0.1" min="0" className={`${input} mt-1`} value={cfg.ct_stop_pct ?? 0.6} onChange={(e) => setCfg({ ...cfg, ct_stop_pct: Number(e.target.value) })} />
              </label>
            )}
            {isFut && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" checked={!!cfg.pyramid} onChange={(e) => setCfg({ ...cfg, pyramid: e.target.checked })} className="h-4 w-4 rounded border-border" />
                <span><strong>Pirâmide</strong>: adicionar à posição quando vier novo sinal na MESMA direção</span>
                {cfg.pyramid && (
                  <span className="flex items-center gap-1">· máx <input type="number" min="1" max="10" value={cfg.pyramid_max ?? 2} onChange={(e) => setCfg({ ...cfg, pyramid_max: Number(e.target.value) })} className="w-14 rounded border border-border bg-background px-2 py-0.5 num" /> adições</span>
                )}
              </label>
            )}
            {isFut && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" checked={!!cfg.trail_on} onChange={(e) => setCfg({ ...cfg, trail_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                <span><strong>Stop móvel (trailing) por ATR</strong>: o stop sobe junto com o maior preço desde a entrada e nunca desce — trava o lucro se o preço voltar. A distância é <strong>k × ATR</strong> (a volatilidade do próprio ativo), com piso de estrutura — assim cada moeda tem a trilha na sua escala (1% do BTC ≠ 1% de um alt). Arma só no lucro.</span>
                {cfg.trail_on && (
                  <span className="flex items-center gap-1">· trava <input type="number" step="0.5" min="0.5" value={cfg.trail_atr_mult ?? 3} onChange={(e) => setCfg({ ...cfg, trail_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR abaixo do pico</span>
                )}
              </label>
            )}
            {isFut && (
              <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" checked={!!cfg.stop_atr_on} onChange={(e) => setCfg({ ...cfg, stop_atr_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
                <span><strong>Stop de risco por ATR</strong>: usa a volatilidade do ativo em vez do % fixo — cada moeda ganha um stop na sua escala (a contra-tendência entra pela metade da distância). Desligado, valem os campos de % acima.</span>
                {cfg.stop_atr_on && (
                  <span className="flex items-center gap-1">· distância <input type="number" step="0.5" min="0.5" value={cfg.stop_atr_mult ?? 4} onChange={(e) => setCfg({ ...cfg, stop_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR</span>
                )}
              </label>
            )}
            <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <input type="checkbox" checked={!!cfg.auto_weight} onChange={(e) => setCfg({ ...cfg, auto_weight: e.target.checked })} className="h-4 w-4 rounded border-border" />
              <span><strong>Auto-ponderar por moeda</strong>: usa o que o robô aprendeu em CADA ativo p/ pesar os sinais (estrutura pesada onde acerta, leve onde erra). Trava anti-overfit: só age com amostra ≥20, ajuste cresce devagar e limitado. <em>Deixe desligado até o aprendizado amadurecer.</em></span>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => saveConfig({ inst_id: cfg.inst_id, base_ccy: cfg.base_ccy, quote_ccy: cfg.quote_ccy, order_quote_sz: cfg.order_quote_sz, buy_threshold: cfg.buy_threshold, sell_threshold: cfg.sell_threshold, leverage: cfg.leverage, pyramid: cfg.pyramid, pyramid_max: cfg.pyramid_max, min_votes: cfg.min_votes, stop_pct: cfg.stop_pct, ct_stop_pct: cfg.ct_stop_pct, counter_trend: cfg.counter_trend, auto_weight: cfg.auto_weight, trail_on: cfg.trail_on, trail_pct: cfg.trail_pct, trail_atr_mult: cfg.trail_atr_mult, stop_atr_on: cfg.stop_atr_on, stop_atr_mult: cfg.stop_atr_mult })} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "cfg" ? "Salvando…" : "Salvar config"}
            </button>
            <span className="text-[11px] text-muted-foreground">Estratégia: <strong>Smart Money + fluxo</strong>, ciente de tendência (daytrade). Estrutura SMC em <strong>5 timeframes</strong> (15m/30m/1H/4H/1D) — swing/BOS/CHoCH, zonas, order blocks e FVG. **Gatilho: consenso ≥ {cfg.min_votes ?? 3}/5** (o 15/30/1H já dispara); o <strong>4H manda na tendência</strong> (1D só reforça). <strong>Regime de gamma</strong>: γ positivo (pinning) → estrutura pesa menos e contra-tendência/reversão fica mais fácil; γ negativo → solta o trend. Fluxo que confirma/veta, por relevância: <strong>divergência de CVD (institucional × varejo)</strong>, book institucional, paredes/absorção, gamma-wall, liquidações, ETF (book varejo, CVD agregado, prêmio Coinbase e pressão-tendência entram com peso baixo — ruidosos). Zona só vira viés com confirmação. <strong>Stop de risco</strong> em toda posição; pirâmide só no lucro e a favor.</span>
          </div>
        </div>
      )}

      {/* Gráfico, leitura e posições · aba Gráfico */}
      {tab === "grafico" && (<>
      {/* Leitura do robô (fluxo) — da moeda em foco (seletor no cabeçalho do gráfico) */}
      {selReading && (() => {
        const r = selReading;
        const bias = r.bias;
        const bc = bias >= 15 ? "text-emerald-500" : bias <= -15 ? "text-rose-500" : "text-muted-foreground";
        return (
          <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">🧠 Leitura do robô · {selAsset} · Smart Money + fluxo</h2>
              <span className="text-[11px] text-muted-foreground">{cfg?.last_run ? `atualizado ${new Date(cfg.last_run).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            </div>
            {r.structure && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">Por timeframe</span>
                {r.structure.regime && (
                  <span className={`rounded px-1.5 py-0.5 font-bold ${r.structure.regime === "up" ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : r.structure.regime === "down" ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`} title="Tendência — o 4H manda (o 1D só reforça). Define o lado a favor/contra.">tendência: {r.structure.regime === "up" ? "ALTA" : r.structure.regime === "down" ? "BAIXA" : "range"}{typeof r.structure.trendBias === "number" ? ` (${r.structure.trendBias >= 0 ? "+" : ""}${r.structure.trendBias})` : ""}</span>
                )}
                {r.structure.gammaRegime && r.structure.gammaRegime !== "neutral" && (
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${r.structure.gammaRegime === "negative" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`} title={r.structure.gammaRegime === "positive" ? "Gamma positivo: dealers amortecem (pinning/reversão) — estrutura pesa menos, contra-tendência mais fácil" : "Gamma negativo: amplifica (tendência) — estrutura pesa mais, breakout solto"}>γ {r.structure.gammaRegime === "positive" ? "positivo (reversão)" : "negativo (tendência)"}</span>
                )}
                {r.structure.consensus && (
                  <span className="text-muted-foreground">consenso: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{r.structure.consensus.bull}↑</span> · <span className="font-semibold text-rose-600 dark:text-rose-400">{r.structure.consensus.bear}↓</span> de {r.structure.consensus.total}</span>
                )}
                {r.structure.perTf?.map((t) => (
                  <span key={t.tf} title={t.structure != null && t.pressure != null ? `placar = estrutura ${t.structure} + pressão do book ${t.pressure >= 0 ? "+" : ""}${t.pressure}` : undefined} className={`num rounded px-1.5 py-0.5 font-semibold ${t.bias >= 12 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : t.bias <= -12 ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`}>{t.tf} {t.bias >= 0 ? "+" : ""}{t.bias}</span>
                ))}
                {typeof r.structure.flowTilt === "number" && (
                  <span className="text-muted-foreground" title="Fluxo compartilhado (CVD, gamma, ETF, paredes, absorção). Não dispara sozinho — CONFIRMA e veta a entrada se estiver forte contra.">confirmação (fluxo): <span className={`num font-semibold ${r.structure.flowTilt > 8 ? "text-emerald-600 dark:text-emerald-400" : r.structure.flowTilt < -8 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{r.structure.flowTilt >= 0 ? "+" : ""}{r.structure.flowTilt}</span></span>
                )}
                {r.structure.zone && <span className="text-muted-foreground">zona: <span className="text-foreground">{r.structure.zone}</span></span>}
                {r.structure.counter && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-600 dark:text-amber-400" title="Entrada contra a tendência do 4H/1D: stop curto e tamanho reduzido">⚠ contra-tendência</span>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Viés líquido</div>
                <div className={`num text-2xl font-bold ${bc}`}>{bias >= 0 ? "+" : ""}{bias}</div>
                <div className="relative mt-1 h-1.5 rounded-full bg-muted/50">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                  <div className={`absolute top-0 h-full rounded-full ${bias >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={bias >= 0 ? { left: "50%", width: `${Math.abs(bias) / 2}%` } : { right: "50%", width: `${Math.abs(bias) / 2}%` }} />
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Convicção</div>
                <div className="num text-2xl font-bold text-foreground">{r.conviction}%</div>
                <div className="text-[10px] text-muted-foreground">forças no mesmo lado</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Decisão</div>
                {(() => { const d = selPos?.last_decision ?? cfg?.last_decision; return <div className={`text-2xl font-bold ${d === "buy" || d === "long" ? "text-emerald-500" : d === "sell" || d === "short" ? "text-rose-500" : "text-foreground"}`}>{decisionLabel(d)}</div>; })()}
                <div className="text-[10px] text-muted-foreground">limiar ±{cfg?.buy_threshold ?? 15} · consenso {cfg?.min_votes ?? 3}/{selReading.structure?.consensus?.total ?? 4}</div>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {SIG_GROUPS.map((grp) => {
                const items = r.signals.filter((s) => s.group === grp);
                if (!items.length) return null;
                return (
                  <div key={grp}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{grp}</div>
                    <div className="space-y-1">
                      {items.map((s) => (
                        <div key={s.key} className="flex items-center gap-2 text-xs">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.score > 8 ? "bg-emerald-500" : s.score < -8 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                          <span className="w-40 shrink-0 truncate text-foreground" title={s.label}>{s.label}</span>
                          <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block" title={s.note}>{s.note}</span>
                          <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-muted/50">
                            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                            <div className={`absolute top-0 h-full rounded-full ${s.score >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={s.score >= 0 ? { left: "50%", width: `${Math.abs(s.score) / 2}%` } : { right: "50%", width: `${Math.abs(s.score) / 2}%` }} />
                          </div>
                          <span className={`num w-8 shrink-0 text-right ${s.score >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{s.score >= 0 ? "+" : ""}{s.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Cada sinal pontua −100 (baixa) a +100 (alta) com peso; o viés é a média ponderada. Dados coletados pela plataforma, atualizados a cada ~5 min. Educacional — não é recomendação.</p>
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
            <button onClick={refresh} disabled={busy !== null || !connected} className="rounded-lg border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">{busy === "refresh" ? "…" : "Atualizar"}</button>
          </div>
        </div>
        {connected && candles.length > 0 ? (
          <BotChart candles={candles} markers={markers} priceLines={priceLines} decimals={dec} fitKey={`${selInst}-${cfg?.bar ?? ""}`} />
        ) : (
          <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">{connected ? "Carregando velas…" : "Conecte a OKX para ver o gráfico."}</div>
        )}
      </div>

      {/* Resumo da conta — quanto está rendendo agora e o que já foi realizado */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Resumo da conta (demo)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado realizado (recente)</div>
            <div className={`num text-2xl font-bold ${scored === 0 ? "text-muted-foreground" : realizedSum >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{scored ? `${realizedSum >= 0 ? "+" : ""}${num(realizedSum)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{scored ? `${wins}/${scored} trades no verde` : "sem trades fechados ainda"}</div>
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

      {/* Ordens (trades, robô, manuais, diário) · aba Ordens */}
      {tab === "ordens" && (<>
      {/* Filtros das ordens — moeda / status / período (valem p/ trades e p/ as ordens abaixo). */}
      <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filtros</span>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Moeda
            <select value={fAsset} onChange={(e) => setFAsset(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todas</option>
              {orderAssets.map((a) => <option key={a} value={a}>{a}</option>)}
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
          {filtersOn && (
            <button onClick={clearFilters} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Limpar filtros</button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} de {orders.length} ordens{filtersOn ? " (filtradas)" : ""}</span>
        </div>
      </div>

      {/* Trades encerrados — round-trips fechados (pelo robô ou por você), com resultado realizado. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Trades encerrados <span className="text-xs font-normal text-muted-foreground">· receita realizada</span></h2>
          {fScored > 0 && (
            <span className="text-[11px] text-muted-foreground">{fWins}/{fScored} no verde · resultado <span className={`num font-semibold ${fRealized >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fRealized >= 0 ? "+" : ""}{num(fRealized)} {quote}</span></span>
          )}
        </div>
        {fClosedTrades.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{closedTrades.length === 0 ? "Nenhum trade encerrado ainda. Quando o robô sair de uma posição (ou você fechar), o resultado aparece aqui." : "Nenhum trade encerrado no filtro atual."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 font-medium">Fechado</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Direção</th><th className="px-4 py-2 text-right font-medium">Entrada → Saída</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Por</th></tr>
              </thead>
              <tbody>
                {fClosedTrades.map((t) => {
                  const pdec = pxDec(t.exit);
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(t.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-2 font-semibold text-foreground">{t.asset}</td>
                      <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.wasLong ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{t.wasLong ? "long" : "short"}</span></td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right text-muted-foreground">{t.entry != null ? num(t.entry, pdec) : "—"} <span className="text-muted-foreground/50">→</span> <span className="text-foreground">{t.exit != null ? num(t.exit, pdec) : "—"}</span></td>
                      <td className="num px-4 py-2 text-right text-foreground">{t.sz != null ? num(t.sz, 6) : "—"}</td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right">{t.pnl != null ? <span className={`font-semibold ${t.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{t.pnl >= 0 ? "+" : ""}{num(t.pnl)} {quote}{t.pct != null && <span className="ml-1 text-[11px] font-normal">({t.pct >= 0 ? "+" : ""}{t.pct.toFixed(2)}%)</span>}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t.source === "auto" ? "robô" : "manual"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[10px] text-muted-foreground">Cada linha é um trade que <strong>já fechou</strong> (abriu → fechou). Entrada = preço médio reconstruído do resultado; % = variação do preço a favor da posição.</p>
          </div>
        )}
      </div>

      {/* Ordens do robô — só as execuções automáticas (source=auto). */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">robô</span>Ordens do robô</h2>
          <span className="text-[11px] text-muted-foreground">{botOrders.length} ordens{hasPnl(botOrders) ? <> · receita realizada <span className={`num font-semibold ${sumPnl(botOrders) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{sumPnl(botOrders) >= 0 ? "+" : ""}{num(sumPnl(botOrders))} {quote}</span></> : null}</span>
        </div>
        {botOrders.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{orders.some((o) => o.source === "auto") ? "Nenhuma ordem do robô no filtro atual." : "O robô ainda não enviou ordens."}</p>
        ) : ordersTable(botOrders)}
        <p className="px-4 py-2 text-[10px] text-muted-foreground"><strong>Receita</strong> só aparece na <strong>Saída</strong> (o lucro/prejuízo é do trade inteiro, não de cada compra/venda). PnL ao vivo das posições abertas está em “Posições abertas”.</p>
      </div>

      {/* Ordens manuais — só as que você enviou à mão (source=manual). */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">manual</span>Ordens manuais</h2>
          <span className="text-[11px] text-muted-foreground">{manualOrders.length} ordens{hasPnl(manualOrders) ? <> · receita realizada <span className={`num font-semibold ${sumPnl(manualOrders) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{sumPnl(manualOrders) >= 0 ? "+" : ""}{num(sumPnl(manualOrders))} {quote}</span></> : null}</span>
        </div>
        {manualOrders.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{orders.some((o) => o.source !== "auto") ? "Nenhuma ordem manual no filtro atual." : "Você ainda não enviou nenhuma ordem manual (use “Ordem manual (avançado)” no fim da página)."}</p>
        ) : ordersTable(manualOrders)}
      </div>

      {/* Diário do robô · aba Ordens */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Diário do robô</h2>
          <div className="space-y-1.5">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${LOG_TONE[l.level] ?? LOG_TONE.info}`}>{l.level}</span>
                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-foreground">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}

      {/* Aprendizado do robô · aba Aprendizado */}
      {tab === "aprendizado" && (
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
          const sigs = learnAsset === "all" ? d.perSignal : cur?.perSignal ?? [];
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
                        <span className="num w-14 text-right text-muted-foreground/70">n{s.n}·{s.weight}</span>
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
      )}

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
