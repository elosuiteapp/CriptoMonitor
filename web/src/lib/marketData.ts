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

/** Moedas com dados do COLETOR (gamma/book/OI/snapshot) — confluência completa
 *  no Smart Money e disponíveis no cockpit conforme o plano. */
export const CURATED_ASSETS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI",
  "TON", "POL", "DOT", "LTC", "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE",
];

/** Universo do Smart Money (Expert): 100 moedas populares da Binance. As que NÃO
 *  estão em CURATED_ASSETS só têm price-action (velas), sem dados do coletor. */
export const SMC_ASSETS = [
  ...CURATED_ASSETS,
  "TRX", "BCH", "NEAR", "APT", "ICP", "FIL", "ETC", "HBAR", "XLM", "IMX",
  "OP", "INJ", "VET", "GRT", "ALGO", "STX", "RENDER", "MKR", "SAND", "MANA",
  "AXS", "THETA", "XTZ", "EOS", "CHZ", "GALA", "CRV", "SNX", "COMP", "APE",
  "FLOW", "EGLD", "DYDX", "ENS", "SEI", "TIA", "WIF", "BONK", "JUP", "WLD",
  "ENA", "ORDI", "PENDLE", "FET", "RUNE", "KAVA", "ROSE", "ZEC", "DASH", "1INCH",
  "ZIL", "ENJ", "BAT", "QNT", "NEO", "IOTA", "KSM", "GMT", "JASMY", "MASK",
  "CFX", "AR", "ONDO", "TWT", "GMX", "SUSHI", "YFI", "ANKR", "CELO", "SKL",
  "LRC", "ONT", "RVN", "STORJ", "FLOKI", "PYTH", "JTO", "STRK", "BLUR", "W",
];

// Quase todo par é <TICKER>USDT na Binance — gera o mapa a partir da lista.
const SYMBOL: Record<string, string> = Object.fromEntries(
  SMC_ASSETS.map((a) => [a, `${a}USDT`]),
);

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

export interface CvdPoint {
  time: number; // epoch (s) — alinhado às velas do gráfico
  delta: number; // saldo agressor do candle (USDT): comprador − vendedor
  cvd: number; // soma acumulada do delta (volume delta cumulativo)
}

/** Volume Delta / CVD por candle, das klines da Binance. Usa o volume comprador
 *  agressor (takerBuyQuote, índice 10) vs o volume total em quote (índice 7):
 *  delta = 2·takerBuyQuote − quoteVol. CVD = soma acumulada. Mesmo timeframe do
 *  gráfico, histórico completo, qualquer moeda — sem depender do coletor. */
export async function fetchVolumeDelta(asset: string, tf: Timeframe, limit = 300): Promise<CvdPoint[]> {
  const symbol = SYMBOL[asset];
  if (!symbol) return [];
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  let cum = 0;
  return raw.map((k) => {
    const quoteVol = Number(k[7]);
    const takerBuyQuote = Number(k[10]);
    const delta = 2 * takerBuyQuote - quoteVol;
    cum += delta;
    return { time: Math.floor((k[0] as number) / 1000), delta, cvd: cum };
  });
}

export interface PerpContext {
  fundingRate: number; // FRAÇÃO (ex.: 0.0001 = 0,01%), intervalo 8h — convenção Binance fapi
  oiUsd: number | null; // open interest em USD (contratos × mark price)
  nextFundingTime: number | null; // epoch ms do próximo funding
}

/** Contexto de derivativos da Binance Futures (USDT-M) p/ qualquer moeda com perp:
 *  funding atual + open interest em USD. 100% client-side e público (sem coletor/
 *  Coinbase). null quando a moeda não tem perp na Binance ou a API falha. */
export async function fetchPerpContext(asset: string): Promise<PerpContext | null> {
  const symbol = SYMBOL[asset];
  if (!symbol) return null;
  try {
    const [piRes, oiRes] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
      fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
    ]);
    if (!piRes.ok) return null;
    const p = await piRes.json();
    const mark = Number(p.markPrice);
    const fundingRate = Number(p.lastFundingRate);
    if (!Number.isFinite(fundingRate)) return null;
    let oiUsd: number | null = null;
    if (oiRes.ok) {
      const o = await oiRes.json();
      const base = Number(o.openInterest);
      if (Number.isFinite(base) && Number.isFinite(mark)) oiUsd = base * mark;
    }
    return { fundingRate, oiUsd, nextFundingTime: Number(p.nextFundingTime) || null };
  } catch {
    return null;
  }
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
