import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan, PriceRow, SnapshotPayload } from "../lib/types";

/**
 * Lê a visão consolidada do ativo conforme o plano:
 *  - Pro/Expert: `market_snapshot.payload` (tudo já consolidado pelo coletor);
 *  - Free: monta um payload mínimo de `prices_cex` + `sentiment` (o RLS impede
 *    o Free de ler o snapshot completo).
 * Assina o Realtime do Supabase para atualizar sem polling.
 */
export function useSnapshot(asset: string, plan: Plan | null) {
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!plan) return;
    let active = true;

    async function loadAdvanced() {
      const { data } = await supabase
        .from("market_snapshot")
        .select("payload, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setPayload((data?.payload as SnapshotPayload) ?? null);
      setUpdatedAt(data?.ts ?? null);
    }

    async function loadBasic() {
      const [{ data: prices }, { data: sent }] = await Promise.all([
        supabase
          .from("prices_cex")
          .select("*")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(4),
        supabase
          .from("sentiment")
          .select("*")
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!active) return;

      const byExchange: Record<string, PriceRow> = {};
      for (const row of (prices ?? []) as PriceRow[]) {
        if (!byExchange[row.exchange]) byExchange[row.exchange] = row;
      }
      const built: SnapshotPayload = {
        asset,
        generated_at: new Date().toISOString(),
        price: Object.keys(byExchange).length ? byExchange : null,
        derivatives: null,
        gamma: null,
        onchain_perps: null,
        dex_liquidity: null,
        defi_health: null,
        sentiment: sent ? { fng_value: sent.fng_value, classification: sent.classification } : null,
        macro: null,
        news: [],
      };
      setPayload(built);
      setUpdatedAt((prices?.[0] as PriceRow & { ts?: string })?.ts ?? null);
    }

    const refresh = advanced ? loadAdvanced : loadBasic;
    setLoading(true);
    refresh().finally(() => {
      if (active) setLoading(false);
    });

    const table = advanced ? "market_snapshot" : "prices_cex";
    const channel = supabase
      .channel(`snapshot-${asset}-${plan.slug}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table, filter: `asset=eq.${asset}` },
        () => refresh(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [asset, plan, advanced]);

  return { payload, updatedAt, loading };
}
