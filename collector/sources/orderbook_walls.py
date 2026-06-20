"""Paredes do order book (PRD3 §8.8.1, Fase 6).

Liquidez parada concentrada: agrega o book (Binance + Coinbase, REST depth) por
faixa de preço perto do preço atual e marca as faixas com notional acima do
filtro por ativo. Vira camada de "ímãs" no gráfico (Pro).
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("orderbook")

# data-api.binance.vision: dados públicos de mercado da Binance SEM geo-bloqueio
# (api.binance.com devolve 451 em algumas regiões de nuvem, ex: Railway).
_BINANCE = "https://data-api.binance.vision/api/v3/depth"
_COINBASE = "https://api.exchange.coinbase.com/products/{p}/book?level=2"
_BINANCE_SYM = {
    "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT",
    "XRP": "XRPUSDT", "DOGE": "DOGEUSDT", "ADA": "ADAUSDT", "AVAX": "AVAXUSDT",
    "LINK": "LINKUSDT", "SUI": "SUIUSDT", "TON": "TONUSDT", "POL": "POLUSDT",
    "DOT": "DOTUSDT", "LTC": "LTCUSDT",
    "AAVE": "AAVEUSDT", "UNI": "UNIUSDT", "LDO": "LDOUSDT", "ARB": "ARBUSDT", "ATOM": "ATOMUSDT",
    "PEPE": "PEPEUSDT",
}
# Coinbase só onde a moeda é listada (as demais caem fora sem quebrar).
_COINBASE_PROD = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD",
                  "XRP": "XRP-USD", "DOGE": "DOGE-USD", "ADA": "ADA-USD",
                  "AVAX": "AVAX-USD", "LINK": "LINK-USD", "DOT": "DOT-USD", "LTC": "LTC-USD",
                  "AAVE": "AAVE-USD", "UNI": "UNI-USD", "LDO": "LDO-USD", "ARB": "ARB-USD",
                  "ATOM": "ATOM-USD", "PEPE": "PEPE-USD"}

# passo do bucket de preço e notional mínimo (USD) por ativo
_STEP = {"BTC": 50.0, "ETH": 5.0, "SOL": 0.5, "BNB": 1.0}
_THRESHOLD = {"BTC": 1_000_000.0, "ETH": 500_000.0, "SOL": 100_000.0, "BNB": 200_000.0}
_NEAR = 0.02   # só faixas a ±2% do preço (relevantes ao gráfico)
_TOP = 5       # máx. de paredes por lado/exchange


def _walls(levels, side, exchange, asset, mid, ts) -> list[dict]:
    # Moedas sem ajuste fino usam passo ~0,1% do preço e notional padrão (auto-escala).
    step = _STEP.get(asset) or mid * 0.001
    threshold = _THRESHOLD.get(asset, 75_000.0)
    buckets: dict[float, float] = {}
    for lvl in levels:
        price = float(lvl[0])
        qty = float(lvl[1])
        if mid <= 0 or abs(price - mid) / mid > _NEAR:
            continue
        bucket = round(price / step) * step
        buckets[bucket] = buckets.get(bucket, 0.0) + price * qty
    rows = [
        {"asset": asset, "exchange": exchange, "side": side, "price": bucket,
         "notional_usd": notional, "ts": ts}
        for bucket, notional in buckets.items()
        if notional >= threshold
    ]
    rows.sort(key=lambda r: r["notional_usd"], reverse=True)
    return rows[:_TOP]


def _band_notional(levels, mid: float, frac: float) -> float:
    """Soma o notional (USD) das ordens dentro de ±frac do mid (preço × qty)."""
    total = 0.0
    for lvl in levels:
        price = float(lvl[0])
        qty = float(lvl[1])
        if mid > 0 and abs(price - mid) / mid <= frac:
            total += price * qty
    return total


class OrderbookWallsSource(BaseSource):
    name = "orderbook_walls"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        imbalance: dict[tuple[str, str], dict] = {}

        def _accumulate(asset: str, exchange: str, book: dict) -> float:
            mid = (float(book["bids"][0][0]) + float(book["asks"][0][0])) / 2
            imb = imbalance.setdefault(
                (asset, exchange), {"bid_near": 0.0, "ask_near": 0.0, "bid_wide": 0.0, "ask_wide": 0.0})
            imb["bid_near"] += _band_notional(book["bids"], mid, 0.005)
            imb["ask_near"] += _band_notional(book["asks"], mid, 0.005)
            imb["bid_wide"] += _band_notional(book["bids"], mid, 0.02)
            imb["ask_wide"] += _band_notional(book["asks"], mid, 0.02)
            return mid

        for asset in assets:
            # Binance
            sym = _BINANCE_SYM.get(asset)
            if sym:
                try:
                    r = await http.get(_BINANCE, params={"symbol": sym, "limit": 1000}, timeout=20.0)
                    r.raise_for_status()
                    book = r.json()
                    mid = _accumulate(asset, "binance", book)
                    rows += _walls(book["bids"], "bid", "binance", asset, mid, ts)
                    rows += _walls(book["asks"], "ask", "binance", asset, mid, ts)
                except Exception as exc:  # noqa: BLE001
                    log.warning("book binance %s falhou: %s", asset, exc)

            # Coinbase
            prod = _COINBASE_PROD.get(asset)
            if prod:
                try:
                    r = await http.get(_COINBASE.format(p=prod), timeout=20.0)
                    r.raise_for_status()
                    book = r.json()
                    mid = _accumulate(asset, "coinbase", book)
                    rows += _walls(book["bids"], "bid", "coinbase", asset, mid, ts)
                    rows += _walls(book["asks"], "ask", "coinbase", asset, mid, ts)
                except Exception as exc:  # noqa: BLE001
                    log.warning("book coinbase %s falhou: %s", asset, exc)

        # Pressão do book: soma de bid × ask perto do preço (±0,5% e ±2%), agregando
        # as exchanges. Vira o gauge "book comprador × vendedor" (cruzar com CVD).
        imb_rows = [
            {"asset": a, "exchange": ex, "bid_near_usd": v["bid_near"], "ask_near_usd": v["ask_near"],
             "bid_wide_usd": v["bid_wide"], "ask_wide_usd": v["ask_wide"], "ts": ts}
            for (a, ex), v in imbalance.items()
            if (v["bid_wide"] + v["ask_wide"]) > 0
        ]

        return [
            TableRows("orderbook_walls", rows, "asset,exchange,side,price,ts"),
            TableRows("orderbook_imbalance", imb_rows, "asset,exchange,ts"),
        ]
