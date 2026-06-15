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
_BINANCE_SYM = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT"}
_COINBASE_PROD = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}  # BNB não existe na Coinbase

# passo do bucket de preço e notional mínimo (USD) por ativo
_STEP = {"BTC": 50.0, "ETH": 5.0, "SOL": 0.5, "BNB": 1.0}
_THRESHOLD = {"BTC": 1_000_000.0, "ETH": 500_000.0, "SOL": 100_000.0, "BNB": 200_000.0}
_NEAR = 0.02   # só faixas a ±2% do preço (relevantes ao gráfico)
_TOP = 5       # máx. de paredes por lado/exchange


def _walls(levels, side, exchange, asset, mid, ts) -> list[dict]:
    step = _STEP[asset]
    threshold = _THRESHOLD[asset]
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


class OrderbookWallsSource(BaseSource):
    name = "orderbook_walls"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset in assets:
            # Binance
            sym = _BINANCE_SYM.get(asset)
            if sym:
                try:
                    r = await http.get(_BINANCE, params={"symbol": sym, "limit": 1000}, timeout=20.0)
                    r.raise_for_status()
                    book = r.json()
                    mid = (float(book["bids"][0][0]) + float(book["asks"][0][0])) / 2
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
                    mid = (float(book["bids"][0][0]) + float(book["asks"][0][0])) / 2
                    rows += _walls(book["bids"], "bid", "coinbase", asset, mid, ts)
                    rows += _walls(book["asks"], "ask", "coinbase", asset, mid, ts)
                except Exception as exc:  # noqa: BLE001
                    log.warning("book coinbase %s falhou: %s", asset, exc)

        return [TableRows("orderbook_walls", rows, "asset,exchange,side,price,ts")]
