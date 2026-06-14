import { useEffect, useState } from "react";

import { readExchangeFlow } from "../lib/format";
import { supabase } from "../lib/supabase";
import MetricCard from "./MetricCard";

interface FlowRow {
  exchange: string;
  netflow_24h: number | null;
  netflow_7d: number | null;
  ts: string;
}

/** Aba "Smart Money & On-chain" (PRD §8.7 / §8.8.2) — Expert.
 *  Exibe exchange flows quando houver dados; a coleta on-chain depende de fonte
 *  dedicada (APIs gratuitas bloqueiam coleta frequente). */
export default function SmartMoneyTab({ asset }: { asset: string }) {
  const [flows, setFlows] = useState<FlowRow[]>([]);

  useEffect(() => {
    let active = true;
    supabase
      .from("exchange_flows")
      .select("exchange, netflow_24h, netflow_7d, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (active) setFlows((data as FlowRow[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [asset]);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Smart Money & On-chain · {asset}</h2>

      {flows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((f, i) => (
            <MetricCard
              key={i}
              title={`Exchange flows · ${f.exchange}`}
              reading={readExchangeFlow(f.netflow_24h, asset)}
              source="On-chain"
              timestamp={f.ts}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-400">
          <p className="text-slate-300">Fluxo de exchanges, whale alerts, MVRV e cronograma de unlocks.</p>
          <p className="mt-2 text-slate-500">
            Integração on-chain pendente: as APIs gratuitas (Blockchair) bloqueiam coleta frequente
            (HTTP 430) e poucas carteiras não representam o fluxo total. O exchange netflow confiável
            requer uma fonte dedicada (ex.: CryptoQuant) ou um indexador próprio — a tabela e esta
            tela já estão prontas para receber os dados.
          </p>
        </div>
      )}
    </section>
  );
}
