import type { Dispatch, SetStateAction } from "react";

import type { Config } from "../../../lib/bot/types";

/** Ordem manual (avançado) — formulário de envio manual à corretora (demo). */
export default function ManualOrder({ showManual, setShowManual, cfg, input, mSide, setMSide, mOrdType, setMOrdType, mSz, setMSz, mPx, setMPx, isFut, placeManual, busy, connected }: {
  showManual: boolean;
  setShowManual: Dispatch<SetStateAction<boolean>>;
  cfg: Config | null;
  input: string;
  mSide: "buy" | "sell";
  setMSide: Dispatch<SetStateAction<"buy" | "sell">>;
  mOrdType: "market" | "limit";
  setMOrdType: Dispatch<SetStateAction<"market" | "limit">>;
  mSz: string;
  setMSz: Dispatch<SetStateAction<string>>;
  mPx: string;
  setMPx: Dispatch<SetStateAction<string>>;
  isFut: boolean;
  placeManual: () => void;
  busy: string | null;
  connected: boolean;
}) {
  return (
      <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
        <button onClick={() => setShowManual((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
          <span>Ordem manual (avançado)</span>
          <span className="text-muted-foreground">{showManual ? "▲" : "▼"}</span>
        </button>
        {showManual && cfg && (
          <div className="mt-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select className={input} value={mSide} onChange={(e) => setMSide(e.target.value as "buy" | "sell")}><option value="buy">Comprar</option><option value="sell">Vender</option></select>
              <select className={input} value={mOrdType} onChange={(e) => setMOrdType(e.target.value as "market" | "limit")}><option value="market">A mercado</option><option value="limit">Limite</option></select>
              <input className={input} placeholder={isFut ? "Tamanho em USDT (ex.: 50)" : mSide === "buy" ? `Tamanho em ${cfg.quote_ccy} (ex.: 50)` : `Tamanho em ${cfg.base_ccy} (ex.: 0.001)`} value={mSz} onChange={(e) => setMSz(e.target.value)} />
              <input className={input} placeholder="Preço (limite)" value={mPx} onChange={(e) => setMPx(e.target.value)} disabled={mOrdType !== "limit"} />
            </div>
            <button onClick={placeManual} disabled={busy !== null || !connected} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">{busy === "manual" ? "Enviando…" : `Enviar ${mSide === "buy" ? "compra" : "venda"} de ${cfg.inst_id} (demo)`}</button>
            <p className="mt-2 text-[11px] text-muted-foreground">{isFut ? `Futuros demo (${cfg.inst_id}). Tamanho em USDT (nocional); Comprar = abrir/aumentar long, Vender = abrir/aumentar short.` : `Spot demo. Compra a mercado: tamanho em ${cfg.quote_ccy}; venda: na moeda base.`} Tudo fake.</p>
          </div>
        )}
      </div>
  );
}
