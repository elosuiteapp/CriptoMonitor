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
}

const SYMBOL: Record<string, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" };

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
