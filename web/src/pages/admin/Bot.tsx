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
import EngineConfig from "../../components/admin/bot/config/EngineConfig";
import RiskConfig from "../../components/admin/bot/config/RiskConfig";
import EntryConfig from "../../components/admin/bot/config/EntryConfig";
import PerAssetConfig from "../../components/admin/bot/config/PerAssetConfig";
import ExitConfig from "../../components/admin/bot/config/ExitConfig";
import FlowSignalsConfig from "../../components/admin/bot/config/FlowSignalsConfig";
import ConnectionKeys from "../../components/admin/bot/config/ConnectionKeys";
import { supabase } from "../../lib/supabase";
import type { Config, Reading, OrderRow, LogRow, BotPosition, Learning, BtTrade } from "../../lib/bot/types";
import { BLOCK_LINES } from "../../lib/bot/constants";
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
        <>
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
          <EngineConfig cfg={cfg} setCfg={setCfg} input={input} />
          <div className="mt-3 space-y-4">
            {/* ── 1 · Execução & risco — quanto arrisca e os freios de segurança ── */}
            <RiskConfig cfg={cfg} setCfg={setCfg} input={input} isBinance={isBinance} isFut={isFut} />

            {/* ── 2 · Entrada — os gatilhos SMC e os filtros que seguram entrada ruim ── */}
            {isFut && <EntryConfig cfg={cfg} setCfg={setCfg} input={input} />}

            {/* ── 2b · CONFIG POR MOEDA — cada moeda é única (motor idêntico, dose diferente) ── */}
            {isFut && <PerAssetConfig cfg={cfg} setCfg={setCfg} input={input} />}

            {/* ── 3 · Saída & gestão — como a posição é protegida e encerrada ── */}
            {isFut && <ExitConfig cfg={cfg} setCfg={setCfg} input={input} />}

            {/* ── 4 · Aprendizado & sinais de fluxo ── */}
            <FlowSignalsConfig cfg={cfg} setCfg={setCfg} isFut={isFut} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => saveConfig({ inst_id: cfg.inst_id, base_ccy: cfg.base_ccy, quote_ccy: cfg.quote_ccy, order_quote_sz: cfg.order_quote_sz, buy_threshold: cfg.buy_threshold, sell_threshold: cfg.sell_threshold, leverage: cfg.leverage, pyramid: cfg.pyramid, pyramid_max: cfg.pyramid_max, min_votes: cfg.min_votes, stop_pct: cfg.stop_pct, ct_stop_pct: cfg.ct_stop_pct, counter_trend: cfg.counter_trend, auto_weight: cfg.auto_weight, trail_on: cfg.trail_on, trail_pct: cfg.trail_pct, trail_atr_mult: cfg.trail_atr_mult, stop_atr_on: cfg.stop_atr_on, stop_atr_mult: cfg.stop_atr_mult, risk_pct: cfg.risk_pct, daily_loss_pct: cfg.daily_loss_pct, max_positions: cfg.max_positions, cooldown_min: cfg.cooldown_min, imbalance_on: cfg.imbalance_on, imbalance_min_pct: cfg.imbalance_min_pct, signal_toggles: cfg.signal_toggles, rev_mode: cfg.rev_mode ?? "off", conf_min: cfg.conf_min ?? 3, max_zone_atr: cfg.max_zone_atr ?? 0, opp_zone_atr: cfg.opp_zone_atr ?? 0, target_on: cfg.target_on !== false, tp_partial: !!cfg.tp_partial, block_hours: cfg.block_hours ?? [], asset_overrides: cfg.asset_overrides ?? {}, imb_mode: cfg.imb_mode ?? "retest", imb_align: cfg.imb_align !== false, setup_priority: cfg.setup_priority ?? "structure", zone_once: cfg.zone_once !== false, dir_mode: cfg.dir_mode ?? "majority", htf_gate: cfg.htf_gate ?? "1H", conf_scope: cfg.conf_scope ?? "smc_flow_ta", delta_confirm: cfg.delta_confirm !== false, zone_discipline: cfg.zone_discipline !== false, sq_filter: cfg.sq_filter !== false, opp_htf_atr: cfg.opp_htf_atr ?? 1, vol_max_atr: cfg.vol_max_atr ?? 2, bot_engine: cfg.bot_engine ?? "smc", conf2_weights: cfg.conf2_weights ?? { estrutura: 30, micro: 25, tecnico: 20, fluxo: 13, posicionamento: 12 }, conf2_enter: cfg.conf2_enter ?? 30, conf2_hold: cfg.conf2_hold ?? 10, conf2_stop_atr: cfg.conf2_stop_atr ?? 4, conf2_be_atr: cfg.conf2_be_atr ?? 1 })} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "cfg" ? "Salvando…" : "Salvar config"}
            </button>
            <span className="text-[11px] text-muted-foreground">Estratégia (motor v28 — vela fechada): o <strong>SMC do 15m arma o setup em VELA FECHADA</strong> (reteste de Order Block/FVG a favor de BOS/CHoCH; <strong>stop = invalidação estrutural</strong>) e os grupos votam na direção — Estrutura SMC · Fluxo limpo (book inst+varejo, liquidações, gamma, divergência CVD) · Técnico (EMA20×50 + VWAP + ADX). Filtros de entrada validados: delta da vela a favor · squeeze momentum não-contra · disciplina de zona (premium/discount) · <strong>zona oposta do 1H</strong> (não compra colado em OB/FVG de venda do TF maior) · <strong>filtro de volatilidade</strong> (vela-spike &gt; 2×ATR não entra). <strong>Saída SÓ por stop estrutural + trailing 2,5×ATR</strong> (alvo de liquidez DESLIGADO por decisão do dono 07/jul; trava de breakeven com lucro ≥ 1×ATR). Sizing por risco, alavancagem como teto, circuit breaker diário, cooldown 60min pós-stop; pirâmide só no lucro e a favor. <strong>ROBÔ ÚNICO</strong>: config idêntica nas 5 moedas (BTC·ETH·SOL·BNB·AAVE) — exceções por moeda (2b) só com evidência nova.</span>
          </div>
        </div>

        {/* Conexão (chaves) · aba Configuração */}
        <ConnectionKeys showKeys={showKeys} setShowKeys={setShowKeys} isBinance={isBinance} connected={connected} input={input} apiKey={apiKey} setApiKey={setApiKey} apiSecret={apiSecret} setApiSecret={setApiSecret} passphrase={passphrase} setPassphrase={setPassphrase} saveKeys={saveKeys} busy={busy} />
        </>
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

    </section>
  );
}
