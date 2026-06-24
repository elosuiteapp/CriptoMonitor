// Resumo compacto da "Leitura do Mercado" (motor de confluência) para alimentar a IA.
// Em vez de a IA re-derivar tudo do snapshot cru, ela recebe a leitura JÁ computada
// (viés/convicção/regime/divergências/alvos) — a MESMA da aba Leitura do Mercado —
// para narrar de forma consistente com o que o app mostra. As strings já vêm no
// idioma atual (computeMarketRead usa getLocale), casando com o lang enviado à IA.

import { computeMarketRead } from "./indicators/confluence";
import { fetchKlines } from "./marketData";
import { supabase } from "./supabase";
import type { SnapshotPayload } from "./types";

export async function marketReadSummary(asset: string) {
  try {
    const [candles, snap] = await Promise.all([
      fetchKlines(asset, "1d", 320).catch(() => []),
      supabase.from("market_snapshot").select("payload").eq("asset", asset).order("ts", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!candles.length) return null;
    const payload = (snap.data?.payload ?? null) as SnapshotPayload | null;
    const r = computeMarketRead(candles, payload);
    if (!r.hasData) return null;
    return {
      bias: r.bias, // −100..+100
      conviction: r.conviction, // 0..100
      regime: r.regime.label,
      character: r.character,
      divergences: r.divergences.slice(0, 3),
      targets: r.targets.slice(0, 4).map((t) => ({ label: t.label, price: Math.round(t.price), dir: t.dir, dist_pct: Number(t.distPct.toFixed(1)) })),
      falsifier: r.falsifier,
    };
  } catch {
    return null;
  }
}
