import type { ActiveLayers } from "./Chart";

interface Props {
  layers: ActiveLayers;
  onToggle: (key: keyof ActiveLayers) => void;
  locked: boolean;
}

interface Item {
  key: keyof ActiveLayers;
  label: string;
  color: string;
  desc: string; // explicação (tooltip nativo ao passar o mouse)
}

const ITEMS: Item[] = [
  { key: "gex", label: "Opções (Call/Put Wall)", color: "bg-signal-green", desc: "Strikes com maior gama (GEX): Call Wall = teto/resistência, Put Wall = piso/suporte onde os dealers tendem a segurar o preço." },
  { key: "zeroGamma", label: "Zero Gamma", color: "bg-purple-500", desc: "Nível onde o gama dos dealers vira de positivo para negativo. Acima: dealers amortecem (mercado mais calmo). Abaixo: amplificam (mais volátil)." },
  { key: "maxPain", label: "Max Pain", color: "bg-signal-yellow", desc: "Preço onde o maior volume de opções expira sem valor. Perto do vencimento o preço tende a gravitar para cá (efeito ímã)." },
  { key: "volumeProfile", label: "Volume Profile (POC)", color: "bg-sky-400", desc: "POC = preço com maior volume negociado no período (ímã de liquidez); VA High/Low delimitam 70% do volume." },
  { key: "orderbookWalls", label: "Paredes do book", color: "bg-amber-500", desc: "Grandes ordens no livro (Binance+Coinbase): paredes de compra = suporte, de venda = resistência." },
  { key: "funding", label: "Funding", color: "bg-sky-500", desc: "Taxa de financiamento dos perpétuos: positiva = comprados pagam (otimismo alavancado), negativa = vendidos pagam." },
  { key: "cvd", label: "CVD", color: "bg-emerald-500", desc: "Cumulative Volume Delta: fluxo agressor líquido (compras a mercado − vendas a mercado). Varejo (Binance+OKX) × institucional (Coinbase)." },
  { key: "liquidations", label: "Liquidações (heatmap + barras)", color: "bg-rose-500", desc: "Heatmap estimado de zonas de liquidação (magnet zones, modelo de alavancagem) + barras de liquidações realizadas embaixo." },
];

export default function LayerToggles({ layers, onToggle, locked }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Camadas:</span>
      {ITEMS.map((item) => {
        const active = !locked && layers[item.key];
        return (
          <button
            key={item.key}
            disabled={locked}
            onClick={() => onToggle(item.key)}
            title={item.desc}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
              locked
                ? "cursor-not-allowed border-ink-500 text-slate-600"
                : active
                  ? "border-accent/60 bg-accent/10 text-slate-100"
                  : "border-ink-500 text-slate-400 hover:border-ink-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? item.color : "bg-slate-600"}`} />
            {item.label}
            {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
      {locked && <span className="text-slate-600">— disponível no Pro</span>}
    </div>
  );
}
