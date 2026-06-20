import type { ActiveLayers } from "./Chart";
import InfoTip from "./InfoTip";

interface Props {
  layers: ActiveLayers;
  onToggle: (key: keyof ActiveLayers) => void;
  locked: boolean;
  isExpert: boolean;
}

interface Item {
  key: keyof ActiveLayers;
  label: string;
  color: string;
  desc: string; // explicação (tooltip nativo ao passar o mouse)
  tier: "pro" | "expert"; // "expert" = camada avançada de fluxo, exclusiva do Expert
}

const ITEMS: Item[] = [
  { key: "gex", label: "Opções (Call/Put Wall)", color: "bg-emerald-500", tier: "pro", desc: "Strikes com maior gama (GEX): Call Wall = teto/resistência, Put Wall = piso/suporte onde os dealers tendem a segurar o preço." },
  { key: "zeroGamma", label: "Zero Gamma", color: "bg-purple-500", tier: "pro", desc: "Nível onde o gama dos dealers vira de positivo para negativo. Acima: dealers amortecem (mercado mais calmo). Abaixo: amplificam (mais volátil)." },
  { key: "maxPain", label: "Max Pain", color: "bg-amber-500", tier: "pro", desc: "Preço onde o maior volume de opções expira sem valor. Perto do vencimento o preço tende a gravitar para cá (efeito ímã)." },
  { key: "volumeProfile", label: "Volume Profile (POC)", color: "bg-sky-400", tier: "pro", desc: "POC = preço com maior volume negociado no período (ímã de liquidez); VA High/Low delimitam 70% do volume." },
  { key: "orderbookWalls", label: "Paredes do book", color: "bg-amber-500", tier: "pro", desc: "Grandes ordens no livro (Binance+Coinbase): paredes de compra = suporte, de venda = resistência." },
  { key: "funding", label: "Funding", color: "bg-sky-500", tier: "expert", desc: "Taxa de financiamento dos perpétuos: positiva = comprados pagam (otimismo alavancado), negativa = vendidos pagam." },
  { key: "cvd", label: "CVD", color: "bg-emerald-500", tier: "expert", desc: "Cumulative Volume Delta: fluxo agressor líquido (compras a mercado − vendas a mercado). Varejo (Binance+OKX) × institucional (Coinbase)." },
  { key: "bookPressure", label: "Pressão do book", color: "bg-teal-500", tier: "expert", desc: "Pressão do book no tempo: liquidez parada bid − ask perto do preço (±2%, todas as fontes). Verde = book comprador (mais compra), vermelho = vendedor. Diferente do CVD (fluxo executado) — a leitura forte é cruzar os dois." },
  { key: "liquidations", label: "Liquidações (heatmap + barras)", color: "bg-rose-500", tier: "expert", desc: "Heatmap estimado de zonas de liquidação (magnet zones, modelo de alavancagem) + barras de liquidações realizadas embaixo." },
];

export default function LayerToggles({ layers, onToggle, locked, isExpert }: Props) {
  // Camadas avançadas de fluxo (CVD, funding, pressão do book, liquidações) são
  // exclusivas do Expert — só aparecem para quem tem o plano. As de estrutura de
  // opções ficam no Pro (e aparecem bloqueadas no Free como vitrine de upgrade).
  const items = ITEMS.filter((item) => item.tier !== "expert" || isExpert);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Camadas:</span>
      {items.map((item) => {
        const active = !locked && layers[item.key];
        return (
          <span
            key={item.key}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
              locked
                ? "cursor-not-allowed border-border text-muted-foreground"
                : active
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-border"
            }`}
          >
            <button
              type="button"
              disabled={locked}
              onClick={() => onToggle(item.key)}
              className="flex items-center gap-1.5 disabled:cursor-not-allowed"
            >
              <span className={`h-2 w-2 rounded-full ${active ? item.color : "bg-muted"}`} />
              {item.label}
              {locked && <span aria-hidden>🔒</span>}
            </button>
            {!locked && <InfoTip text={item.desc} />}
          </span>
        );
      })}
      {locked && <span className="text-muted-foreground">— disponível no Pro</span>}
    </div>
  );
}
