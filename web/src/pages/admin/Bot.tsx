import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

interface Status {
  okx: boolean;
}
interface BalDetail {
  ccy: string;
  eq: string;
  availBal: string;
}
interface Position {
  instId: string;
  posSide: string;
  pos: string;
  avgPx: string;
  upl: string;
  uplRatio: string;
}
interface OrderRow {
  id: string;
  inst_id: string | null;
  side: string | null;
  ord_type: string | null;
  sz: string | null;
  ok: boolean;
  result: { code?: string; msg?: string; data?: { sMsg?: string; ordId?: string }[] } | null;
  created_at: string;
}

/** Extrai { error } de uma resposta de erro da edge function (mesmo padrão do /admin/social). */
async function invoke(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("okx-bot", { body: { action, ...extra } });
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
  if (data?.code && data.code !== "0") throw new Error(`OKX ${data.code}: ${data.msg ?? "erro"}`);
  return data;
}

/** Admin · Robô (Lab) — robô de trade PESSOAL no modo DEMO da OKX. Isolado do SaaS,
 *  visível só para o admin. v1 = conexão + painel (saldo, posições, ordem de teste).
 *  As chaves ficam no servidor (app_secrets); a execução usa sempre x-simulated-trading. */
export default function AdminBot() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // chaves (não exibem o valor salvo; só status "conectado")
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");

  // dados ao vivo
  const [totalEq, setTotalEq] = useState<string | null>(null);
  const [details, setDetails] = useState<BalDetail[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  // ordem de teste
  const [instId, setInstId] = useState("BTC-USDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [ordType, setOrdType] = useState<"market" | "limit">("market");
  const [sz, setSz] = useState("");
  const [px, setPx] = useState("");
  const [last, setLast] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const { data } = await supabase.rpc("bot_config_status");
    setStatus((data as Status) ?? null);
    const { data: ord } = await supabase
      .from("bot_orders")
      .select("id, inst_id, side, ord_type, sz, ok, result, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setOrders((ord as OrderRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function saveSecret(key: string, value: string, label: string) {
    if (!value.trim()) return;
    const { error } = await supabase.rpc("set_bot_secret", { p_key: key, p_value: value.trim() });
    if (error) throw new Error(`${label}: ${error.message}`);
  }
  async function saveKeys() {
    setBusy("keys");
    setMsg(null);
    try {
      await saveSecret("okx_api_key", apiKey, "API Key");
      await saveSecret("okx_api_secret", apiSecret, "API Secret");
      await saveSecret("okx_api_passphrase", passphrase, "Passphrase");
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
      setMsg({ kind: "ok", text: "Chaves da OKX demo salvas." });
      await loadStatus();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setMsg(null);
    try {
      const bal = await invoke("balance");
      const acc = bal?.data?.[0];
      setTotalEq(acc?.totalEq ?? null);
      setDetails(((acc?.details ?? []) as BalDetail[]).filter((d) => Number(d.eq) > 0).slice(0, 12));
      const pos = await invoke("positions");
      setPositions(((pos?.data ?? []) as Position[]).filter((p) => Number(p.pos) !== 0));
      setMsg({ kind: "ok", text: "Atualizado." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  async function getTicker() {
    setBusy("ticker");
    setMsg(null);
    try {
      const t = await invoke("ticker", { instId });
      setLast(t?.data?.[0]?.last ?? null);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha." });
    } finally {
      setBusy(null);
    }
  }

  async function placeOrder() {
    if (!sz.trim()) {
      setMsg({ kind: "err", text: "Informe o tamanho (sz)." });
      return;
    }
    setBusy("order");
    setMsg(null);
    try {
      const r = await invoke("order", { instId, side, ordType, tdMode: "cash", sz: sz.trim(), px: ordType === "limit" ? px.trim() : undefined });
      const o = r?.data?.[0];
      setMsg({ kind: "ok", text: `Ordem enviada (demo): ${o?.ordId ? `id ${o.ordId}` : "ok"}.` });
      setSz("");
      setPx("");
      await loadStatus();
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao enviar ordem." });
    } finally {
      setBusy(null);
    }
  }

  const Badge = ({ ok }: { ok: boolean }) => (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
      {ok ? "conectado" : "não conectado"}
    </span>
  );
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <section className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">Robô · Lab</h1>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">OKX Demo · dinheiro fake</span>
          <span className="text-xs text-muted-foreground">OKX <Badge ok={!!status?.okx} /></span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Robô de trade <strong>pessoal</strong> em modo simulador, isolado do produto e visível só para você. Toda chamada usa o ambiente <strong>Demo Trading</strong> da OKX (<code>x-simulated-trading</code>) — sem risco. As chaves ficam no servidor e nunca aparecem aqui depois de salvas.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg border p-3 text-sm ${msg.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"}`}>
          {msg.text}
        </div>
      )}

      {/* Conexão OKX demo */}
      <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Conectar OKX (Demo Trading)</h2>
          <Badge ok={!!status?.okx} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input className={input} placeholder="API Key (demo)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input className={input} placeholder="API Secret (demo)" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          <input className={input} placeholder="Passphrase (demo)" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </div>
        <button onClick={saveKeys} disabled={busy !== null} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy === "keys" ? "Salvando…" : "Salvar chaves"}
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Na OKX, ative o <strong>Demo Trading</strong> e gere chaves de API <strong>nesse ambiente</strong> (não use as chaves reais). Precisa de API Key, Secret e Passphrase. Permissão de <strong>Trade</strong> basta; <strong>nunca</strong> habilite saque.
        </p>
      </div>

      {/* Conta (saldo + posições) */}
      <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Conta demo</h2>
          <button onClick={refresh} disabled={busy !== null || !status?.okx} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {busy === "refresh" ? "Atualizando…" : "Atualizar saldo e posições"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patrimônio total (demo)</div>
            <div className="num text-2xl font-bold text-foreground">{totalEq != null ? `US$ ${Number(totalEq).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}` : "—"}</div>
            {details.length > 0 && (
              <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                {details.map((d) => (
                  <div key={d.ccy} className="flex justify-between">
                    <span>{d.ccy}</span>
                    <span className="num">{Number(d.eq).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} <span className="text-muted-foreground/60">(livre {Number(d.availBal).toLocaleString("pt-BR", { maximumFractionDigits: 4 })})</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Posições abertas</div>
            {positions.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma posição aberta.</p>
            ) : (
              <div className="space-y-1 text-[11px]">
                {positions.map((p) => (
                  <div key={p.instId + p.posSide} className="flex justify-between">
                    <span className="text-foreground">{p.instId} · {p.posSide}</span>
                    <span className={`num ${Number(p.upl) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{p.pos} · PnL {Number(p.upl).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ordem de teste manual */}
      <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
        <h2 className="text-sm font-semibold text-foreground">Ordem de teste (manual)</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className={input} placeholder="Par (instId)" value={instId} onChange={(e) => setInstId(e.target.value.toUpperCase())} />
          <select className={input} value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
            <option value="buy">Comprar</option>
            <option value="sell">Vender</option>
          </select>
          <select className={input} value={ordType} onChange={(e) => setOrdType(e.target.value as "market" | "limit")}>
            <option value="market">A mercado</option>
            <option value="limit">Limite</option>
          </select>
          <input className={input} placeholder="Tamanho (sz)" value={sz} onChange={(e) => setSz(e.target.value)} />
          <input className={input} placeholder="Preço (limite)" value={px} onChange={(e) => setPx(e.target.value)} disabled={ordType !== "limit"} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={placeOrder} disabled={busy !== null || !status?.okx} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy === "order" ? "Enviando…" : "Enviar ordem (demo)"}
          </button>
          <button onClick={getTicker} disabled={busy !== null} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
            {busy === "ticker" ? "…" : "Ver preço"}
          </button>
          {last != null && <span className="text-sm text-muted-foreground">Último: <span className="num text-foreground">{last}</span></span>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Spot demo (<code>tdMode: cash</code>). Em <strong>compra a mercado</strong>, o tamanho é em moeda de cotação (ex.: USDT); em <strong>venda</strong>, na moeda base (ex.: BTC). Tudo é dinheiro fake — serve só para validar a conexão e a execução.
        </p>
      </div>

      {/* Log de ordens */}
      {orders.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Últimas ordens (demo)</h2>
          <div className="space-y-1.5">
            {orders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${o.ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{o.ok ? "ok" : "erro"}</span>
                <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-foreground">{o.side === "buy" ? "compra" : "venda"} {o.sz} {o.inst_id} ({o.ord_type})</span>
                {!o.ok && o.result?.data?.[0]?.sMsg && <span className="text-rose-500">{o.result.data[0].sMsg}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
