"""Binance — preço spot, volume spot/perps e CVD do varejo (PRD fonte #1).

Usa CCXT (async). O CVD é estimado pelo delta de fluxo agressor dos trades
recentes: Σ (custo · +1 se comprador agressor, −1 se vendedor agressor).
"""
from __future__ import annotations

import ccxt.async_support as ccxt
import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_SPOT_SYMBOL = {"BTC": "BTC/USDT", "ETH": "ETH/USDT", "SOL": "SOL/USDT"}


class BinanceSource(BaseSource):
    name = "binance"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        spot = ccxt.binance({"enableRateLimit": True, "timeout": 15000})
        # api.binance.com devolve 451 em regiões de nuvem bloqueadas (ex: Railway);
        # o domínio público de dados de mercado (spot) não tem geo-bloqueio.
        # Perps (fapi) seguem geo-bloqueados e volume_perps é sinal de baixa
        # relevância → não consultamos (o cliente perps derrubava a fonte inteira).
        try:
            spot.urls["api"]["public"] = "https://data-api.binance.vision/api/v3"
        except Exception:  # noqa: BLE001 — se a estrutura do ccxt mudar, segue no padrão
            pass
        try:
            for asset in assets:
                symbol = _SPOT_SYMBOL.get(asset)
                if not symbol:
                    continue
                ticker = await spot.fetch_ticker(symbol)
                price = ticker.get("last")
                volume_spot = ticker.get("quoteVolume")

                cvd = None
                try:
                    trades = await spot.fetch_trades(symbol, limit=1000)
                    cvd = sum(
                        (t.get("cost") or 0.0) * (1.0 if t.get("side") == "buy" else -1.0)
                        for t in trades
                    )
                except Exception:  # noqa: BLE001 — CVD é best-effort
                    cvd = None

                rows.append({
                    "asset": asset,
                    "exchange": "binance",
                    "price": price,
                    "volume_spot": volume_spot,
                    "volume_perps": None,  # fapi geo-bloqueado; sinal de baixa relevância
                    "cvd": cvd,
                    "ts": ts,
                })
        finally:
            await spot.close()
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
