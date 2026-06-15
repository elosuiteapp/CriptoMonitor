"""OKX — preço e volume spot (varejo). Fonte adicional, soma ao "varejo" junto da
Binance/Bybit; Coinbase segue como proxy institucional.

Ticker spot público (sem chave): `/api/v5/market/ticker?instId=BTC-USDT`. Para spot,
`volCcy24h` é o volume em USD (quote). CVD não vem do candle (OKX não expõe split de
taker no candle) — por enquanto só preço/volume.

OBS geo: OKX pode bloquear certas regiões de nuvem (risco real no Railway US). Fonte
isolada — se falhar, vira "indisponível" sem derrubar o ciclo.
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("okx")
_URL = "https://www.okx.com/api/v5/market/ticker"
_SYMBOL = {"BTC": "BTC-USDT", "ETH": "ETH-USDT", "SOL": "SOL-USDT"}


class OkxSource(BaseSource):
    name = "okx"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset in assets:
            sym = _SYMBOL.get(asset)
            if not sym:
                continue
            try:
                r = await http.get(_URL, params={"instId": sym}, timeout=15.0)
                r.raise_for_status()
                data = r.json().get("data", [])
                if not data:
                    continue
                t = data[0]
                rows.append({
                    "asset": asset,
                    "exchange": "okx",
                    "price": float(t["last"]) if t.get("last") else None,
                    "volume_spot": float(t["volCcy24h"]) if t.get("volCcy24h") else None,
                    "volume_perps": None,
                    "cvd": None,
                    "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001 — isolado por símbolo (geo/transiente)
                log.warning("okx %s indisponivel: %s", asset, exc)
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
