"""Hyperliquid — funding e OI de perps onchain (PRD fonte #7).

Permite comparar o funding CEX (varejo) com a DEX onchain. Endpoint público
`info` com type `metaAndAssetCtxs`. Sem chave.
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_URL = "https://api.hyperliquid.xyz/info"


def _f(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class HyperliquidSource(BaseSource):
    name = "hyperliquid"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        resp = await http.post(_URL, json={"type": "metaAndAssetCtxs"}, timeout=20.0)
        resp.raise_for_status()
        meta, ctxs = resp.json()
        index = {u["name"]: i for i, u in enumerate(meta["universe"])}

        rows: list[dict] = []
        for asset in assets:
            i = index.get(asset)
            if i is None:
                continue
            ctx = ctxs[i]
            mark = _f(ctx.get("markPx"))
            oi = _f(ctx.get("openInterest"))
            oi_usd = oi * mark if (oi is not None and mark is not None) else None
            rows.append({
                "asset": asset,
                "funding_rate": _f(ctx.get("funding")),
                "open_interest": oi_usd,
                "mark_price": mark,
                "ts": ts,
            })
        return [TableRows("onchain_perps", rows, "asset,ts")]
