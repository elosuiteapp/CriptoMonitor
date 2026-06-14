"""Coinbase — volume spot como proxy institucional (PRD fonte #2).

Usa o endpoint público de stats da Coinbase Exchange (24h), mais confiável que o
ticker do CCXT para volume. A divergência entre o volume spot da Coinbase
(institucional) e o volume perps da Binance (varejo) alimenta o card
"Divergência Spot × Perps" (§8.6.3).
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_STATS = "https://api.exchange.coinbase.com/products/{product}/stats"
_PRODUCT = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}


class CoinbaseSource(BaseSource):
    name = "coinbase"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset in assets:
            product = _PRODUCT.get(asset)
            if not product:
                continue
            resp = await http.get(_STATS.format(product=product), timeout=15.0)
            resp.raise_for_status()
            stats = resp.json()
            last = float(stats["last"]) if stats.get("last") else None
            vol_base = float(stats["volume"]) if stats.get("volume") else None
            volume_spot = vol_base * last if (vol_base is not None and last is not None) else None
            rows.append({
                "asset": asset,
                "exchange": "coinbase",
                "price": last,
                "volume_spot": volume_spot,
                "volume_perps": None,
                "cvd": None,
                "ts": ts,
            })
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
