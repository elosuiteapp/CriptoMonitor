import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { UTCTimestamp } from "lightweight-charts";

import { type BotCandle, type BotMarker, type BotPriceLine, type BotSub } from "../../components/admin/BotChart";
import BotReadingPanel from "../../components/admin/bot/BotReadingPanel";
import BotChartSection from "../../components/admin/bot/BotChartSection";
import RobotScoreboard from "../../components/admin/bot/RobotScoreboard";
import BlockAccuracy from "../../components/admin/bot/BlockAccuracy";
import AccountSummary from "../../components/admin/bot/AccountSummary";
import OpenPositions from "../../components/admin/bot/OpenPositions";
import OrdersFilters from "../../components/admin/bot/OrdersFilters";
import ClosedTradesTable from "../../components/admin/bot/ClosedTradesTable";
import ExecutionsTable from "../../components/admin/bot/ExecutionsTable";
import ManualOrder from "../../components/admin/bot/ManualOrder";
import Backtester from "../../components/admin/bot/Backtester";
import LearningPanel from "../../components/admin/bot/LearningPanel";
import BotJournal from "../../components/admin/bot/BotJournal";
import { supabase } from "../../lib/supabase";
import type { Config, Reading, OrderRow, LogRow, BotPosition, Learning, BtTrade } from "../../lib/bot/types";
import { FLOW_SIGNALS, BLOCK_LINES } from "../../lib/bot/constants";
import { num } from "../../lib/bot/format";
import { buildClosedTrades, assetOf } from "../../lib/bot/trades";
import { invoke } from "../../lib/bot/api";

// Colunas lidas do banco — compartilhadas entre a carga inicial (loadBase) e o polling (loadLive), DRY.
const SEL_ORDERS = "id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, note, created_at, engine";
const SEL_LOGS = "id, level, message, created_at";
const SEL_POSITIONS = "asset, inst_id, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, target_px, last_bias, last_conviction, last_decision, last_reading, engine, block_hist";

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
  const [shadowTrades, setShadowTrades] = useState<{ engine: string; asset: string; side: string; pnl_pct: number | null; closed_at: string }[]>([]);
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
    const [{ data: st }, { data: c }, { data: ord }, { data: lg }, { data: pos }, { data: lrn }, { data: sh }] = await Promise.all([
      supabase.rpc("bot_config_status"),
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select(SEL_ORDERS).order("created_at", { ascending: false }).limit(200),
      supabase.from("bot_logs").select(SEL_LOGS).order("created_at", { ascending: false }).limit(60),
      supabase.from("bot_positions").select(SEL_POSITIONS).order("asset"),
      supabase.from("bot_learning").select("data, ai_report, updated_at").eq("id", 1).maybeSingle(),
      supabase.from("bot_shadow_trades").select("engine, asset, side, pnl_pct, closed_at").order("closed_at", { ascending: false }).limit(1000),
    ]);
    const conf = (c as Config) ?? null;
    setConnected(conf?.venue === "binance" ? !!(st as { binance?: boolean })?.binance : !!(st as { okx?: boolean })?.okx);
    setCfg(conf);
    setOrders((ord as OrderRow[] | null) ?? []);
    setLogs((lg as LogRow[] | null) ?? []);
    setPositions((pos as BotPosition[] | null) ?? []);
    setLearning((lrn as Learning | null) ?? null);
    setShadowTrades((sh as typeof shadowTrades | null) ?? []);
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Atualização ao vivo: re-lê config (preservando os campos que o usuário edita), ordens e
  // diário — sem sobrescrever o que está sendo digitado na config.
  const loadLive = useCallback(async () => {
    const [{ data: c }, { data: ord }, { data: lg }, { data: pos }] = await Promise.all([
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select(SEL_ORDERS).order("created_at", { ascending: false }).limit(200),
      supabase.from("bot_logs").select(SEL_LOGS).order("created_at", { ascending: false }).limit(60),
      supabase.from("bot_positions").select(SEL_POSITIONS).order("asset"),
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

  // (Níveis SMC removidos do gráfico — pedido do dono 10/jul: o gráfico foca em trade + indicadores por bloco.)

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

  // Toggle de cada INDICADOR de bloco no sub-painel (persistido). Default: todos ligados.
  const [blockShow, setBlockShow] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("bot_block_show") || "{}"); } catch { return {}; } });
  useEffect(() => { localStorage.setItem("bot_block_show", JSON.stringify(blockShow)); }, [blockShow]);
  // Sub-painel de indicadores: série temporal do saldo de cada bloco + a força ponderada (do histórico rolante).
  const sub = useMemo<BotSub | null>(() => {
    const hist = Array.isArray(selPos?.block_hist) ? (selPos!.block_hist as number[][]) : [];
    if (hist.length < 2 || candles.length < 2) return null;
    const seen = new Set<number>();
    const rows = hist.filter((r) => Array.isArray(r) && r.length >= 7 && r[0] != null && !seen.has(r[0]) && (seen.add(r[0]), true)).sort((a, b) => a[0] - b[0]);
    // Reamostra os blocos na MESMA grade de tempo das velas (forward-fill): 1 ponto POR vela → o sub compartilha
    // o eixo de tempo do gráfico principal, então a sincronização por índice é EXATA e as colunas (vela × indicador)
    // alinham. Velas antes do 1º registro ficam em 0 (some sob a linha de referência 0). Os times do block_hist são
    // arbitrários (ciclo de 5min, não alinhados aos candles de 15m) — por isso reamostrar, não usar o time cru.
    let ri = 0;
    let cur: number[] | null = null;
    const grid = candles.map((c) => {
      const t = c.time as number;
      while (ri < rows.length && (rows[ri][0] as number) <= t) cur = rows[ri++];
      return { t: c.time, row: cur };
    });
    const shownLines = BLOCK_LINES.filter((b) => blockShow[b.id] !== false).map((b) => ({ id: b.id, title: b.label, color: b.color, width: (b.width ?? 1) as 1 | 2, data: grid.map((g) => ({ time: g.t, value: g.row ? Number(g.row[b.idx]) || 0 : 0 })) }));
    const enter = Number(cfg?.conf2_enter ?? 30);
    return { lines: shownLines, refs: [{ value: 0, color: "#64748b" }, { value: enter, color: "#475569", dashed: true }, { value: -enter, color: "#475569", dashed: true }] };
  }, [selPos?.block_hist, blockShow, cfg?.conf2_enter, candles]);

  // Linhas de nível: só a POSIÇÃO (Entrada/Pico/Stop) — os níveis SMC saíram do gráfico.
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
  const closedTrades = buildClosedTrades(orders);

  // ── FILTROS (moeda / status / período) aplicados às ordens e aos trades ──
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
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
            <label className="text-xs font-semibold text-foreground">🤖 Motor do robô <span className="font-normal text-muted-foreground">— qual robô OPERA a conta; o outro roda em sombra (papel) pra comparar</span>
              <select className={`${input} mt-1`} value={cfg.bot_engine ?? "smc"} onChange={(e) => setCfg({ ...cfg, bot_engine: e.target.value })}>
                <option value="smc">Robô 1 · v28 — SMC price-action 15m (reteste + gates) · atual</option>
                <option value="confluence2">Robô 2.0 — força ponderada dos 5 blocos (peso ajustável) + saída por confluência</option>
              </select>
            </label>
            <p className="mt-1 text-[10px] text-muted-foreground">Trocar aqui só muda qual dos dois opera de verdade; o desempenho dos dois aparece no card "Desempenho dos robôs".</p>
          </div>
          {(cfg.bot_engine ?? "smc") === "confluence2" && (() => {
            const w = (cfg.conf2_weights ?? { estrutura: 30, micro: 25, tecnico: 20, fluxo: 13, posicionamento: 12 }) as Record<string, number>;
            const soma = Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
            return (
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-3">
              <div className="text-xs font-semibold text-foreground">⚖️ Peso dos blocos (Robô 2.0) <span className="font-normal text-muted-foreground">— a decisão é a FORÇA PONDERADA: Σ (peso × força do bloco). Não precisa somar 100 (é normalizado). Soma atual: {soma}%</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {([["estrutura", "Estrutura"], ["micro", "Microestrutura"], ["fluxo", "Fluxo"], ["posicionamento", "Posicionamento"], ["tecnico", "Técnico"]] as [string, string][]).map(([k, lbl]) => (
                  <label key={k} className="text-[11px] text-muted-foreground">{lbl}
                    <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={w[k] ?? 0} onChange={(e) => setCfg({ ...cfg, conf2_weights: { ...w, [k]: Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-muted-foreground" title="Força ponderada mínima (−100..+100) pra ABRIR. Maior = mais seletivo.">Abre em ±força
                  <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={cfg.conf2_enter ?? 30} onChange={(e) => setCfg({ ...cfg, conf2_enter: Number(e.target.value) })} />
                </label>
                <label className="text-[11px] text-muted-foreground" title="Histerese: mantém a posição enquanto a força ≥ este piso; abaixo, sai. Menor que 'Abre'.">Segura até ±força
                  <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={cfg.conf2_hold ?? 10} onChange={(e) => setCfg({ ...cfg, conf2_hold: Number(e.target.value) })} />
                </label>
                <label className="text-[11px] text-muted-foreground" title="Largura do stop de proteção (chandelier ×ATR). A saída principal é por confluência; este stop fica longe.">Stop catástrofe ×ATR
                  <input type="number" min={1} max={10} step={0.5} className={`${input} mt-0.5`} value={cfg.conf2_stop_atr ?? 4} onChange={(e) => setCfg({ ...cfg, conf2_stop_atr: Number(e.target.value) })} />
                </label>
                <label className="text-[11px] text-muted-foreground" title="Trava de BREAKEVEN: uma vez que o trade fica ≥ N×ATR no lucro, o stop nunca desce da entrada — um winner não vira loser. 0 = desliga.">Breakeven (×ATR lucro)
                  <input type="number" min={0} max={5} step={0.5} className={`${input} mt-0.5`} value={cfg.conf2_be_atr ?? 1} onChange={(e) => setCfg({ ...cfg, conf2_be_atr: Number(e.target.value) })} />
                </label>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Default: 3 fortes (Estrutura 30 · Micro 25 · Técnico 20) + 2 leves (Fluxo 13 · Posic 12). Ajuste e clique em <strong>Salvar</strong> embaixo. Vale pra todas as moedas.</p>
            </div>
            );
          })()}
          <div className="mt-3 space-y-4">
            {/* ── 1 · Execução & risco — quanto arrisca e os freios de segurança ── */}
            <div className="rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">💰 1 · Execução & risco <span className="font-normal normal-case">— quanto arrisca por trade e os freios de segurança</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-muted-foreground">Par (instId)
                  <input className={`${input} mt-1`} value={cfg.inst_id} onChange={(e) => setCfg({ ...cfg, inst_id: e.target.value.toUpperCase(), base_ccy: e.target.value.toUpperCase().split("-")[0] || cfg.base_ccy, quote_ccy: e.target.value.toUpperCase().split("-")[1] || cfg.quote_ccy })} />
                  {isBinance && <span className="mt-0.5 block text-[10px]">na Binance o robô opera <strong>BTC · ETH · SOL · BNB · AAVE</strong> (este campo vale só p/ OKX/spot)</span>}
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
                    <label className="text-xs text-muted-foreground">Direção da estrutura <span title="Como as 3 leituras de estrutura (último BOS/CHoCH · interna · swing) viram a direção do setup. 'Maioria 2-de-3' (v20, validado) impede a leitura VELHA de vencer a recente — era a causa dos shorts em rali.">ⓘ</span>
                      <select className={`${input} mt-1`} value={cfg.dir_mode ?? "majority"} onChange={(e) => setCfg({ ...cfg, dir_mode: e.target.value })}>
                        <option value="majority">Maioria 2-de-3 (recomendado)</option>
                        <option value="internal">Interna manda (mais rápido nas viradas)</option>
                        <option value="any">Qualquer uma (antigo — OU das 3)</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">Bússola do TF maior <span title="A estrutura do timeframe maior precisa concordar com a direção da entrada (neutra também segura). Fase F: maioria+4H = única variante acima do baseline, com metade do drawdown. Em probatório — se a medição da semana mostrar que segura trade bom, desligar é 1 clique.">ⓘ</span>
                      <select className={`${input} mt-1`} value={cfg.htf_gate ?? "4H"} onChange={(e) => setCfg({ ...cfg, htf_gate: e.target.value })}>
                        <option value="4H">4H (recomendado)</option>
                        <option value="1H">1H</option>
                        <option value="1D">1D</option>
                        <option value="off">Desligada (SMC do 15m puro)</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">Confluência <span title="'Maioria 2 de 3' (v23, pedido do dono): Estrutura · Pressão/fluxo · Técnico (EMA+VWAP+ADX) votam — 2 a favor e sem empate contra libera a entrada. 'SMC + pressão': estrutura na direção e fluxo não-contra (técnico vira estudo). 'Todos': regra v17 com Sentimento incluído.">ⓘ</span>
                      <select className={`${input} mt-1`} value={cfg.conf_scope ?? "smc_flow_ta"} onChange={(e) => setCfg({ ...cfg, conf_scope: e.target.value })}>
                        <option value="smc_flow_ta">Maioria 2 de 3 — Estrutura·Pressão·Técnico (atual)</option>
                        <option value="smc_flow">SMC + pressão não-contra (técnico = estudo)</option>
                        <option value="all">Todos os 4 grupos (antigo, com Sentimento)</option>
                      </select>
                      <span className="mt-0.5 block text-[10px]">Nos trades reais: fluxo a favor = 60% de acerto × contra = 20%. Setup segurado fica no Diário com o motivo.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Imbalance (FVG) <span title="'Reteste' (v18, igual ao módulo Smart Money): entra quando o preço VOLTA à zona do FVG. 'Chase' (antigo): entrava na formação do gap, perseguindo o esticado — 31% de acerto contra a estrutura.">ⓘ</span>
                      <select className={`${input} mt-1`} value={cfg.imb_mode ?? "retest"} onChange={(e) => setCfg({ ...cfg, imb_mode: e.target.value })}>
                        <option value="retest">Reteste da zona (recomendado)</option>
                        <option value="chase">Na formação (antigo)</option>
                      </select>
                      <span className="mt-0.5 flex items-center gap-3 text-[10px]">
                        <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.imb_align !== false} onChange={(e) => setCfg({ ...cfg, imb_align: e.target.checked })} className="h-3 w-3 rounded border-border" />só a favor da estrutura</label>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.zone_once !== false} onChange={(e) => setCfg({ ...cfg, zone_once: e.target.checked })} className="h-3 w-3 rounded border-border" />1 tiro por zona</label>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={(cfg.setup_priority ?? "structure") === "structure"} onChange={(e) => setCfg({ ...cfg, setup_priority: e.target.checked ? "structure" : "imbalance" })} className="h-3 w-3 rounded border-border" />OB/FVG+estrutura primeiro</label>
                        <label className="flex items-center gap-1" title="v24: a vela da entrada precisa ter delta (volume comprador−vendedor) a favor — única variante que melhorou as 4 moedas"><input type="checkbox" checked={cfg.delta_confirm !== false} onChange={(e) => setCfg({ ...cfg, delta_confirm: e.target.checked })} className="h-3 w-3 rounded border-border" />delta da vela a favor</label>
                        <label className="flex items-center gap-1" title="v25: no premium (topo) não compra e no discount (fundo) não vende, salvo rompimento de swing recente ou estrutura interna já virada (fase M2: melhorou as 4 moedas, R recorde)"><input type="checkbox" checked={cfg.zone_discipline !== false} onChange={(e) => setCfg({ ...cfg, zone_discipline: e.target.checked })} className="h-3 w-3 rounded border-border" />disciplina de zona</label>
                        <label className="flex items-center gap-1" title="v26: Squeeze Momentum (LazyBear, 20 velas 15m) FORTE contra a direção (≥0,5 ATR) segura a entrada — fase P: melhorou as 4 moedas, agregado recorde +67,8R"><input type="checkbox" checked={cfg.sq_filter !== false} onChange={(e) => setCfg({ ...cfg, sq_filter: e.target.checked })} className="h-3 w-3 rounded border-border" />squeeze momentum (LazyBear)</label>
                      </span>
                    </label>
                    <label className="text-xs text-muted-foreground">Entrada perto da zona (× ATR) <span title="Qualidade 1: entrada imbalance só com o preço a até X ATR da borda do FVG (0 = desligado). REPROVADA no backtest de 03/jul (mata ETH/SOL — o chase é o que paga lá); fica disponível p/ experimento.">ⓘ</span>
                      <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.max_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, max_zone_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Backtest 90+180d: ligar piora ETH/SOL.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Bloqueio por zona oposta (× ATR) <span title="Qualidade 2: segura a entrada quando há FVG/OB oposto fresco a até X ATR à frente (0 = desligado). REPROVADA no backtest de 03/jul junto com a regra 1; fica disponível p/ experimento.">ⓘ</span>
                      <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.opp_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, opp_zone_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Idem: reprovada em ETH/SOL.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Zona oposta do TF maior (× ATR do HTF) <span title="Fase R (07/jul, APROVADA — o caso dos prints do dono): OB/FVG CONTRÁRIO não-preenchido do TF da bússola (1H) a até X×ATR(HTF) à frente segura a entrada — não se compra colado numa zona de venda do 1H que o 15m não enxerga. Backtest 90d: SOL PF 2,99→4,81 (dd 5,9→4,1%), BTC/ETH também melhoram.">ⓘ</span>
                      <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.opp_htf_atr ?? 1} onChange={(e) => setCfg({ ...cfg, opp_htf_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">1 = validado (fase R). 0 = desligado. Usa o TF da bússola acima.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Filtro de volatilidade (× ATR) <span title="Fase V (07/jul, APROVADA — prática das plataformas): vela FECHADA com range maior que K×ATR (spike/notícia) não gera entrada — em SMC é a entrada esticada longe da zona de origem. Backtest 90d: ETH PF 1,44→1,61 · SOL 4,81→5,35 · BNB/AAVE ~iguais · BTC neutro.">ⓘ</span>
                      <input type="number" step="0.5" min="0" className={`${input} mt-1`} value={cfg.vol_max_atr ?? 2} onChange={(e) => setCfg({ ...cfg, vol_max_atr: Number(e.target.value) })} />
                      <span className="mt-0.5 block text-[10px]">2 = validado (fase V). 0 = desligado. 3 quase não filtra.</span>
                    </label>
                    <label className="text-xs text-muted-foreground">Sessão bloqueada (horas UTC, vírgula) <span title="Gate de sessão: nessas horas UTC o robô NÃO abre posição nova nem piramida — saídas seguem normais. ATENÇÃO: o estudo antigo (03/jul) era do MOTOR VELHO; na v22 tudo foi liberado (vazio) e a re-medição semanal decide se alguma janela volta. Vazio = sem filtro.">ⓘ</span>
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
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">🪙 2b · Exceções por moeda <span className="font-normal normal-case text-muted-foreground">— decisão 06/jul: o robô roda IGUAL nas 4; use só como exceção consciente</span></div>
                <p className="mb-2 text-[11px] text-muted-foreground">Config atual: <strong>tudo neutro</strong> (risco 100%, sem sessões bloqueadas, trailing padrão) — as doses defensivas antigas eram calibradas no motor velho e foram removidas na v22. Estes campos ficam como ferramenta: se a medição semanal do <code>bot_trades_hist</code> condenar uma moeda, a exceção volta AQUI, com dado.</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {["BTC", "ETH", "SOL", "BNB", "AAVE"].map((a) => {
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
                        <label className="mt-1 block text-[10px] text-muted-foreground">Piso do trailing <span title="Âncora estrutural do stop móvel: largo = último swing grande (~5h; preserva runner — validado ETH/SOL) · interno = último swing de ~1h (stop acompanha a estrutura recente — validado SÓ no BNB, PF 0,97→1,15/0,73→1,06; reprovado global: corta winners do ETH).">ⓘ</span>
                          <select className={`${input} mt-0.5`} value={ov.trail_floor ?? "structure"} onChange={(e) => setOv({ trail_floor: e.target.value })}>
                            <option value="structure">largo (swing ~5h)</option>
                            <option value="internal">interno (~1h, acompanha)</option>
                          </select>
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
            <button onClick={() => saveConfig({ inst_id: cfg.inst_id, base_ccy: cfg.base_ccy, quote_ccy: cfg.quote_ccy, order_quote_sz: cfg.order_quote_sz, buy_threshold: cfg.buy_threshold, sell_threshold: cfg.sell_threshold, leverage: cfg.leverage, pyramid: cfg.pyramid, pyramid_max: cfg.pyramid_max, min_votes: cfg.min_votes, stop_pct: cfg.stop_pct, ct_stop_pct: cfg.ct_stop_pct, counter_trend: cfg.counter_trend, auto_weight: cfg.auto_weight, trail_on: cfg.trail_on, trail_pct: cfg.trail_pct, trail_atr_mult: cfg.trail_atr_mult, stop_atr_on: cfg.stop_atr_on, stop_atr_mult: cfg.stop_atr_mult, risk_pct: cfg.risk_pct, daily_loss_pct: cfg.daily_loss_pct, max_positions: cfg.max_positions, cooldown_min: cfg.cooldown_min, imbalance_on: cfg.imbalance_on, imbalance_min_pct: cfg.imbalance_min_pct, signal_toggles: cfg.signal_toggles, rev_mode: cfg.rev_mode ?? "off", conf_min: cfg.conf_min ?? 3, max_zone_atr: cfg.max_zone_atr ?? 0, opp_zone_atr: cfg.opp_zone_atr ?? 0, target_on: cfg.target_on !== false, tp_partial: !!cfg.tp_partial, block_hours: cfg.block_hours ?? [], asset_overrides: cfg.asset_overrides ?? {}, imb_mode: cfg.imb_mode ?? "retest", imb_align: cfg.imb_align !== false, setup_priority: cfg.setup_priority ?? "structure", zone_once: cfg.zone_once !== false, dir_mode: cfg.dir_mode ?? "majority", htf_gate: cfg.htf_gate ?? "1H", conf_scope: cfg.conf_scope ?? "smc_flow_ta", delta_confirm: cfg.delta_confirm !== false, zone_discipline: cfg.zone_discipline !== false, sq_filter: cfg.sq_filter !== false, opp_htf_atr: cfg.opp_htf_atr ?? 1, vol_max_atr: cfg.vol_max_atr ?? 2, bot_engine: cfg.bot_engine ?? "smc", conf2_weights: cfg.conf2_weights ?? { estrutura: 30, micro: 25, tecnico: 20, fluxo: 13, posicionamento: 12 }, conf2_enter: cfg.conf2_enter ?? 30, conf2_hold: cfg.conf2_hold ?? 10, conf2_stop_atr: cfg.conf2_stop_atr ?? 4, conf2_be_atr: cfg.conf2_be_atr ?? 1 })} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "cfg" ? "Salvando…" : "Salvar config"}
            </button>
            <span className="text-[11px] text-muted-foreground">Estratégia (motor v28 — vela fechada): o <strong>SMC do 15m arma o setup em VELA FECHADA</strong> (reteste de Order Block/FVG a favor de BOS/CHoCH; <strong>stop = invalidação estrutural</strong>) e os grupos votam na direção — Estrutura SMC · Fluxo limpo (book inst+varejo, liquidações, gamma, divergência CVD) · Técnico (EMA20×50 + VWAP + ADX). Filtros de entrada validados: delta da vela a favor · squeeze momentum não-contra · disciplina de zona (premium/discount) · <strong>zona oposta do 1H</strong> (não compra colado em OB/FVG de venda do TF maior) · <strong>filtro de volatilidade</strong> (vela-spike &gt; 2×ATR não entra). <strong>Saída SÓ por stop estrutural + trailing 2,5×ATR</strong> (alvo de liquidez DESLIGADO por decisão do dono 07/jul; trava de breakeven com lucro ≥ 1×ATR). Sizing por risco, alavancagem como teto, circuit breaker diário, cooldown 60min pós-stop; pirâmide só no lucro e a favor. <strong>ROBÔ ÚNICO</strong>: config idêntica nas 5 moedas (BTC·ETH·SOL·BNB·AAVE) — exceções por moeda (2b) só com evidência nova.</span>
          </div>
        </div>
      )}

      {/* Gráfico, leitura e posições · aba Gráfico */}
      {tab === "grafico" && (<>
      {/* Leitura do robô (fluxo) — da moeda em foco (seletor no cabeçalho do gráfico) */}
      <BotReadingPanel selReading={selReading} cfg={cfg} selPos={selPos} selAsset={selAsset} />

      {/* Gráfico com marcações */}
      <BotChartSection selInst={selInst} cfg={cfg} setCfg={setCfg} ASSET_LIST={ASSET_LIST} selAsset={selAsset} setSelAsset={setSelAsset} blockShow={blockShow} setBlockShow={setBlockShow} refresh={refresh} busy={busy} connected={connected} candles={candles} markers={markers} priceLines={priceLines} sub={sub} dec={dec} />

      {/* Desempenho de TODAS as variantes (vivo + sombras) — régua HONESTA: líquido de taxa (0,12%/RT) */}
      <RobotScoreboard shadowTrades={shadowTrades} orders={orders} positions={positions} liveEngine={cfg?.bot_engine} quote={quote} />

      {/* Acerto por bloco — régua honesta pra calibrar os pesos com DADO (não achismo) */}
      <BlockAccuracy orders={orders} positions={positions} />

      {/* Resumo da conta — quanto está rendendo agora e o que já foi realizado */}
      <AccountSummary totalEq={totalEq} hasLivePnl={hasLivePnl} openPnl={openPnl} quote={quote} pnlSummary={pnlSummary} selMonth={selMonth} setSelMonth={setSelMonth} openPositions={openPositions} cfg={cfg} isFut={isFut} />

      {/* Posições abertas — o que o robô tem em aberto AGORA, com PnL ao vivo e fechar por moeda. */}
      {positions.length > 0 && (
        <OpenPositions openPositions={openPositions} flatAssets={flatAssets} livePos={livePos} cfg={cfg} quote={quote} busy={busy} connected={connected} isFut={isFut} closeAsset={closeAsset} pxDec={pxDec} />
      )}
      </>)}

      {/* Ordens (trades, execuções, diário) · aba Ordens */}
      {tab === "ordens" && (<>
      {/* Filtros — moeda / origem / resultado / status / período (valem p/ KPIs, trades e execuções). */}
      <OrdersFilters fAsset={fAsset} setFAsset={setFAsset} fSource={fSource} setFSource={setFSource} fResult={fResult} setFResult={setFResult} fStatus={fStatus} setFStatus={setFStatus} fFrom={fFrom} setFFrom={setFFrom} fTo={fTo} setFTo={setFTo} orderAssets={orderAssets} filtered={filtered} fClosedTrades={fClosedTrades} />

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
      <ClosedTradesTable fClosedTrades={fClosedTrades} closedTrades={closedTrades} pnlByAsset={pnlByAsset} quote={quote} pxDec={pxDec} />

      {/* Execuções — TODAS as ordens enviadas (robô + manuais numa tabela só; use o filtro Origem). */}
      <ExecutionsTable filtered={filtered} botOrders={botOrders} manualOrders={manualOrders} orders={orders} positions={positions} busy={busy} pxDec={pxDec} cancelOrder={cancelOrder} deleteOrder={deleteOrder} />

      {/* Ordem manual (avançado) · aba Ordens */}
      <ManualOrder showManual={showManual} setShowManual={setShowManual} cfg={cfg} input={input} mSide={mSide} setMSide={setMSide} mOrdType={mOrdType} setMOrdType={setMOrdType} mSz={mSz} setMSz={setMSz} mPx={mPx} setMPx={setMPx} isFut={isFut} placeManual={placeManual} busy={busy} connected={connected} />

      </>)}

      {tab === "aprendizado" && (<>
      {/* Backtester — mede a expectância da estratégia em candles reais */}
      <Backtester btAsset={btAsset} setBtAsset={setBtAsset} btDays={btDays} setBtDays={setBtDays} btBusy={btBusy} runBacktest={runBacktest} btResult={btResult} />

      {/* Aprendizado do robô · aba Aprendizado */}
      <LearningPanel learning={learning} learnAsset={learnAsset} setLearnAsset={setLearnAsset} runLearn={runLearn} busy={busy} />

      {/* Diário do robô — histórico de leituras/decisões (aba Aprendizado: é a matéria-prima do que o robô aprende) */}
      <BotJournal logs={logs} dLevel={dLevel} setDLevel={setDLevel} dAssetF={dAssetF} setDAssetF={setDAssetF} />
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

    </section>
  );
}
