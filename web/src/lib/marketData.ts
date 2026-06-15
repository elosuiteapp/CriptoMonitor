// Dados de candle: REST de klines da Binance (timeframes exatos) + WebSocket
// para atualizar o candle em formação (PRD §8.4). Sem chave, com CORS público.

export type Timeframe = "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
export type ChartType = "candles" | "bars" | "line" | "area";

export interface Candle {
  time: number; // epoch em segundos (formato do Lightweight Charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumeProfile {
  poc: number; // Point of Control — preço com mais volume
  vah: number; // Value Area High
  val: number; // Value Area Low
}

/** Volume Profile / POC a partir dos candles (PRD3 §8.8.5). Distribui o volume
 *  de cada candle no bin do preço típico e acha o nível de maior volume. */
export function computeVolumeProfile(candles: Candle[], bins = 50): VolumeProfile | null {
  if (candles.length < 2) return null;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  if (hi <= lo) return null;
  const width = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    let idx = Math.floor((typical - lo) / width);
    idx = Math.max(0, Math.min(bins - 1, idx));
    vol[idx] += c.volume;
  }
  let maxI = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[maxI]) maxI = i;
  const total = vol.reduce((a, b) => a + b, 0);
  let loI = maxI;
  let hiI = maxI;
  let acc = vol[maxI];
  while (acc < total * 0.7 && (loI > 0 || hiI < bins - 1)) {
    const below = loI > 0 ? vol[loI - 1] : -1;
    const above = hiI < bins - 1 ? vol[hiI + 1] : -1;
    if (above >= below) acc += vol[++hiI];
    else acc += vol[--loI];
  }
  return {
    poc: lo + (maxI + 0.5) * width,
    vah: lo + (hiI + 1) * width,
    val: lo + loI * width,
  };
}

const SYMBOL: Record<string, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT", BNB: "BNBUSDT" };

export async function fetchKlines(asset: string, tf: Timeframe, limit = 300): Promise<Candle[]> {
  const symbol = SYMBOL[asset];
  if (!symbol) return [];
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

/** Variação percentual de 24h (ticker da Binance). null se indisponível. */
export async function fetch24hChange(asset: string): Promise<number | null> {
  const symbol = SYMBOL[asset];
  if (!symbol) return null;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pct = Number(data.priceChangePercent);
    return Number.isFinite(pct) ? pct : null;
  } catch {
    return null;
  }
}

/** Assina o stream de kline e chama `onBar` a cada atualização. Devolve o cleanup.
 *  O candle em formação é um plus: se o WebSocket falhar, o gráfico continua com
 *  os candles do REST. Fechamos o socket com cuidado para não gerar o aviso
 *  "closed before the connection is established" quando ainda está conectando. */
export function subscribeKline(asset: string, tf: Timeframe, onBar: (c: Candle) => void): () => void {
  const symbol = SYMBOL[asset]?.toLowerCase();
  if (!symbol) return () => {};
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${tf}`);
  ws.onmessage = (ev) => {
    try {
      const k = JSON.parse(ev.data).k;
      if (!k) return;
      onBar({
        time: Math.floor(k.t / 1000),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
      });
    } catch {
      /* ignora frames malformados */
    }
  };
  ws.onerror = () => {
    /* silencioso: o REST já alimenta o gráfico */
  };
  return () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", () => ws.close());
    }
  };
}
