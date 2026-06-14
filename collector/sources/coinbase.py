"""Coinbase — preço e volume spot (proxy institucional) + CVD institucional.

Volume via endpoint público de stats da Coinbase Exchange (24h). CVD institucional
pelo delta de fluxo agressor dos trades recentes — mesma ideia do CVD de varejo da
Binance, mas aqui Coinbase = institucional/US (contraste varejo × institucional).
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_STATS = "https://api.exchange.coinbase.com/products/{product}/stats"
_TRADES = "https://api.exchange.coinbase.com/products/{product}/trades?limit=1000"
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

            # CVD institucional: Σ (preço·tamanho · +1 comprador agressor / −1 vendedor).
            # Na Coinbase o `side` já é o lado agressor (taker), buy=+1 (verificado empírico).
            cvd = None
            try:
                tr = await http.get(_TRADES.format(product=product), timeout=15.0)
                tr.raise_for_status()
                cvd = sum(
                    float(t["price"]) * float(t["size"]) * (1.0 if t.get("side") == "buy" else -1.0)
                    for t in tr.json()
                    if t.get("price") and t.get("size")
                )
            except Exception:  # noqa: BLE001 — CVD é best-effort
                cvd = None

            rows.append({
                "asset": asset,
                "exchange": "coinbase",
                "price": last,
                "volume_spot": volume_spot,
                "volume_perps": None,
                "cvd": cvd,
                "ts": ts,
            })
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
