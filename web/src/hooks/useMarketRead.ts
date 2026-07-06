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
  // Novas forças 07/jul: paredes do book + delta/VWAP do dia + COT CME.
  const [extras, setExtras] = useState<{
    walls: { price: number; notional_usd: number }[] | null;
    dayFlow: { delta: number; vol: number; vwap: number | null } | null;
    cot: { instNet: number; instNetChg: number; date: string } | null;
  } | null>(null);
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
      // Paredes de baleia (snapshot mais recente). Opcional.
      let walls: { price: number; notional_usd: number }[] | null = null;
      try {
        const { data } = await supabase
          .from("orderbook_walls")
          .select("price, notional_usd, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(40);
        const rows = (data ?? []) as Array<{ price: number; notional_usd: number; ts: string }>;
        if (rows.length) walls = rows.filter((r) => r.ts === rows[0].ts).map((r) => ({ price: Number(r.price), notional_usd: Number(r.notional_usd) }));
      } catch {
        /* opcional */
      }
      // Delta/volume/VWAP do DIA — klines 15m com volume taker (campos 7/10). Opcional.
      let dayFlow: { delta: number; vol: number; vwap: number | null } | null = null;
      try {
        const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${asset}USDT&interval=15m&startTime=${dayStart}&limit=200`);
        if (res.ok) {
          const rows = (await res.json()) as unknown[][];
          let delta = 0, vol = 0, pv = 0, vv = 0;
          for (const r of rows) {
            const quote = Number(r[7]) || 0, takerBuy = Number(r[10]) || 0;
            delta += 2 * takerBuy - quote;
            vol += quote;
            const hi = Number(r[2]), lo = Number(r[3]), cl = Number(r[4]), bv = Number(r[5]) || 0;
            if (bv > 0) { pv += ((hi + lo + cl) / 3) * bv; vv += bv; }
          }
          if (rows.length) dayFlow = { delta, vol, vwap: vv > 0 ? pv / vv : null };
        }
      } catch {
        /* opcional */
      }
      // COT cripto (CME, semanal). BTC serve de proxy market-wide p/ alts sem série própria.
      let cot: { instNet: number; instNetChg: number; date: string } | null = null;
      try {
        const { data } = await supabase
          .from("cot_positioning")
          .select("asset, report_date, asset_mgr_net, asset_mgr_net_chg")
          .in("asset", [asset, "BTC"])
          .order("report_date", { ascending: false })
          .limit(4);
        const rows = (data ?? []) as Array<{ asset: string; report_date: string; asset_mgr_net: number | null; asset_mgr_net_chg: number | null }>;
        const own = rows.find((r) => r.asset === asset) ?? rows.find((r) => r.asset === "BTC");
        if (own && own.asset_mgr_net != null) cot = { instNet: Number(own.asset_mgr_net), instNetChg: Number(own.asset_mgr_net_chg ?? 0), date: own.report_date };
      } catch {
        /* opcional */
      }
      if (!alive) return;
      setExtras({ walls, dayFlow, cot });
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
    () => (enabled ? computeMarketRead(c1d, payload, c4h, oiDelta, bookImbalance, macro, btcChg7d, extras) : null),
    // isEn nas deps: a leitura monta strings traduzidas (confluence.ts via getLocale),
    // então precisa recomputar ao trocar de idioma.
    [enabled, c1d, payload, c4h, oiDelta, bookImbalance, macro, btcChg7d, extras, isEn],
  );
  const leans = useMemo<TfLean[]>(
    () => (enabled ? [timeframeLean("1D", c1d), timeframeLean("4H", c4h), timeframeLean("1H", c1h)] : EMPTY_LEANS),
    [enabled, c1d, c4h, c1h, isEn],
  );

  return { read, leans, biasHist, loading };
}
