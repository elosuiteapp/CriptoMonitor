import { useEffect, useId, useState } from "react";

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
  // ID único por instância do hook → nomes de canal realtime distintos. Sem isso,
  // dois consumidores do MESMO ativo/plano (ex.: cockpit + aba Smart Money) criavam
  // canais homônimos e o 2º `.subscribe()` lançava erro (derrubava a aba).
  const channelId = useId();

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
      const [{ data: prices }, { data: sent }, { data: g }] = await Promise.all([
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
        // Vitrine do Free: as paredes de opções do gráfico (Call/Put Wall, Zero
        // Gamma, Max Pain) vêm direto do gamma_profile — o RLS (sql/053) libera o
        // preview para os ativos do plano (Free = BTC). Sem opções → fica null.
        supabase
          .from("gamma_profile")
          .select("zero_gamma_level, regime, max_pain, max_pain_expiry, net_gex_spot, spot_price, profile_jsonb")
          .eq("asset", asset)
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
        coinbase_premium:
          byExchange.coinbase?.price != null && byExchange.binance?.price
            ? (byExchange.coinbase.price - byExchange.binance.price) / byExchange.binance.price
            : null,
        derivatives: null,
        gamma: g
          ? {
              zero_gamma_level: g.zero_gamma_level ?? null,
              regime: (g.regime as "positive" | "negative" | null) ?? null,
              max_pain: g.max_pain ?? null,
              max_pain_expiry: g.max_pain_expiry ?? null,
              net_gex_spot: g.net_gex_spot ?? null,
              spot_price: g.spot_price ?? null,
              profile_jsonb: (g.profile_jsonb as Record<string, number> | null) ?? null,
              put_call_ratio: null,
              avg_iv: null,
              iv_skew: null,
            }
          : null,
        onchain_perps: null,
        dex_liquidity: null,
        defi_health: null,
        sentiment: sent ? { fng_value: sent.fng_value, classification: sent.classification } : null,
        macro: null,
        etf_flows: null,
        liquidity: null,
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
      .channel(`snapshot-${asset}-${plan.slug}-${channelId}`)
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
  }, [asset, plan, advanced, channelId]);

  return { payload, updatedAt, loading };
}
