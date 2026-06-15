"""OKX — preço e volume spot (varejo). Fonte adicional, soma ao "varejo" junto da
Binance/Bybit; Coinbase segue como proxy institucional.

Ticker spot público (sem chave): `/api/v5/market/ticker?instId=BTC-USDT`. Para spot,
`volCcy24h` é o volume em USD (quote). O CVD não vem do candle, mas o endpoint público
de trades (`/api/v5/market/trades`) traz o `side` (lado agressor/taker) → somamos o
delta de fluxo igual à Binance/Coinbase, compondo o CVD agregado do varejo.

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
_TRADES = "https://www.okx.com/api/v5/market/trades"  # trades recentes c/ lado agressor
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

                # CVD: delta de fluxo agressor dos trades recentes (px·sz·±1 por `side`),
                # mesmo método de Binance/Coinbase. Best-effort: não derruba a fonte.
                cvd = None
                try:
                    tr = await http.get(_TRADES, params={"instId": sym, "limit": "500"}, timeout=15.0)
                    tr.raise_for_status()
                    trades = tr.json().get("data", [])
                    if trades:
                        cvd = sum(
                            float(x["px"]) * float(x["sz"]) * (1.0 if x.get("side") == "buy" else -1.0)
                            for x in trades if x.get("px") and x.get("sz")
                        )
                except Exception:  # noqa: BLE001 — CVD é best-effort
                    cvd = None

                rows.append({
                    "asset": asset,
                    "exchange": "okx",
                    "price": float(t["last"]) if t.get("last") else None,
                    "volume_spot": float(t["volCcy24h"]) if t.get("volCcy24h") else None,
                    "volume_perps": None,
                    "cvd": cvd,
                    "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001 — isolado por símbolo (geo/transiente)
                log.warning("okx %s indisponivel: %s", asset, exc)
        return [TableRows("prices_cex", rows, "asset,exchange,ts")]
