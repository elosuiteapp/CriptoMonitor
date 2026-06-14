import { useEffect, useState } from "react";

import { readOiDelta } from "../lib/format";
import { supabase } from "../lib/supabase";
import MetricCard from "./MetricCard";

interface OiDeltaRow {
  oi_delta_4h: number | null;
  price_delta_4h: number | null;
}

/** Card de Delta de OI (PRD3 §8.8.4) — lê a view v_oi_delta (Pro+ via RLS). */
export default function OIDeltaCard({ asset, timestamp }: { asset: string; timestamp: string | null }) {
  const [row, setRow] = useState<OiDeltaRow | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("v_oi_delta")
      .select("oi_delta_4h, price_delta_4h")
      .eq("asset", asset)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setRow((data as OiDeltaRow) ?? null);
      });
    return () => {
      active = false;
    };
  }, [asset]);

  return (
    <MetricCard
      title="Delta de Open Interest"
      reading={readOiDelta(row?.oi_delta_4h, row?.price_delta_4h)}
      source="Coinalyze (4h)"
      timestamp={timestamp}
    />
  );
}
