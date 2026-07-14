import type { OrderRow } from "./types";

// Moeda de uma ordem a partir do inst_id (BTCUSDT / BTC-USDT-SWAP → BTC); "" quando não há inst_id.
export const assetOf = (o: OrderRow) => (o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "");

// Um round-trip fechado reconstruído a partir das ordens (ver buildClosedTrades).
export interface ClosedTrade {
  id: string;
  asset: string;
  wasLong: boolean;
  entry: number | null;
  exit: number | null;
  sz: number | null;
  pnl: number | null;
  pct: number | null;
  source: string;
  at: string;
  openAt: string | null;
  durMin: number | null;
  reason: string;
  estimated: boolean;
  note: string;
}

// TRADES ENCERRADOS: cada ordem de fechamento (action='close', ok) é um round-trip fechado.
// O PnL realizado já vem salvo; a entrada média é reconstruída: entry = saída − PnL/(tam·direção).
// Quando o fill não voltou (demo atrasa e salva sem preço/PnL), PAREIA com as aberturas do CICLO
// (mesma moeda, entre o fechamento anterior e este) → recupera entrada, duração e PnL estimado (≈).
// O motivo do fechamento vem da nota da ordem (stop / alvo / trailing / manual / reversão).
export function buildClosedTrades(orders: OrderRow[]): ClosedTrade[] {
  const tms = (iso: string) => new Date(iso).getTime();
  return orders
    .filter((o) => o.action === "close" && o.ok)
    .map((o) => {
      const asset = o.inst_id ? o.inst_id.toUpperCase().replace(/USDT$/, "").replace(/-.*/, "") : "—";
      const wasLong = o.side === "sell"; // fechou LONG vendendo; SHORT comprando
      const dir = wasLong ? 1 : -1;
      let exit = o.avg_px != null ? Number(o.avg_px) : null;
      const sz = o.sz != null && o.sz !== "" ? Number(o.sz) : null;
      let pnl = o.pnl != null ? Number(o.pnl) : null;
      // Aberturas do ciclo: mesma moeda, depois do close anterior e antes deste, no lado da posição.
      const prevCloseT = orders.reduce((m, x) => (x.inst_id === o.inst_id && x.action === "close" && x.ok && tms(x.created_at) < tms(o.created_at) && tms(x.created_at) > m ? tms(x.created_at) : m), 0);
      const cycleOpens = orders
        .filter((x) => x.inst_id === o.inst_id && x.ok && x.action !== "close" && x.side !== o.side && tms(x.created_at) < tms(o.created_at) && tms(x.created_at) > prevCloseT)
        .sort((a, b) => tms(a.created_at) - tms(b.created_at));
      const openAt = cycleOpens[0]?.created_at ?? null;
      let entry = exit != null && sz && pnl != null && sz !== 0 ? exit - pnl / (sz * dir) : null;
      let estimated = false;
      if (entry == null && cycleOpens.length) {
        // fallback: entrada = média ponderada das aberturas do ciclo (fill do close não voltou)
        let q = 0, qv = 0;
        for (const x of cycleOpens) { const p = x.avg_px != null ? Number(x.avg_px) : null; const xs = x.sz ? Number(x.sz) : null; if (p && xs) { q += xs; qv += p * xs; } }
        if (q > 0) { entry = qv / q; estimated = true; }
      }
      if (exit == null && entry != null && pnl != null && sz) { exit = entry + pnl / (sz * dir); estimated = true; }
      if (pnl == null && entry != null && exit != null && sz) { pnl = (exit - entry) * sz * dir; estimated = true; }
      const pct = entry && entry !== 0 && exit != null ? ((exit - entry) / entry) * 100 * dir : null;
      const durMin = openAt ? Math.max(0, Math.round((tms(o.created_at) - tms(openAt)) / 60000)) : null;
      const note = o.note ?? "";
      const reason = /ALVO/i.test(note) ? "🎯 alvo" : /STOP MÓVEL/i.test(note) ? "🛡️ trailing" : /STOP/i.test(note) ? "🛑 stop" : /manual/i.test(note) ? "✋ manual" : o.source === "auto" ? "↩ reversão" : "✋ manual";
      return { id: o.id, asset, wasLong, entry, exit, sz, pnl, pct, source: o.source, at: o.created_at, openAt, durMin, reason, estimated, note };
    });
}
