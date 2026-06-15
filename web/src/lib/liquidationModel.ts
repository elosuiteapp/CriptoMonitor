import type { Candle } from "./marketData";

/**
 * Heatmap de liquidações ESTIMADO (modelo de alavancagem), estilo CoinGlass.
 *
 * NÃO é dado de liquidação realizada — é uma projeção de onde posições alavancadas
 * SERIAM liquidadas ("magnet zones"), construída a partir de insumos reais (preço +
 * volume dos candles) + as faixas de alavancagem usuais. É uma estimativa (como o
 * proxy HIRO): nem o CoinGlass tem o dado "pendente" verdadeiro (exigiria a entrada
 * e a alavancagem de cada posição aberta = privado da exchange).
 *
 * Modelo: para cada candle, para cada alavancagem L, projeta-se a liquidação de um
 * long em close×(1−1/L) e de um short em close×(1+1/L), ponderada pelo volume do
 * candle (proxy de posições abertas ali). Cada nível "vive" no tempo a partir do
 * candle que o criou e é "consumido" quando o preço passa por aquele nível — é isso
 * que faz as faixas nascerem e sumirem ao longo do tempo (igual à imagem do CoinGlass).
 */

export interface LiqGrid {
  nCols: number; // = nº de candles (uma coluna por candle, índice lógico)
  nBins: number; // resolução em preço
  priceTop: number; // preço no topo da grade (bin 0)
  priceBottom: number; // preço no fundo (bin nBins-1)
  refHigh: number; // maior high dos candles (preço in-range, para mapear coordenadas)
  refLow: number; // menor low dos candles (idem)
  values: Float32Array; // index = col*nBins + bin
  max: number;
}

// Alavancagens típicas e o peso relativo (alavancagem menor é mais comum → peso maior)
const TIERS: { L: number; w: number }[] = [
  { L: 100, w: 0.12 },
  { L: 50, w: 0.2 },
  { L: 25, w: 0.3 },
  { L: 10, w: 0.38 },
];

export interface OiPoint {
  time: number; // epoch (s)
  oi: number;
}

/**
 * Fator de ponderação por Open Interest: candles com mais OI (mais posições abertas)
 * geram zonas de liquidação mais fortes. Só vale dentro da janela de OI coletada;
 * fora dela (histórico antigo) o fator é 1 → o modelo usa só o volume. Degrada com
 * segurança: sem OI ou unidades incompatíveis, tudo vira fator 1.
 */
function makeOiFactor(oiSeries: OiPoint[]): (t: number) => number {
  if (oiSeries.length < 3) return () => 1;
  const sorted = [...oiSeries].sort((a, b) => a.time - b.time);
  const tMin = sorted[0].time;
  const tMax = sorted[sorted.length - 1].time;
  const vals = sorted.map((p) => p.oi).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)] || 0;
  if (median <= 0) return () => 1;
  return (t: number) => {
    if (t < tMin || t > tMax) return 1;
    let best = sorted[0].oi;
    let bestDist = Math.abs(sorted[0].time - t);
    for (const p of sorted) {
      const d = Math.abs(p.time - t);
      if (d < bestDist) {
        bestDist = d;
        best = p.oi;
      }
    }
    const f = best / median;
    return f < 0.4 ? 0.4 : f > 2.5 ? 2.5 : f; // clamp p/ não distorcer demais
  };
}

export function buildLiquidationGrid(candles: Candle[], oiSeries: OiPoint[] = [], nBins = 140): LiqGrid | null {
  const n = candles.length;
  if (n < 10) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.low < lo) lo = c.low;
    if (c.high > hi) hi = c.high;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;

  // estende ±10% para captar as zonas de 10x além dos extremos de preço do período
  const priceBottom = lo * 0.9;
  const priceTop = hi * 1.1;
  const span = priceTop - priceBottom;
  const binOf = (price: number) => {
    const r = (priceTop - price) / span; // 0 = topo
    const b = Math.floor(r * nBins);
    return b < 0 ? 0 : b >= nBins ? nBins - 1 : b;
  };

  // depósitos de liquidação projetada por faixa de preço, e os candles que "tocam" cada faixa
  const depByBin: { col: number; amount: number }[][] = Array.from({ length: nBins }, () => []);
  const touchByBin: number[][] = Array.from({ length: nBins }, () => []);
  const oiFactor = makeOiFactor(oiSeries);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const topBin = binOf(c.high);
    const botBin = binOf(c.low);
    for (let b = topBin; b <= botBin; b++) touchByBin[b].push(i); // pushes em ordem crescente de i

    const vol = c.volume > 0 ? c.volume : 0;
    if (vol <= 0) continue;
    const weight = vol * oiFactor(c.time); // volume × OI relativo (quando há OI)
    for (const { L, w } of TIERS) {
      const amount = weight * w;
      depByBin[binOf(c.close * (1 - 1 / L))].push({ col: i, amount }); // liq de longs (abaixo)
      depByBin[binOf(c.close * (1 + 1 / L))].push({ col: i, amount }); // liq de shorts (acima)
    }
  }

  const values = new Float32Array(n * nBins);
  let max = 0;

  for (let b = 0; b < nBins; b++) {
    const deps = depByBin[b];
    if (!deps.length) continue;
    const touches = touchByBin[b];
    const diff = new Float64Array(n + 1);

    for (const { col, amount } of deps) {
      // consumo: primeiro candle (>col) cujo range tocou esta faixa de preço
      let end = n;
      let loI = 0;
      let hiI = touches.length - 1;
      while (loI <= hiI) {
        const mid = (loI + hiI) >> 1;
        if (touches[mid] > col) {
          end = touches[mid];
          hiI = mid - 1;
        } else {
          loI = mid + 1;
        }
      }
      diff[col] += amount;
      diff[end] -= amount;
    }

    let run = 0;
    for (let col = 0; col < n; col++) {
      run += diff[col];
      const v = run > 0 ? run : 0;
      values[col * nBins + b] = v;
      if (v > max) max = v;
    }
  }

  if (max <= 0) return null;
  return { nCols: n, nBins, priceTop, priceBottom, refHigh: hi, refLow: lo, values, max };
}

// Paleta escuro → indigo → teal → lima → amarelo (intensidade do heatmap)
const STOPS: [number, [number, number, number]][] = [
  [0.0, [12, 16, 40]],
  [0.25, [49, 46, 129]],
  [0.5, [13, 148, 136]],
  [0.75, [132, 204, 22]],
  [1.0, [250, 204, 21]],
];

export function liqColor(r: number): [number, number, number] {
  const x = r < 0 ? 0 : r > 1 ? 1 : r;
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [a0, c0] = STOPS[i - 1];
      const [a1, c1] = STOPS[i];
      const t = (x - a0) / (a1 - a0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}
