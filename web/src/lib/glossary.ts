// Definições curtas dos termos técnicos (usadas nos tooltips ⓘ premium).
export const GLOSSARY: Record<string, string> = {
  fng: "Índice de Medo & Ganância (0–100). Medo extremo costuma marcar fundos; ganância extrema, topos. É sentimento do mercado, não preço.",
  fundingCex: "Funding rate dos perpétuos (agregado de várias exchanges). Positivo = comprados pagando vendidos (otimismo em excesso); negativo = vendidos pagando.",
  fundingOnchain: "Funding dos perpétuos on-chain (DEX). Mesma ideia do funding de CEX, mas no mercado descentralizado — bom pra comparar varejo CEX × DeFi.",
  cvd: "CVD (Cumulative Volume Delta): saldo entre compra e venda agressora (a mercado). Subindo = compradores no comando; caindo = vendedores.",
  longShort: "Long/Short ratio: proporção de posições compradas vs vendidas. Muito acima de 1 = excesso de comprados (risco de squeeze de baixa) e vice-versa.",
  liquidations: "Liquidações: posições alavancadas fechadas à força. Cascata de comprados empurra o preço pra baixo; de vendidos, pra cima.",
  institutionalBias: "Quem está no comando: institucional (Coinbase/spot) vs varejo (Binance/perps), via prêmio Coinbase, participação no volume e CVD agressor.",
  tvl: "TVL (Total Value Locked): valor total depositado nos protocolos DeFi da rede. Stablecoins entrando = capital novo chegando.",
  dexLiquidity: "Liquidez DEX: profundidade dos pares nas exchanges descentralizadas. Mais liquidez = mercado on-chain mais saudável e menos slippage.",
  macroMarket: "Dominância do BTC + capitalização total do mercado. Dominância subindo = dinheiro indo pro BTC (alts perdem força) e vice-versa.",
  rangePosition: "Onde o preço está dentro do range recente: 0% = fundo (discount/barato), 100% = topo (premium/caro). Mão forte tende a comprar no discount e vender no premium.",
  bias: "Viés da estrutura de mercado (Smart Money): de ALTA quando o preço rompe topos/fundos pra cima (BOS de alta), de BAIXA no contrário. Define a direção dominante.",
};
