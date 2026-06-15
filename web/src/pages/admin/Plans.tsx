import { useEffect, useState } from "react";

import { Card, Empty, ErrorBox, SectionTitle } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtBRL } from "../../lib/adminFormat";
import type { PlanRow } from "../../lib/adminTypes";

const ALL_ASSETS = ["BTC", "ETH", "SOL"];
const ALL_CHANNELS = ["email", "whatsapp"];

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
      <div>
        <h1 className="text-2xl font-bold text-white">Planos</h1>
        <p className="text-sm text-slate-500">
          Os limites do produto são parametrizados aqui — alterar um valor muda o gating na hora, sem deploy.
        </p>
      </div>
      {error && <ErrorBox message={error} />}
      {!plans && <Empty>Carregando…</Empty>}
      {plans?.map((p) => (
        <PlanEditor key={p.id} plan={p} onSaved={load} />
      ))}
    </div>
  );
}

function PlanEditor({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [priceReais, setPriceReais] = useState((plan.price_cents / 100).toString());
  const [assets, setAssets] = useState<string[]>(plan.assets);
  const [snapMin, setSnapMin] = useState(plan.snapshot_interval_min.toString());
  const [advanced, setAdvanced] = useState(plan.advanced_metrics);
  const [chartLayers, setChartLayers] = useState(plan.chart_layers);
  const [aiLimit, setAiLimit] = useState(plan.ai_daily_limit == null ? "" : plan.ai_daily_limit.toString());
  const [aiModel, setAiModel] = useState(plan.ai_model);
  const [channels, setChannels] = useState<string[]>(plan.alert_channels);
  const [historyDays, setHistoryDays] = useState(plan.history_days == null ? "" : plan.history_days.toString());

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      p_assets: assets,
      p_snapshot_interval_min: parseInt(snapMin || "30", 10),
      p_advanced: advanced,
      p_chart_layers: chartLayers,
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
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100";
  const labelCls = "text-xs text-slate-400";

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <SectionTitle hint={`slug: ${plan.slug}`}>{plan.name}</SectionTitle>
        <span className="text-sm font-semibold text-slate-300">{fmtBRL(Math.round(parseFloat(priceReais || "0") * 100))}/mês</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelCls}>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Preço mensal (R$)
          <input type="number" step="0.01" min="0" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Modelo de IA
          <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Snapshot (min)
          <input type="number" min="1" value={snapMin} onChange={(e) => setSnapMin(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Limite diário de IA <span className="text-slate-600">(vazio = ilimitado)</span>
          <input type="number" min="0" value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Histórico (dias) <span className="text-slate-600">(vazio = completo)</span>
          <input type="number" min="0" value={historyDays} onChange={(e) => setHistoryDays(e.target.value)} className={inputCls} />
        </label>
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
                {c === "email" ? "E-mail" : "WhatsApp"}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Check label="Métricas avançadas" checked={advanced} onChange={setAdvanced} />
        <Check label="Camadas no gráfico" checked={chartLayers} onChange={setChartLayers} />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar plano"}
        </button>
        {msg && <span className="text-xs text-signal-green">{msg}</span>}
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
        active ? "border-accent bg-accent/15 text-accent" : "border-ink-500 text-slate-400 hover:bg-ink-700"
      }`}
    >
      {children}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );
}
