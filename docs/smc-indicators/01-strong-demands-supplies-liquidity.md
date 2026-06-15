# Indicador #1 — "Strong Demands & Supplies + Liquidity"

Fonte (TradingView, Pine v5): https://br.tradingview.com/v/LyQgObAq/
Origem: fork enxuto do **Smart Money Concepts [LuxAlgo]** + camada de liquidez própria.
Código Pine completo: colado pelo usuário na conversa (2026-06-15).

> Spec para reimplementar em TypeScript (`web/src/lib/smc.ts`). **Tudo é candle-only (OHLCV)** —
> os únicos `request.security` são o mesmo símbolo em timeframe 'D' (máx/mín do dia anterior) e no
> próprio tf do gráfico (FVG). Nada de fonte externa. Klines já vêm de `lib/marketData.ts`.

## Blocos do indicador

1. **Engulfing candles** (ON) — marca engolfo de alta/baixa (2 candles) com setas (▲ abaixo / ▼ acima).
   - Alta: `open<=close[1]` e `open<open[1]` e `close>open[1]`. Baixa: espelhado.

2. **Swing structure / Market structure** (ON) — núcleo SMC.
   - `swings_calc(len)`: oscilador de estado detecta topo/fundo de swing por `highest/lowest(len)`.
     `length = 50` (swing principal) e `5` (estrutura interna).
   - Rótulos: HH/LH nos topos, LL/HL nos fundos.
   - Extensão "Strong/Weak High" e "Strong/Weak Low" conforme o trend atual.

3. **BOS / CHoCH** (ON) — quebra de estrutura.
   - Alta: `crossover(close, top_y)`. Se trend estava de baixa → **CHoCH** (reversão de caráter), senão **BOS**.
   - Baixa: `crossunder(close, btm_y)`, espelhado. Mesma lógica para estrutura interna (len 5).
   - Estados `trend` / `itrend` guardam a direção corrente.

4. **Order Blocks** (OFF por padrão — só com "Demand/Supply zones" ligado).
   - `ob_coord()`: dentro do intervalo da estrutura, acha o candle de maior range oposto ao movimento
     (filtro `ATR(200)` ou cumulative mean range) = último candle antes do impulso. Mostra os últimos 5.

5. **FVG / Imbalances** (ON) — gap de 3 candles (fair value gap).
   - Alta: `low > high[2]` & `close[1] > high[2]` & delta% > threshold (auto). Baixa: espelhado.
   - Caixa rosa; apaga quando preenchido. `fvg_extend = 5`.

6. **Liquidity zones** (ON) — destaque do indicador.
   - ZigZag próprio a partir de `pivothigh(7,1)` / `pivotlow(7,1)`.
   - Agrupa pivôs no mesmo nível (dentro de `ATR(10)/margin`, `margin = 10/6.9 ≈ 1.449`).
     Quando **≥3 pivôs** clusterizam → zona de liquidez (buy-side acima / sell-side abaixo).
   - Linha de nível + linha pontilhada estendida + box "Liquidity zone". Rastreia "rompido" (preço
     cruza) e re-teste da zona. Mantém os `visibleLevels = 3` mais recentes de cada lado.
   - Liquidity voids (imbalance) existem no código mas **OFF** por padrão.

7. **Previous Day High/Low** (ON) — `security(tf 'D')`: linhas pontilhadas + rótulos do máx/mín do dia anterior.

8. **Premium / Discount zones** (OFF por padrão) — caixas do topo 5% (supply/venda) e fundo 5% (demand/compra)
   do range de swing. Rótulos "Supply/Sell Zone" / "Demand/Buy Zone".

9. **EHPDA / opening gaps (NDOG)** (quase tudo OFF) — só desenha a linha média tracejada do gap de abertura diário.

## Visível com os defaults
Engulfing · Swing structure (HH/LH/LL/HL + Strong/Weak High/Low) · BOS/CHoCH · FVG · Liquidity zones (3+3) · Previous Day H/L.
OFF por padrão: Order Blocks, Premium/Discount, Liquidity voids, EHPDA event horizons.

## Parâmetros a replicar (fidelidade)
- Swing: `length=50`, interno `5`.
- Liquidez: pivô `7`, cluster `ATR(10)/1.449`, mínimo `3` pivôs, `3` níveis por lado.
- Order Block: filtro `ATR(200)`, últimos `5`.
- FVG: threshold automático, extensão `5`.

## Notas de port / melhorias (a aplicar no nosso, não no Pine)
- Desenho: trocar boxes por `bar_index` por price lines / markers / overlays do lightweight-charts (já usamos camadas).
- **Confluência** (o que o TradingView não tem): cruzar liquidity zones / OB / demand-supply com `orderbook_walls`,
  `liquidations` e Put/Call Wall + Zero Gamma (gamma) → score de confiança do nível.
- Interpretação em PT (cards) + alimentar o prompt do `generate-analysis` com a estrutura (BOS/CHoCH, zonas, liquidez).
