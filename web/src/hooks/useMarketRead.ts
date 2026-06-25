import { useEffect, useMemo, useState } from "react";

import { useT } from "../lib/i18n";
import {
  computeMarketRead,
  timeframeLean,
  type MarketRead,
  type TfLean,
} from "../lib/indicators/confluence";
import { fetchKlines, type Candle } from "../lib/marketData";
import { supabase } from "../lib/supabase";
import type { SnapshotPayload } from "../lib/types";

type MacroCtx = {
  vixChg: number;
  dxyChg: number;
  us10yChg: number;
  nlChg?: number | null;
  nfci?: number | null;
} | null;

export interface MarketReadState {
  read: MarketRead | null; // null quando o recurso está desligado (não-Expert)
  leans: TfLean[]; // alinhamento multi-timeframe (1D/4H/1H)
  biasHist: number[]; // histórico do viés (sparkline)
  loading: boolean;
}

const EMPTY_LEANS: TfLean[] = [];

/**
 * Computa a "Leitura do Mercado" (motor de confluência) UMA vez no nível do
 * cockpit, para que o badge do header e a aba Leitura do Mercado compartilhem
 * exatamente os MESMOS números (viés/convicção/regime). Busca velas 1D/4H/1H +
 * OI-delta + maré macro + histórico do viés; cruza com o snapshot e a pressão do
 * book (já calculada no Dashboard). Só busca quando `enabled` (recurso Expert);
 * caso contrário devolve `read: null` sem tocar a rede.
 */
export function useMarketRead(
  asset: string,
  payload: SnapshotPayload | null,
  bookImbalance: number | null,
  enabled: boolean,
): MarketReadState {
  const { isEn } = useT();
  const [c1d, setC1d] = useState<Candle[]>([]);
  const [c4h, setC4h] = useState<Candle[]>([]);
  const [c1h, setC1h] = useState<Candle[]>([]);
  const [oiDelta, setOiDelta] = useState<number | null>(null);
  const [macro, setMacro] = useState<MacroCtx>(null);
  const [biasHist, setBiasHist] = useState<number[]>([]);
  const [btcChg7d, setBtcChg7d] = useState<number | null>(null); // 7d do BTC (rotação de liderança)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const [d, h4, h1, btc] = await Promise.all([
        fetchKlines(asset, "1d", 365).catch(() => [] as Candle[]),
        fetchKlines(asset, "4h", 300).catch(() => [] as Candle[]),
        fetchKlines(asset, "1h", 300).catch(() => [] as Candle[]),
        asset === "BTC" ? Promise.resolve([] as Candle[]) : fetchKlines("BTC", "1d", 10).catch(() => [] as Candle[]),
      ]);
      const bChg7d = btc.length >= 8 ? (btc[btc.length - 1].close - btc[btc.length - 8].close) / btc[btc.length - 8].close : null;
      // OI-delta 24h (tabela derivatives — convicção do movimento). Opcional.
      let oi: number | null = null;
      try {
        const { data } = await supabase
          .from("derivatives")
          .select("open_interest, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(300);
        const rows = (data ?? []) as Array<{ open_interest: number | null; ts: string }>;
        if (rows.length) {
          const now = Number(rows[0].open_interest);
          const cutoff = Date.now() - 24 * 3600 * 1000;
          const old = rows.find((r) => new Date(r.ts).getTime() <= cutoff);
          const oldOi = old ? Number(old.open_interest) : NaN;
          if (Number.isFinite(now) && Number.isFinite(oldOi) && oldOi > 0) oi = ((now - oldOi) / oldOi) * 100;
        }
      } catch {
        /* OI é opcional */
      }
      // Maré macro (VIX/DXY/juros via macro_assets — risk-on/off). Opcional.
      let macroCtx: MacroCtx = null;
      try {
        const { data } = await supabase
          .from("macro_assets")
          .select("symbol, change_7d, ts")
          .in("symbol", ["VIX", "DXY", "US10Y"])
          .order("ts", { ascending: false })
          .limit(30);
        const rows = (data ?? []) as Array<{ symbol: string; change_7d: number | null; ts: string }>;
        if (rows.length) {
          const latestTs = rows[0].ts;
          const at = rows.filter((r) => r.ts === latestTs);
          const g = (s: string) => Number(at.find((r) => r.symbol === s)?.change_7d);
          const vix = g("VIX");
          const dxy = g("DXY");
          const us10y = g("US10Y");
          if ([vix, dxy, us10y].every((v) => Number.isFinite(v))) macroCtx = { vixChg: vix, dxyChg: dxy, us10yChg: us10y };
        }
        // Maré de liquidez do Fed (FRED via macro_global) — junta na maré macro.
        const { data: mg } = await supabase
          .from("macro_global")
          .select("nl_chg_30d_pct, nfci")
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (macroCtx && mg) {
          macroCtx.nlChg = (mg as { nl_chg_30d_pct: number | null }).nl_chg_30d_pct;
          macroCtx.nfci = (mg as { nfci: number | null }).nfci;
        }
      } catch {
        /* macro opcional */
      }
      // Histórico do viés p/ sparkline (market_read — Fase 2). Opcional.
      let bh: number[] = [];
      try {
        const { data } = await supabase
          .from("market_read")
          .select("bias, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(48);
        bh = ((data ?? []) as Array<{ bias: number }>).map((r) => Number(r.bias)).filter((v) => Number.isFinite(v)).reverse();
      } catch {
        /* opcional */
      }
      if (!alive) return;
      setC1d(d);
      setC4h(h4);
      setC1h(h1);
      setOiDelta(oi);
      setMacro(macroCtx);
      setBiasHist(bh);
      setBtcChg7d(bChg7d);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [asset, enabled]);

  const read = useMemo(
    () => (enabled ? computeMarketRead(c1d, payload, c4h, oiDelta, bookImbalance, macro, btcChg7d) : null),
    // isEn nas deps: a leitura monta strings traduzidas (confluence.ts via getLocale),
    // então precisa recomputar ao trocar de idioma.
    [enabled, c1d, payload, c4h, oiDelta, bookImbalance, macro, btcChg7d, isEn],
  );
  const leans = useMemo<TfLean[]>(
    () => (enabled ? [timeframeLean("1D", c1d), timeframeLean("4H", c4h), timeframeLean("1H", c1h)] : EMPTY_LEANS),
    [enabled, c1d, c4h, c1h, isEn],
  );

  return { read, leans, biasHist, loading };
}
