// Definições curtas dos termos técnicos (usadas nos tooltips ⓘ premium), bilíngues.
import { useLocale } from "../hooks/useLocale";

export type GlossaryKey =
  | "fng" | "fundingCex" | "fundingOnchain" | "cvd" | "bookImbalance" | "longShort"
  | "squeezeRisk" | "liquidations" | "institutionalBias" | "tvl" | "dexLiquidity"
  | "macroMarket" | "rangePosition" | "bias" | "oiDelta" | "dvol" | "ivp" | "ivRv"
  | "termStructure" | "etfFlows" | "marketLiquidity" | "optionsPositioning" | "cot" | "optionsFlow";

const I18N: Record<GlossaryKey, { pt: string; en: string }> = {
  fng: {
    pt: "Índice de Medo & Ganância (0–100). Medo extremo costuma marcar fundos; ganância extrema, topos. É sentimento do mercado, não preço.",
    en: "Fear & Greed Index (0–100). Extreme fear often marks bottoms; extreme greed, tops. It's market sentiment, not price.",
  },
  fundingCex: {
    pt: "Funding rate dos perpétuos (agregado de várias exchanges). Positivo = comprados pagando vendidos (otimismo em excesso); negativo = vendidos pagando.",
    en: "Perpetuals funding rate (aggregated across exchanges). Positive = longs paying shorts (excess optimism); negative = shorts paying.",
  },
  fundingOnchain: {
    pt: "Funding dos perpétuos on-chain (DEX). Mesma ideia do funding de CEX, mas no mercado descentralizado — bom pra comparar varejo CEX × DeFi.",
    en: "On-chain (DEX) perpetuals funding. Same idea as CEX funding, but in the decentralized market — handy to compare CEX retail vs DeFi.",
  },
  cvd: {
    pt: "CVD (Cumulative Volume Delta): saldo entre compra e venda agressora (a mercado). Subindo = compradores no comando; caindo = vendedores.",
    en: "CVD (Cumulative Volume Delta): net of aggressive (market) buying vs selling. Rising = buyers in control; falling = sellers.",
  },
  bookImbalance: {
    pt: "Pressão do book: soma das ordens LIMITE paradas perto do preço (bid = compra, ask = venda), nas faixas ±0,5% e ±2%. Mais bid = book comprador (suporte); mais ask = vendedor (resistência). Separado por audiência: varejo (todas as corretoras exceto Coinbase: Binance + OKX) × institucional (Coinbase) — igual ao prêmio Coinbase. Diferente do CVD (negócio já executado): aqui é liquidez esperando, e pode ser puxada (spoof). A leitura forte é cruzar com o CVD: book comprador + CVD subindo = pressão real; em direções opostas, desconfie.",
    en: "Order-book pressure: sum of resting LIMIT orders near price (bid = buy, ask = sell), in the ±0.5% and ±2% bands. More bid = buy-side book (support); more ask = sell-side (resistance). Split by audience: retail (every venue except Coinbase: Binance + OKX) vs institutional (Coinbase) — same logic as the Coinbase premium. Unlike CVD (already-executed trades), this is liquidity waiting, and it can be pulled (spoofing). The strong read is to cross it with CVD: buy-side book + rising CVD = real pressure; opposite directions, be skeptical.",
  },
  longShort: {
    pt: "Long/Short ratio: proporção de posições compradas vs vendidas. Muito acima de 1 = excesso de comprados (risco de squeeze de baixa) e vice-versa.",
    en: "Long/Short ratio: share of long vs short positions. Well above 1 = crowded longs (downside-squeeze risk) and vice versa.",
  },
  squeezeRisk: {
    pt: "Risco de squeeze: cruza funding + long/short + liquidações pra apontar o lado alavancado vulnerável. Comprados lotados pagando funding caro = risco de squeeze de BAIXA (são liquidados se o preço cai); vendidos lotados pagando = risco de squeeze de ALTA. Se as liquidações daquele lado já estão correndo, o squeeze está em curso.",
    en: "Squeeze risk: crosses funding + long/short + liquidations to flag the vulnerable leveraged side. Crowded longs paying high funding = DOWNSIDE squeeze risk (they get liquidated if price drops); crowded shorts paying = UPSIDE squeeze risk. If that side's liquidations are already firing, the squeeze is underway.",
  },
  liquidations: {
    pt: "Liquidações: posições alavancadas fechadas à força. Cascata de comprados empurra o preço pra baixo; de vendidos, pra cima.",
    en: "Liquidations: leveraged positions force-closed. A cascade of longs pushes price down; of shorts, up.",
  },
  institutionalBias: {
    pt: "Quem está no comando: institucional (Coinbase/spot) vs varejo (Binance/perps), via prêmio Coinbase, participação no volume e CVD agressor.",
    en: "Who's in control: institutional (Coinbase/spot) vs retail (Binance/perps), via the Coinbase premium, volume share, and aggressive CVD.",
  },
  tvl: {
    pt: "TVL (Total Value Locked): valor total depositado nos protocolos DeFi da rede. Stablecoins entrando = capital novo chegando.",
    en: "TVL (Total Value Locked): total value deposited in the network's DeFi protocols. Stablecoins flowing in = fresh capital arriving.",
  },
  dexLiquidity: {
    pt: "Liquidez DEX: profundidade dos pares nas exchanges descentralizadas. Mais liquidez = mercado on-chain mais saudável e menos slippage.",
    en: "DEX liquidity: depth of pairs on decentralized exchanges. More liquidity = healthier on-chain market and less slippage.",
  },
  macroMarket: {
    pt: "Dominância do BTC + capitalização total do mercado. Dominância subindo = dinheiro indo pro BTC (alts perdem força) e vice-versa.",
    en: "BTC dominance + total market cap. Rising dominance = money rotating into BTC (alts weaken) and vice versa.",
  },
  rangePosition: {
    pt: "Onde o preço está dentro do range recente: 0% = fundo (discount/barato), 100% = topo (premium/caro). Mão forte tende a comprar no discount e vender no premium.",
    en: "Where price sits within the recent range: 0% = bottom (discount/cheap), 100% = top (premium/expensive). Smart money tends to buy the discount and sell the premium.",
  },
  bias: {
    pt: "Viés da estrutura de mercado (Smart Money): de ALTA quando o preço rompe topos/fundos pra cima (BOS de alta), de BAIXA no contrário. Define a direção dominante.",
    en: "Market-structure bias (Smart Money): bullish when price breaks highs/lows upward (bullish BOS), bearish otherwise. Sets the dominant direction.",
  },
  oiDelta: {
    pt: "Delta de Open Interest vs preço (4h): mostra se o movimento veio de posições NOVAS. OI sobe + preço sobe = novas compras; OI sobe + preço cai = novas vendas (atenção a squeeze).",
    en: "Open Interest delta vs price (4h): shows whether the move came from NEW positions. OI up + price up = new buying; OI up + price down = new selling (watch for a squeeze).",
  },
  dvol: {
    pt: "DVOL — índice de volatilidade implícita da Deribit (o 'VIX da cripto'). Alto = o mercado espera movimentos grandes; baixo = calmaria precificada.",
    en: "DVOL — Deribit's implied-volatility index (crypto's 'VIX'). High = the market expects big moves; low = priced-in calm.",
  },
  ivp: {
    pt: "IV Percentile 90d — onde a volatilidade implícita atual está na faixa dos últimos 90 dias (0–100). Alto = opções caras (favorece vender); baixo = baratas (favorece comprar).",
    en: "IV Percentile 90d — where current implied vol sits within the last 90 days (0–100). High = expensive options (favors selling); low = cheap (favors buying).",
  },
  ivRv: {
    pt: "IV − RV spread: volatilidade implícita menos a realizada. Positivo = mercado precificando mais oscilação do que de fato aconteceu — prêmio de risco caro.",
    en: "IV − RV spread: implied minus realized volatility. Positive = the market is pricing more swing than actually happened — an expensive risk premium.",
  },
  termStructure: {
    pt: "Volatilidade implícita por prazo (7d→180d). Curto prazo acima do longo (backwardation) sugere o mercado precificando um evento próximo.",
    en: "Implied volatility by tenor (7d→180d). Short tenors above long ones (backwardation) suggests the market is pricing a near-term event.",
  },
  etfFlows: {
    pt: "Fluxo líquido dos ETFs spot (BTC/ETH) nos EUA — a porta institucional do ciclo. Entrada líquida = instituições comprando; saída = realizando. A sequência de dias mostra a persistência do fluxo.",
    en: "Net flow of US spot ETFs (BTC/ETH) — the institutional gateway of the cycle. Net inflow = institutions buying; outflow = taking profit. The day streak shows how persistent the flow is.",
  },
  marketLiquidity: {
    pt: "Liquidez do mercado: oferta total de stablecoins (o 'dry powder' parado pronto pra entrar) e TVL DeFi. Stablecoins subindo = combustível chegando; a dominância (stablecoins ÷ market cap) caindo = capital saindo pra risco.",
    en: "Market liquidity: total stablecoin supply (the 'dry powder' sitting ready to deploy) and DeFi TVL. Rising stablecoins = fuel arriving; falling dominance (stablecoins ÷ market cap) = capital rotating out into risk.",
  },
  optionsPositioning: {
    pt: "Posicionamento institucional em opções (Deribit): Put/Call ratio + skew de IV. Puts caros / muitos puts = demanda por proteção (defensivo); calls caros = aposta em alta.",
    en: "Institutional options positioning (Deribit): Put/Call ratio + IV skew. Expensive/heavy puts = demand for protection (defensive); expensive calls = a bet on upside.",
  },
  cot: {
    pt: "COT (Commitment of Traders, CFTC): posicionamento SEMANAL por categoria nos futuros CME de BTC/ETH. Asset Managers = institucional 'real money' (direcional); Leveraged Funds = hedge funds (cujo net short costuma ser basis trade, não aposta de queda). Sai sexta, com dados de terça.",
    en: "COT (Commitment of Traders, CFTC): WEEKLY positioning by category in CME BTC/ETH futures. Asset Managers = 'real money' institutions (directional); Leveraged Funds = hedge funds (whose net short is usually a basis trade, not a bearish bet). Released Friday, with Tuesday's data.",
  },
  optionsFlow: {
    pt: "Proxy do HIRO (SpotGamma): estima pra que lado os dealers de opções empurram o preço ao se proteger (hedge). A cada 5 min soma o delta-fluxo — compra de call / venda de put = dealer compra à vista (fluxo +); venda de call / compra de put = vende (−) — e vai ACUMULANDO na janela. Linha colorida (eixo esquerdo) = esse fluxo, NÃO é preço: verde subindo = pressão compradora de hedge, vermelha caindo = vendedora. A pontilhada é o spot (eixo direito) — por isso as duas ficam em alturas diferentes, são escalas distintas. O que importa é comparar: andam juntas = hedge confirma o movimento; divergem (fluxo + mas preço caindo) = sinal de cautela.",
    en: "HIRO proxy (SpotGamma): estimates which way options dealers push price as they hedge. Every 5 min it sums the delta-flow — buying a call / selling a put = dealer buys spot (flow +); selling a call / buying a put = sells (−) — and ACCUMULATES it over the window. The colored line (left axis) is that flow, NOT price: green rising = buy-side hedging pressure, red falling = sell-side. The dotted line is spot (right axis) — that's why the two sit at different heights, they're separate scales. What matters is the comparison: moving together = hedging confirms the move; diverging (flow + but price falling) = a caution signal.",
  },
};

/** Glossário (PT) — export estático, compat com componentes ainda não migrados. */
export const GLOSSARY: Record<GlossaryKey, string> = Object.fromEntries(
  (Object.keys(I18N) as GlossaryKey[]).map((k) => [k, I18N[k].pt]),
) as Record<GlossaryKey, string>;

/** Glossário no idioma atual — mesma forma de antes (`Record<key, string>`). */
export function useGlossary(): Record<GlossaryKey, string> {
  const { isEn } = useLocale();
  const lang = isEn ? "en" : "pt";
  return Object.fromEntries(
    (Object.keys(I18N) as GlossaryKey[]).map((k) => [k, I18N[k][lang]]),
  ) as Record<GlossaryKey, string>;
}
