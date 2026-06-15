"""Bybit — preço e volume spot (varejo). Fonte adicional, soma ao "varejo" junto
da Binance; Coinbase segue como proxy institucional.

Ticker spot público (sem chave): `/v5/market/tickers?category=spot`. `turnover24h`
é o volume em USD (quote). CVD não vem do candle (Bybit não expõe split de taker no
kline) — por enquanto só preço/volume; CVD exigiria o endpoint de trades.

OBS geo: Bybit pode bloquear certas regiões de nuvem (risco real no Railway US). A
fonte é isolada — se falhar, vira "indisponível" sem derrubar o ciclo.
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("bybit")
_URL = "https://api.bybit.com/v5/market/tickers"
_SYMBOL = {
    "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT",
    "XRP": "XRPUSDT", "DOGE": "DOGEUSDT", "ADA": "ADAUSDT", "AVAX": "AVAXUSDT",
    "LINK": "LINKUSDT", "SUI": "SUIUSDT", "TON": "TONUSDT", "POL": "POLUSDT",
    "DOT": "DOTUSDT", "LTC": "LTCUSDT",
    "AAVE": "AAVEUSDT", "UNI": "UNIUSDT", "LDO": "LDOUSDT", "ARB": "ARBUSDT", "ATOM": "ATOMUSDT",
}


class BybitSource(BaseSource):
    name = "bybit"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset in assets:
            sym = _SYMBOL.get(asset)
            if not sym:
                continue
            try:
                r = await http.get(_URL, params={"category": "spot", "symbol": sym}, timeout=15.0)
                r.raise_for_status()
                lst = r.json().get("result", {}).get("list", [])
                if not lst:
                    continue
                t = lst[0]
                rows.append({
                    "asset": asset,
                    "exchange": "bybit",
                    "price": float(t["lastPrice"]) if t.get("lastPrice") else None,
                    "volume_spot": float(t["turnover24h"]) if t.get("turnover24h") else None,
                    "volume_perps": None,
                    "cvd": None,
                    "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001 — isolado por símbolo (geo/transiente)
                log.warning("bybit %s indisponivel: %s", asset, exc)
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
