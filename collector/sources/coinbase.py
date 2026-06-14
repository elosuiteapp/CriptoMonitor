"""Coinbase — volume spot como proxy institucional (PRD fonte #2).

A divergência entre o volume spot da Coinbase (institucional) e o volume perps
da Binance (varejo alavancado) é um dos sinais de fluxo do cockpit.
"""
from __future__ import annotations

import ccxt.async_support as ccxt
import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_SYMBOL = {"BTC": "BTC/USD", "ETH": "ETH/USD", "SOL": "SOL/USD"}


class CoinbaseSource(BaseSource):
    name = "coinbase"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        ex = ccxt.coinbase({"enableRateLimit": True, "timeout": 15000})
        try:
            for asset in assets:
                symbol = _SYMBOL.get(asset)
                if not symbol:
                    continue
                ticker = await ex.fetch_ticker(symbol)
                price = ticker.get("last")
                volume_spot = ticker.get("quoteVolume")
                if volume_spot is None and ticker.get("baseVolume") and price:
                    volume_spot = ticker["baseVolume"] * price
                rows.append({
                    "asset": asset,
                    "exchange": "coinbase",
                    "price": price,
                    "volume_spot": volume_spot,
                    "volume_perps": None,
                    "cvd": None,
                    "ts": ts,
                })
        finally:
            await ex.close()
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
