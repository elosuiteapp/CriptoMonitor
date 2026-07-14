import type { Dispatch, SetStateAction } from "react";

import BotChart, { type BotCandle, type BotMarker, type BotPriceLine, type BotSub } from "../BotChart";
import Card from "../../ui/Card";
import { TogglePill, PillRow } from "../../TogglePill";
import { BARS, BLOCK_LINES } from "../../../lib/bot/constants";
import type { Config } from "../../../lib/bot/types";

// Cor da bolinha de cada bloco (casa com BLOCK_LINES em constants) → classe bg-* do TogglePill.
const BLOCK_COLOR: Record<string, string> = { wforce: "bg-slate-200", estrutura: "bg-emerald-500", micro: "bg-sky-400", fluxo: "bg-violet-400", posicionamento: "bg-amber-400", tecnico: "bg-pink-400" };

/** Gráfico com marcações — seletor de moeda/TF + toggles de indicador + <BotChart>. */
export default function BotChartSection({ selInst, cfg, setCfg, ASSET_LIST, selAsset, setSelAsset, blockShow, setBlockShow, refresh, busy, connected, candles, markers, priceLines, sub, dec }: {
  selInst: string;
  cfg: Config | null;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  ASSET_LIST: string[];
  selAsset: string;
  setSelAsset: Dispatch<SetStateAction<string>>;
  blockShow: Record<string, boolean>;
  setBlockShow: Dispatch<SetStateAction<Record<string, boolean>>>;
  refresh: () => void;
  busy: string | null;
  connected: boolean;
  candles: BotCandle[];
  markers: BotMarker[];
  priceLines: BotPriceLine[];
  sub: BotSub | null;
  dec: number;
}) {
  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Gráfico · {selInst} <span className="text-xs font-normal text-muted-foreground">({cfg?.bar})</span></h2>
            {/* Seletor de moeda: troca o gráfico + a leitura (viés/decisão/sinais) para o ativo escolhido. */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              {ASSET_LIST.map((a) => (
                <button key={a} onClick={() => setSelAsset(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${selAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {BARS.map((b) => <button key={b} onClick={() => cfg && setCfg({ ...cfg, bar: b })} className={`rounded-md px-2 py-0.5 transition-colors ${cfg?.bar === b ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{b}</button>)}
            </div>
            <span className="flex items-center gap-1" title="Entrada de COMPRA (long)"><span className="text-emerald-500">▲</span> compra</span>
            <span className="flex items-center gap-1" title="Entrada de VENDA (short)"><span className="text-rose-500">▼</span> venda</span>
            <span className="flex items-center gap-1" title="Saída/fechamento da posição"><span className="text-slate-400">•</span> saída</span>
            <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
            <PillRow label="indicadores:">
              {BLOCK_LINES.map((b) => {
                const on = blockShow[b.id] !== false;
                const short = b.id === "wforce" ? "Força" : b.id === "micro" ? "Micro" : b.id === "posicionamento" ? "Posic" : b.label;
                return (
                  <TogglePill key={b.id} label={short} active={on} color={BLOCK_COLOR[b.id]} onToggle={() => setBlockShow((s) => ({ ...s, [b.id]: !on }))} desc={`Mostrar/ocultar o indicador ${b.label} no sub-painel do gráfico`} />
                );
              })}
            </PillRow>
            <button onClick={refresh} disabled={busy !== null || !connected} className="rounded-lg border border-border px-3 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">{busy === "refresh" ? "…" : "Atualizar"}</button>
          </div>
        </div>
        {connected && candles.length > 0 ? (
          <BotChart candles={candles} markers={markers} priceLines={priceLines} sub={sub} lines={[]} decimals={dec} height={sub ? 520 : 420} fitKey={`${selInst}-${cfg?.bar ?? ""}`} />
        ) : (
          <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">{connected ? "Carregando velas…" : "Conecte a OKX para ver o gráfico."}</div>
        )}
      </Card>
  );
}
