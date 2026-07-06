import { useEffect, useState } from "react";

import { IconPlans } from "../../components/admin/icons";
import { Card, Empty, ErrorBox, PageHeader, SectionTitle } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtBRL, fmtUSD } from "../../lib/adminFormat";
import type { PlanRow } from "../../lib/adminTypes";

const ALL_ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "POL", "DOT", "LTC", "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE"];
const ALL_CHANNELS = ["inapp", "email"];
const ALL_MODULES = [{ key: "crypto", label: "Cripto" }, { key: "b3", label: "B3" }, { key: "forex", label: "Forex" }];

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("plans").select("*").order("sort_order");
    if (error) setError(error.message);
    else setPlans(data as PlanRow[]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconPlans />}
        title="Planos"
        subtitle="Limites e preços do produto — alterar um valor muda o gating na hora, sem deploy."
      />
      <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        Cobrança por idioma: <b className="text-foreground">PT → Asaas (reais)</b> usa o preço em R$;{" "}
        <b className="text-foreground">EN → Paddle (dólar)</b> usa o preço em US$ e o <i>Paddle price id</i> do plano.
      </div>
      {error && <ErrorBox message={error} />}
      {!plans && !error && <Empty>Carregando…</Empty>}
      {plans?.map((p) => (
        <PlanEditor key={p.id} plan={p} onSaved={load} />
      ))}
    </div>
  );
}

function PlanEditor({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [priceReais, setPriceReais] = useState((plan.price_cents / 100).toString());
  const [priceUsd, setPriceUsd] = useState((plan.price_usd_cents / 100).toString());
  const [annualReais, setAnnualReais] = useState(((plan.price_annual_cents ?? 0) / 100).toString());
  const [annualUsd, setAnnualUsd] = useState(((plan.price_usd_annual_cents ?? 0) / 100).toString());
  const [modules, setModules] = useState<string[]>(plan.modules ?? []);
  const [paddleId, setPaddleId] = useState(plan.paddle_price_id ?? "");
  const [assets, setAssets] = useState<string[]>(plan.assets);
  const [snapMin, setSnapMin] = useState(plan.snapshot_interval_min.toString());
  const [advanced, setAdvanced] = useState(plan.advanced_metrics);
  const [chartLayers, setChartLayers] = useState(plan.chart_layers);
  const [smartMoney, setSmartMoney] = useState(plan.smart_money);
  const [aiLimit, setAiLimit] = useState(plan.ai_daily_limit == null ? "" : plan.ai_daily_limit.toString());
  const [aiModel, setAiModel] = useState(plan.ai_model);
  const [channels, setChannels] = useState<string[]>(plan.alert_channels);
  const [historyDays, setHistoryDays] = useState(plan.history_days == null ? "" : plan.history_days.toString());

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isPaid = plan.slug !== "free";

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase.rpc("admin_update_plan", {
      p_slug: plan.slug,
      p_name: name,
      p_price_cents: Math.round(parseFloat(priceReais || "0") * 100),
      p_price_usd_cents: Math.round(parseFloat(priceUsd || "0") * 100),
      p_price_annual_cents: Math.round(parseFloat(annualReais || "0") * 100),
      p_price_usd_annual_cents: Math.round(parseFloat(annualUsd || "0") * 100),
      p_paddle_price_id: paddleId.trim() || null,
      p_modules: modules,
      p_preview_layers: plan.preview_layers ?? [],
      p_assets: assets,
      p_snapshot_interval_min: parseInt(snapMin || "30", 10),
      p_advanced: advanced,
      p_chart_layers: chartLayers,
      p_smart_money: smartMoney,
      p_ai_daily_limit: aiLimit === "" ? null : parseInt(aiLimit, 10),
      p_ai_model: aiModel,
      p_alert_channels: channels,
      p_history_days: historyDays === "" ? null : parseInt(historyDays, 10),
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Plano salvo.");
      onSaved();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";
  const labelCls = "text-xs text-muted-foreground";

  return (
    <Card className="p-5" hover>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle hint={`slug: ${plan.slug}`}>{plan.name}</SectionTitle>
        <span className="text-sm text-muted-foreground">
          <span className="num font-semibold text-foreground">{fmtBRL(Math.round(parseFloat(priceReais || "0") * 100))}</span>
          {isPaid && (
            <>
              {" · "}
              <span className="num font-semibold text-foreground">{fmtUSD(Math.round(parseFloat(priceUsd || "0") * 100))}</span>
            </>
          )}
          <span className="text-muted-foreground">/mês</span>
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelCls}>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Preço mensal — reais (R$)
          <input type="number" step="0.01" min="0" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Preço mensal — dólar (US$)
          <input type="number" step="0.01" min="0" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Preço anual — reais (R$)
          <input type="number" step="0.01" min="0" value={annualReais} onChange={(e) => setAnnualReais(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Preço anual — dólar (US$)
          <input type="number" step="0.01" min="0" value={annualUsd} onChange={(e) => setAnnualUsd(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Modelo de IA
          <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Snapshot (min)
          <input type="number" min="1" value={snapMin} onChange={(e) => setSnapMin(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Limite diário de IA <span className="text-muted-foreground">(vazio = ilimitado)</span>
          <input type="number" min="0" value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          Histórico (dias) <span className="text-muted-foreground">(vazio = completo)</span>
          <input type="number" min="0" value={historyDays} onChange={(e) => setHistoryDays(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          Paddle price id <span className="text-muted-foreground">(checkout em dólar / EN)</span>
          <input value={paddleId} onChange={(e) => setPaddleId(e.target.value)} placeholder="pri_01h…" className={`num ${inputCls}`} />
        </label>
      </div>

      <div className="mt-4">
        <div className={labelCls}>Módulos que o plano libera <span className="text-muted-foreground">(gating por módulo — a base do entitlement)</span></div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_MODULES.map((m) => (
            <Chip key={m.key} active={modules.includes(m.key)} onClick={() => toggle(modules, setModules, m.key)}>{m.label}</Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className={labelCls}>Ativos liberados</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_ASSETS.map((a) => (
              <Chip key={a} active={assets.includes(a)} onClick={() => toggle(assets, setAssets, a)}>{a}</Chip>
            ))}
          </div>
        </div>
        <div>
          <div className={labelCls}>Canais de alerta</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {ALL_CHANNELS.map((c) => (
              <Chip key={c} active={channels.includes(c)} onClick={() => toggle(channels, setChannels, c)}>
                {c === "inapp" ? "In-app + push" : c === "email" ? "E-mail" : c}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Check label="Métricas avançadas" checked={advanced} onChange={setAdvanced} />
        <Check label="Camadas no gráfico" checked={chartLayers} onChange={setChartLayers} />
        <Check label="Smart Money (SMC)" checked={smartMoney} onChange={setSmartMoney} />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar plano"}
        </button>
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}
