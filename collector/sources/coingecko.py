"""CoinGecko — dominância do BTC e market cap global (PRD fonte #8).

Contexto macro do mercado. Chave Demo gratuita (10k/mês). Coletado em ciclo mais
espaçado (15 min) pelo aggregator para respeitar o rate limit.
"""
from __future__ import annotations

import os

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_URL = "https://api.coingecko.com/api/v3/global"


class CoinGeckoSource(BaseSource):
    name = "coingecko"
    requires_key = True

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        headers = {}
        key = os.getenv("COINGECKO_API_KEY")
        if key:
            headers["x-cg-demo-api-key"] = key

        resp = await http.get(_URL, headers=headers, timeout=20.0)
        resp.raise_for_status()
        data = resp.json()["data"]
        row = {
            "btc_dominance": (data.get("market_cap_percentage") or {}).get("btc"),
            "total_mcap": (data.get("total_market_cap") or {}).get("usd"),
            "ts": ts,
        }
        return [TableRows("macro", [row], "ts")]
