"""DexScreener — liquidez DEX em tempo real para ETH e SOL (PRD fonte #9).

Sem chave (300 req/min). Para cada ativo, busca os pares do token nativo
embrulhado e registra o par de maior liquidez. BTC não tem liquidez DEX
relevante e é ignorado.
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_URL = "https://api.dexscreener.com/latest/dex/tokens/{address}"

# (endereço do token embrulhado, chainId no DexScreener)
_TOKENS = {
    "ETH": ("0xC02aaa39b223FE8D0A0e5C4F27eAD9083C756Cc2", "ethereum"),
    "SOL": ("So11111111111111111111111111111111111111112", "solana"),
    "BNB": ("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "bsc"),  # WBNB na BNB Chain
}


class DexScreenerSource(BaseSource):
    name = "dexscreener"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []

        for asset in assets:
            token = _TOKENS.get(asset)
            if not token:
                continue
            address, chain = token
            resp = await http.get(_URL.format(address=address), timeout=20.0)
            resp.raise_for_status()
            pairs = [p for p in (resp.json().get("pairs") or []) if p.get("chainId") == chain]
            if not pairs:
                continue
            best = max(pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0.0)
            base = (best.get("baseToken") or {}).get("symbol", "?")
            quote = (best.get("quoteToken") or {}).get("symbol", "?")
            rows.append({
                "asset": asset,
                "pair": f"{base}/{quote}",
                "liquidity_usd": (best.get("liquidity") or {}).get("usd"),
                "volume_24h": (best.get("volume") or {}).get("h24"),
                "ts": ts,
            })
        return [TableRows("dex_liquidity", rows, "asset,pair,ts")]
