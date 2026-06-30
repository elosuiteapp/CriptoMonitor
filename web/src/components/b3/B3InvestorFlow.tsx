import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";
import InfoTip from "../InfoTip";

interface FlowRow {
  date: string;
  foreign_mi: number | null;
  institutional_mi: number | null;
  retail_mi: number | null;
  financial_mi: number | null;
  other_mi: number | null;
}

const fmtMi = (v: number | null) => {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "−";
  const a = Math.abs(v);
  return a >= 1000 ? `${s}R$ ${(a / 1000).toFixed(2)} bi` : `${s}R$ ${a.toFixed(0)} mi`;
};
const tone = (v: number | null) => (v == null ? "text-muted-foreground" : v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400");
const sum = (rows: FlowRow[], k: keyof FlowRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

const TYPES: { key: keyof FlowRow; label: string }[] = [
  { key: "foreign_mi", label: "Estrangeiro" },
  { key: "institutional_mi", label: "Institucional" },
  { key: "retail_mi", label: "Pessoa física" },
  { key: "financial_mi", label: "Inst. financeira" },
  { key: "other_mi", label: "Outros" },
];

/** Fluxo de investimento na B3 por tipo de investidor (estrangeiro/institucional/PF…).
 *  O diferencial do TradeMap — quem está comprando/vendendo a bolsa. Market-wide,
 *  diário (R$ milhões). Lê b3_investor_flow. Isolado. */
export default function B3InvestorFlow() {
  const [rows, setRows] = useState<FlowRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("b3_investor_flow")
      .select("date, foreign_mi, institutional_mi, retail_mi, financial_mi, other_mi")
      .order("date", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (alive) setRows((data as FlowRow[]) ?? []);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (rows == null) return <div className="h-32 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (rows.length === 0) return null;

  const latest = rows[0];
  const last5 = rows.slice(0, 5);
  const fSum5 = sum(last5, "foreign_mi");
  const fSumMo = sum(rows.slice(0, 20), "foreign_mi");
  // Mini-barras do fluxo estrangeiro (mais antigo → recente)
  const bars = rows.slice(0, 22).reverse();
  const maxAbs = Math.max(1, ...bars.map((r) => Math.abs(Number(r.foreign_mi) || 0)));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Fluxo por investidor · B3
          <InfoTip text="Mostra quem comprou e quem vendeu a bolsa a cada dia (em R$), separado por tipo: estrangeiro, institucional (fundos), pessoa física, instituição financeira e outros. O estrangeiro costuma puxar o IBOV — se ele está vendendo forte, é sinal de cautela. É o fluxo do mercado todo, não de uma ação só." />
        </h3>
        <span className="num text-[11px] text-muted-foreground">{new Date(latest.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">Quem comprou/vendeu a bolsa no dia (líquido, R$). O estrangeiro costuma liderar o IBOV.</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TYPES.map((t) => (
          <div key={t.key} className="rounded-xl border border-border/70 bg-background/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className={`num text-sm font-bold ${tone(latest[t.key] as number | null)}`}>{fmtMi(latest[t.key] as number | null)}</div>
          </div>
        ))}
      </div>

      {/* Estrangeiro — acumulado + mini-barras */}
      <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-foreground">Estrangeiro · tendência</span>
          <span className="text-muted-foreground">5 dias <span className={`num font-semibold ${tone(fSum5)}`}>{fmtMi(fSum5)}</span> · 20 dias <span className={`num font-semibold ${tone(fSumMo)}`}>{fmtMi(fSumMo)}</span></span>
        </div>
        <div className="flex h-12 items-center gap-px">
          {bars.map((r, i) => {
            const v = Number(r.foreign_mi) || 0;
            const h = (Math.abs(v) / maxAbs) * 100;
            return (
              <div key={i} className="flex h-full flex-1 flex-col justify-center" title={`${new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR")}: ${fmtMi(v)}`}>
                <div className="flex h-1/2 items-end">{v >= 0 && <div className="w-full rounded-sm bg-emerald-500/70" style={{ height: `${h}%` }} />}</div>
                <div className="flex h-1/2 items-start">{v < 0 && <div className="w-full rounded-sm bg-rose-500/70" style={{ height: `${h}%` }} />}</div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Saldo do estrangeiro nos últimos ~22 pregões (verde = entrada · vermelho = saída).</p>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Fluxo market-wide (não por ação). Atualização diária. Fonte: dadosdemercado.</p>
    </div>
  );
}
