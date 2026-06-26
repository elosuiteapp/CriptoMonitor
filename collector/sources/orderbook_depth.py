"""Escada COMPLETA do order book (heatmap de book) — Tier 1.

Snapshot bucketizado do book INTEIRO (±NEAR do preço) por ativo×exchange, SEM o
filtro de threshold das paredes — alimenta o heatmap de liquidez parada
(preço × tempo) no cockpit. Roda em cadência própria (1 min) no aggregator, fora
do ciclo de 5 min p/ não pesar o resto. Escopo: BTC/ETH/SOL/BNB (ativos com a
camada no gráfico). Degrada por exchange (uma falha não derruba as outras).
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("ob_depth")

# Mesmos endpoints das paredes (data-api.binance.vision evita o geo-bloqueio 451).
_BINANCE = "https://data-api.binance.vision/api/v3/depth"
_COINBASE = "https://api.exchange.coinbase.com/products/{p}/book?level=2"
_OKX = "https://www.okx.com/api/v5/market/books"

# Escopo enxuto: só os ativos com a camada no cockpit.
_BINANCE_SYM = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT"}
_COINBASE_PROD = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}  # BNB não lista na Coinbase US
_OKX_SYM = {"BTC": "BTC-USDT", "ETH": "ETH-USDT", "SOL": "SOL-USDT"}

_STEP = {"BTC": 50.0, "ETH": 5.0, "SOL": 0.5, "BNB": 1.0}  # passo do bucket de preço (USD)
_NEAR = 0.035  # ±3,5% do preço — mesma janela das paredes (Coinbase cobre a faixa cheia;
               # o depth da Binance limit=1000 alcança ~1% perto do preço).

DEPTH_ASSETS = ["BTC", "ETH", "SOL", "BNB"]


def _ladder(levels, mid: float, step: float) -> dict[str, float]:
    """Bucketiza o book inteiro (±NEAR) em {preço_do_bucket: notional_usd}, SEM threshold."""
    buckets: dict[float, float] = {}
    for lvl in levels:
        price = float(lvl[0])
        qty = float(lvl[1])
        if mid <= 0 or abs(price - mid) / mid > _NEAR:
            continue
        bucket = round(price / step) * step
        buckets[bucket] = buckets.get(bucket, 0.0) + price * qty
    return {f"{b:g}": round(v, 2) for b, v in buckets.items() if v > 0}


class OrderbookDepthSource(BaseSource):
    name = "orderbook_depth"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []

        def _emit(asset: str, exchange: str, book: dict, step: float) -> None:
            if not book.get("bids") or not book.get("asks"):
                return
            mid = (float(book["bids"][0][0]) + float(book["asks"][0][0])) / 2
            bids = _ladder(book["bids"], mid, step)
            asks = _ladder(book["asks"], mid, step)
            if bids or asks:
                rows.append({"asset": asset, "exchange": exchange, "mid": mid,
                             "bids": bids, "asks": asks, "ts": ts})

        for asset in assets:
            if asset not in DEPTH_ASSETS:
                continue
            step = _STEP.get(asset, 0.0)
            if step <= 0:
                continue

            sym = _BINANCE_SYM.get(asset)
            if sym:
                try:
                    r = await http.get(_BINANCE, params={"symbol": sym, "limit": 1000}, timeout=20.0)
                    r.raise_for_status()
                    _emit(asset, "binance", r.json(), step)
                except Exception as exc:  # noqa: BLE001
                    log.warning("depth binance %s falhou: %s", asset, exc)

            prod = _COINBASE_PROD.get(asset)
            if prod:
                try:
                    r = await http.get(_COINBASE.format(p=prod), timeout=20.0)
                    r.raise_for_status()
                    _emit(asset, "coinbase", r.json(), step)
                except Exception as exc:  # noqa: BLE001
                    log.warning("depth coinbase %s falhou: %s", asset, exc)

            osym = _OKX_SYM.get(asset)
            if osym:
                try:
                    r = await http.get(_OKX, params={"instId": osym, "sz": 400}, timeout=15.0)
                    r.raise_for_status()
                    data = r.json().get("data", [])
                    if data:
                        _emit(asset, "okx", data[0], step)
                except Exception as exc:  # noqa: BLE001
                    log.warning("depth okx %s falhou: %s", asset, exc)

        return [TableRows("orderbook_depth", rows, "asset,exchange,ts")]
