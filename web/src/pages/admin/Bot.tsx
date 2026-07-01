import { useCallback, useEffect, useMemo, useState } from "react";

import type { UTCTimestamp } from "lightweight-charts";

import BotChart, { type BotCandle, type BotMarker } from "../../components/admin/BotChart";
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
  structure?: { consensus?: { bull: number; bear: number; total: number }; perTf?: { tf: string; bias: number; swing: string | null }[]; zone?: string | null } | null;
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
  const [posInfo, setPosInfo] = useState<{ uPnl: number | null; markPx: number | null; entryPx: number | null } | null>(null);

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
    const [{ data: st }, { data: c }, { data: ord }, { data: lg }] = await Promise.all([
      supabase.rpc("bot_config_status"),
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    const conf = (c as Config) ?? null;
    setConnected(conf?.venue === "binance" ? !!(st as { binance?: boolean })?.binance : !!(st as { okx?: boolean })?.okx);
    setCfg(conf);
    setOrders((ord as OrderRow[] | null) ?? []);
    setLogs((lg as LogRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Atualização ao vivo: re-lê config (preservando os campos que o usuário edita), ordens e
  // diário — sem sobrescrever o que está sendo digitado na config.
  const loadLive = useCallback(async () => {
    const [{ data: c }, { data: ord }, { data: lg }] = await Promise.all([
      supabase.rpc("bot_get_config"),
      supabase.from("bot_orders").select("id, source, action, inst_id, side, ord_type, sz, avg_px, pnl, ok, result, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("bot_logs").select("id, level, message, created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (c) setCfg((prev) => (prev ? { ...(c as Config), inst_id: prev.inst_id, base_ccy: prev.base_ccy, quote_ccy: prev.quote_ccy, bar: prev.bar, order_quote_sz: prev.order_quote_sz, leverage: prev.leverage, buy_threshold: prev.buy_threshold, sell_threshold: prev.sell_threshold } : (c as Config)));
    setOrders((ord as OrderRow[] | null) ?? []);
    setLogs((lg as LogRow[] | null) ?? []);
  }, []);

  const loadChart = useCallback(async (config: Config) => {
    try {
      const r = await invoke("candles", { instId: config.inst_id, bar: config.bar, limit: 200 }, config.venue === "binance" ? "binance-bot" : "okx-bot");
      const rows = ((r?.data ?? []) as string[][]).slice().reverse();
      const cs: BotCandle[] = rows.map((x) => ({ time: Math.floor(Number(x[0]) / 1000) as UTCTimestamp, open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
      setCandles(cs);
    } catch {
      setCandles([]);
    }
  }, []);

  // Carrega gráfico quando a config chega/muda.
  useEffect(() => {
    if (cfg && connected) loadChart(cfg);
  }, [cfg?.inst_id, cfg?.bar, connected, loadChart]);

  // PnL ao vivo: enquanto há posição aberta, lê a posição real da Binance (uPnL + preço de marca).
  useEffect(() => {
    if (!connected || !cfg || cfg.position === "flat" || cfg.venue !== "binance") { setPosInfo(null); return; }
    const sym = cfg.inst_id;
    let active = true;
    const poll = async () => {
      try {
        const r = await invoke("positions", { instId: sym }, "binance-bot");
        const arr = r?.data as { symbol?: string; unRealizedProfit?: string; markPrice?: string; entryPrice?: string }[] | undefined;
        const p = Array.isArray(arr) ? arr.find((x) => x.symbol === sym) : null;
        if (active && p) setPosInfo({ uPnl: Number(p.unRealizedProfit), markPx: Number(p.markPrice) || null, entryPx: Number(p.entryPrice) || null });
      } catch { /* ignora */ }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { active = false; clearInterval(id); };
  }, [connected, cfg?.position, cfg?.inst_id, cfg?.venue]);

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
      await loadChart(cfg);
      await loadLive();
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => { active = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cfg?.inst_id, cfg?.bar, cfg?.venue, loadChart, loadLive]);

  async function refresh() {
    if (!connected || !cfg) return;
    setBusy("refresh");
    setMsg(null);
    try {
      const bal = await invoke("balance", {}, cfg.venue === "binance" ? "binance-bot" : "okx-bot");
      setTotalEq(bal?.data?.[0]?.totalEq ?? null);
      await loadChart(cfg);
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

  async function resetPosition() {
    await saveConfig({ position: "flat", pos_base_sz: 0, entry_px: null });
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
      if (cfg) await loadChart(cfg);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao rodar." });
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

  async function closePosition() {
    if (!cfg) return;
    if (!window.confirm("Fechar a posição atual do robô a mercado (demo)?")) return;
    setBusy("close");
    setMsg(null);
    try {
      const r = await invoke("close", {}, cfg.venue === "binance" ? "binance-bot" : "okx-bot");
      if (r?.closed === false) setMsg({ kind: "ok", text: "Não havia posição aberta." });
      else setMsg({ kind: "ok", text: `Posição fechada${r?.pnl != null ? ` · PnL ${num(r.pnl)} ${cfg.quote_ccy}` : ""}.` });
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao fechar." });
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrder(id: string) {
    if (!window.confirm("Excluir esta ordem do histórico? (não afeta a OKX)")) return;
    setBusy("row" + id);
    setMsg(null);
    try {
      const { error } = await supabase.rpc("bot_delete_order", { p_id: id });
      if (error) throw new Error(error.message);
      setOrders((os) => os.filter((o) => o.id !== id));
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao excluir." });
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

  // Marcadores de C/V no gráfico (alinhados à vela que contém a ordem).
  const markers = useMemo<BotMarker[]>(() => {
    if (!candles.length) return [];
    const times = candles.map((c) => c.time);
    return orders
      .filter((o) => o.ok && o.side && o.inst_id === cfg?.inst_id)
      .map((o) => {
        const t = Math.floor(new Date(o.created_at).getTime() / 1000);
        let bar = times[0];
        for (const tt of times) { if (tt <= t) bar = tt; else break; }
        return { time: bar as UTCTimestamp, side: o.side as "buy" | "sell", text: o.side === "buy" ? "C" : "V" };
      });
  }, [orders, candles, cfg?.inst_id]);

  const lastPx = candles.length ? candles[candles.length - 1].close : 0;
  const dec = lastPx >= 1000 ? 1 : lastPx >= 1 ? 2 : 6;
  const isBinance = cfg?.venue === "binance";
  const isFut = isBinance || (!!cfg?.inst_id && cfg.inst_id.toUpperCase().endsWith("-SWAP"));
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";
  // Ordem que abriu a posição ATUAL (a mais recente de abertura, com posição não-flat) → mostra
  // PnL ao vivo na linha. Fechamentos mostram o PnL realizado salvo (o.pnl). Resto: "—".
  const openEntryId = cfg && cfg.position !== "flat" ? orders.find((o) => (o.action === "order" || o.action === "open") && o.ok)?.id ?? null : null;

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

      {/* Robô automático */}
      {cfg && (
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
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => saveConfig({ inst_id: cfg.inst_id, base_ccy: cfg.base_ccy, quote_ccy: cfg.quote_ccy, order_quote_sz: cfg.order_quote_sz, buy_threshold: cfg.buy_threshold, sell_threshold: cfg.sell_threshold, leverage: cfg.leverage })} disabled={busy !== null} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy === "cfg" ? "Salvando…" : "Salvar config"}
            </button>
            <span className="text-[11px] text-muted-foreground">Estratégia: <strong>Smart Money + fluxo</strong>. Consenso de estrutura SMC por timeframe (<strong>15m/30m/1H</strong>) é a espinha dorsal; book, paredes/ímã, <strong>absorção de parede</strong>, CVD, liquidações, gamma/HIRO e ETF confirmam. {isFut ? <>Nos futuros abre <strong>LONG</strong> no viés de alta e <strong>SHORT</strong> no de baixa; nunca compra caindo/no premium nem vende subindo/no discount.</> : <>Só compra com a estrutura a favor, fora do premium e sem estar caindo.</>} Compra/long se viés ≥ +{cfg.buy_threshold}; vende/short se ≤ −{cfg.sell_threshold}.</span>
          </div>
        </div>
      )}

      {/* Leitura do robô (fluxo) */}
      {cfg?.last_reading && (() => {
        const r = cfg.last_reading;
        const bias = r.bias;
        const bc = bias >= 15 ? "text-emerald-500" : bias <= -15 ? "text-rose-500" : "text-muted-foreground";
        return (
          <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">🧠 Leitura do robô · Smart Money + fluxo</h2>
              <span className="text-[11px] text-muted-foreground">{cfg.last_run ? `atualizado ${new Date(cfg.last_run).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            </div>
            {r.structure && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-muted-foreground">Por timeframe</span>
                {r.structure.consensus && (
                  <span className="text-muted-foreground">consenso: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{r.structure.consensus.bull}↑</span> · <span className="font-semibold text-rose-600 dark:text-rose-400">{r.structure.consensus.bear}↓</span> de {r.structure.consensus.total}</span>
                )}
                {r.structure.perTf?.map((t) => (
                  <span key={t.tf} className={`num rounded px-1.5 py-0.5 font-semibold ${t.bias >= 12 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : t.bias <= -12 ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`}>{t.tf} {t.bias >= 0 ? "+" : ""}{t.bias}</span>
                ))}
                {r.structure.zone && <span className="text-muted-foreground">zona: <span className="text-foreground">{r.structure.zone}</span></span>}
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
                <div className={`text-2xl font-bold ${cfg.last_decision === "buy" ? "text-emerald-500" : cfg.last_decision === "sell" ? "text-rose-500" : "text-foreground"}`}>{decisionLabel(cfg.last_decision)}</div>
                <div className="text-[10px] text-muted-foreground">limiar ±{cfg.buy_threshold}</div>
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
          <h2 className="text-sm font-semibold text-foreground">Gráfico · {cfg?.inst_id ?? ""} <span className="text-xs font-normal text-muted-foreground">({cfg?.bar})</span></h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {BARS.map((b) => <button key={b} onClick={() => cfg && setCfg({ ...cfg, bar: b })} className={`rounded-md px-2 py-0.5 transition-colors ${cfg?.bar === b ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{b}</button>)}
            </div>
            <span className="flex items-center gap-1"><span className="text-emerald-500">▲</span> compra</span>
            <span className="flex items-center gap-1"><span className="text-rose-500">▼</span> venda</span>
            <button onClick={refresh} disabled={busy !== null || !connected} className="rounded-lg border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">{busy === "refresh" ? "…" : "Atualizar"}</button>
          </div>
        </div>
        {connected && candles.length > 0 ? (
          <BotChart candles={candles} markers={markers} decimals={dec} fitKey={`${cfg?.inst_id ?? ""}-${cfg?.bar ?? ""}`} />
        ) : (
          <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">{connected ? "Carregando velas…" : "Conecte a OKX para ver o gráfico."}</div>
        )}
      </div>

      {/* Conta demo */}
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Conta demo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patrimônio total (demo)</div>
            <div className="num text-2xl font-bold text-foreground">{totalEq != null ? `US$ ${num(totalEq)}` : "—"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posição do robô</div>
              {cfg && cfg.position !== "flat" && (
                <div className="flex items-center gap-2">
                  <button onClick={closePosition} disabled={busy !== null || !connected} className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-50 dark:text-rose-400">{busy === "close" ? "Fechando…" : "✕ Fechar posição"}</button>
                  <button onClick={resetPosition} disabled={busy !== null} className="text-[10px] text-muted-foreground underline hover:text-foreground">resetar</button>
                </div>
              )}
            </div>
            {cfg && cfg.position !== "flat" ? (
              <>
                <div className={`text-lg font-bold ${cfg.position === "long" ? "text-emerald-500" : "text-rose-500"}`}>{cfg.position === "long" ? "Comprado (long)" : "Vendido (short)"}{isFut && cfg.leverage ? ` · ${cfg.leverage}x` : ""}</div>
                <div className="text-[11px] text-muted-foreground">{num(cfg.pos_base_sz, 6)} {cfg.base_ccy} · entrada @ <span className="num">{(posInfo?.entryPx ?? cfg.entry_px) != null ? num(posInfo?.entryPx ?? cfg.entry_px, dec) : "—"}</span></div>
                {(() => {
                  const entry = posInfo?.entryPx ?? (cfg.entry_px != null ? Number(cfg.entry_px) : null);
                  const mark = posInfo?.markPx ?? lastPx;
                  const qty = Number(cfg.pos_base_sz);
                  const dir = cfg.position === "long" ? 1 : -1;
                  const upnl = posInfo?.uPnl != null ? posInfo.uPnl : (entry != null && mark > 0 ? (mark - entry) * qty * dir : null);
                  if (upnl == null) return null;
                  const movePct = entry && entry > 0 && mark > 0 ? ((mark - entry) / entry) * 100 * dir : null;
                  return (
                    <div className="mt-1">
                      <span className={`num text-base font-bold ${upnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>PnL: {upnl >= 0 ? "+" : ""}{num(upnl)} {cfg.quote_ccy}</span>
                      {movePct != null && <span className={`num ml-1 text-[11px] font-medium ${upnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>({upnl >= 0 ? "+" : ""}{movePct.toFixed(2)}%)</span>}
                      {mark > 0 && <span className="ml-2 text-[10px] text-muted-foreground">preço agora <span className="num">{num(mark, dec)}</span></span>}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-lg font-bold text-muted-foreground">Fora do mercado</div>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">{isFut ? "Futuros: long e short com margem em " : "Opera com capital em "}{cfg?.quote_ccy ?? "USDT"}; saldos pré-existentes ficam intocados.</p>
          </div>
        </div>
      </div>

      {/* Histórico de ordens */}
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="px-4 py-3"><h2 className="text-sm font-semibold text-foreground">Histórico de ordens</h2></div>
        {orders.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhuma ordem ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Origem</th><th className="px-4 py-2 font-medium">Lado</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Preço</th><th className="px-4 py-2 text-right font-medium">Receita</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{o.source === "auto" ? "robô" : "manual"}</span></td>
                    <td className={`px-4 py-2 font-medium ${o.side === "buy" ? "text-emerald-500" : "text-rose-500"}`}>{o.side === "buy" ? "compra" : "venda"}</td>
                    <td className="num px-4 py-2 text-right text-foreground">{o.sz}</td>
                    <td className="num px-4 py-2 text-right text-foreground">{o.avg_px != null ? num(o.avg_px, dec) : "—"}</td>
                    <td className="num px-4 py-2 text-right">
                      {(() => {
                        // Fechamento → PnL realizado salvo; ordem da posição aberta → PnL ao vivo; resto → "—".
                        const live = o.id === openEntryId ? posInfo?.uPnl ?? null : null;
                        const v = o.pnl != null ? o.pnl : live;
                        if (v == null) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className={v >= 0 ? "text-emerald-500" : "text-rose-500"} title={o.pnl != null ? "realizado" : "em aberto (ao vivo)"}>
                            {v >= 0 ? "+" : ""}{num(v)}{live != null && o.pnl == null ? "*" : ""}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2">{o.ok ? <span className="text-emerald-500">ok</span> : <span className="text-rose-500" title={o.result?.data?.[0]?.sMsg ?? o.result?.msg ?? ""}>erro</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {o.ord_type === "limit" && o.ok && o.result?.data?.[0]?.ordId && (
                        <button onClick={() => cancelOrder(o)} disabled={busy !== null} className="mr-3 text-[11px] text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400">cancelar</button>
                      )}
                      <button onClick={() => deleteOrder(o.id)} disabled={busy !== null} className="text-[11px] text-muted-foreground hover:text-rose-500 hover:underline disabled:opacity-50">excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[10px] text-muted-foreground">Receita: <span className="text-emerald-500">verde</span>/<span className="text-rose-500">vermelho</span> = ganho/perda. <span className="num">*</span> = ao vivo (posição em aberto); demais = realizado no fechamento.</p>
          </div>
        )}
      </div>

      {/* Diário do robô */}
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

      {/* Conexão (chaves) — recolhível */}
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

      {/* Ordem manual — recolhível */}
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
    </section>
  );
}
