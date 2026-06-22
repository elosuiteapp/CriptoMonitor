// Indicadores técnicos puros, calculados das velas (klines). Sem dependências,
// só matemática — usados pelo motor de confluência (Leitura do Mercado, Expert).

import type { Candle } from "../marketData";

/** Última posição finita de um array (ignora NaN do aquecimento). */
export function last(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
  return NaN;
}

/** Média móvel exponencial. Retorna a série inteira (mesmo tamanho da entrada). */
export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Média móvel simples. NaN durante o aquecimento. */
export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Bandas de Bollinger (média móvel ± mult desvios-padrão). NaN durante o aquecimento. */
export function bollinger(values: number[], period = 20, mult = 2): { mid: number[]; upper: number[]; lower: number[] } {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(NaN);
  const lower = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

/** RSI de Wilder. NaN durante o aquecimento. */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    gain = (gain * (period - 1) + (ch > 0 ? ch : 0)) / period;
    loss = (loss * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** MACD (linha, sinal, histograma). */
export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => ef[i] - es[i]);
  const signal = ema(line, signalP);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

/** ATR de Wilder. NaN durante o aquecimento. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** ADX (força da tendência, 0–100). Retorna só o último valor. */
export function adx(candles: Candle[], period = 14): number {
  if (candles.length < period * 2 + 1) return NaN;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const smooth = (arr: number[]) => {
    let s = arr.slice(1, period + 1).reduce((a, b) => a + b, 0);
    const res = [s];
    for (let i = period + 1; i < arr.length; i++) {
      s = s - s / period + arr[i];
      res.push(s);
    }
    return res;
  };
  const trS = smooth(tr);
  const pS = smooth(plusDM);
  const mS = smooth(minusDM);
  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    if (trS[i] === 0) {
      dx.push(0);
      continue;
    }
    const pdi = (100 * pS[i]) / trS[i];
    const mdi = (100 * mS[i]) / trS[i];
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (dx.length < period) return NaN;
  let adxv = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adxv = (adxv * (period - 1) + dx[i]) / period;
  return adxv;
}

/** Percentil (0–100) de um valor dentro de um array (ignora NaN). */
export function percentileRank(arr: number[], value: number): number {
  const valid = arr.filter((v) => Number.isFinite(v));
  if (!valid.length || !Number.isFinite(value)) return NaN;
  const below = valid.filter((v) => v <= value).length;
  return (below / valid.length) * 100;
}
