"""Coinbase — preço e volume spot (proxy institucional) + CVD institucional.

Volume via endpoint público de stats da Coinbase Exchange (24h). CVD institucional
pelo delta de fluxo agressor dos trades recentes — mesma ideia do CVD de varejo da
Binance, mas aqui Coinbase = institucional/US (contraste varejo × institucional).

Cobertura: moedas curadas que negociam na Coinbase (BNB e TON não têm par USD na
Coinbase, então ficam sem esta camada — caem para "derivativos & fluxo"). Cada
moeda é coletada de forma independente (try/except), então um par inexistente ou
um erro pontual não derruba a coleta das demais.
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("coinbase")

_STATS = "https://api.exchange.coinbase.com/products/{product}/stats"
_TRADES = "https://api.exchange.coinbase.com/products/{product}/trades?limit=1000"

# Curadas com par USD na Coinbase. (BNB e TON não têm — ficam fora de propósito.)
_PRODUCT = {
    "BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD",
    "XRP": "XRP-USD", "DOGE": "DOGE-USD", "ADA": "ADA-USD", "AVAX": "AVAX-USD",
    "LINK": "LINK-USD", "DOT": "DOT-USD", "LTC": "LTC-USD", "UNI": "UNI-USD",
    "AAVE": "AAVE-USD", "ATOM": "ATOM-USD", "ARB": "ARB-USD", "SUI": "SUI-USD",
    "LDO": "LDO-USD", "POL": "POL-USD", "PEPE": "PEPE-USD",
}


class CoinbaseSource(BaseSource):
    name = "coinbase"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset in assets:
            product = _PRODUCT.get(asset)
            if not product:
                continue
            try:
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
            except Exception as exc:  # noqa: BLE001 — uma moeda não pode derrubar as outras
                log.warning("coinbase %s falhou: %s", product, exc)
                continue
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
