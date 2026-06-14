"""DefiLlama — TVL por chain + fluxo de stablecoins 24h (PRD fonte #5).

Saúde de rede de ETH e SOL. Sem chave. O fluxo de stablecoins é a variação do
circulante (D-1 → D) na chain.
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_CHAINS_URL = "https://api.llama.fi/v2/chains"
_STABLE_URL = "https://stablecoins.llama.fi/stablecoincharts/{chain}"

# Mapeia o ativo do MVP para o nome da chain no DefiLlama.
_ASSET_CHAIN = {"ETH": "Ethereum", "SOL": "Solana"}


def _total_circulating(point: dict) -> float | None:
    value = point.get("totalCirculatingUSD")
    if isinstance(value, dict):
        return sum(float(v) for v in value.values())
    if value is not None:
        return float(value)
    return None


class DefiLlamaSource(BaseSource):
    name = "defillama"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        rows: list[dict] = []

        resp = await http.get(_CHAINS_URL, timeout=20.0)
        resp.raise_for_status()
        tvl_by_chain = {c.get("name"): c.get("tvl") for c in resp.json()}

        for asset in assets:
            chain = _ASSET_CHAIN.get(asset)
            if not chain:
                continue
            tvl = tvl_by_chain.get(chain)

            flow = None
            try:
                sc = await http.get(_STABLE_URL.format(chain=chain), timeout=20.0)
                sc.raise_for_status()
                series = sc.json()
                if isinstance(series, list) and len(series) >= 2:
                    last = _total_circulating(series[-1])
                    prev = _total_circulating(series[-2])
                    if last is not None and prev is not None:
                        flow = last - prev
            except Exception:  # noqa: BLE001 — fluxo é best-effort
                flow = None

            rows.append({
                "chain": chain.lower(),
                "tvl_usd": tvl,
                "stablecoin_flow_24h": flow,
                "ts": ts,
            })
        return [TableRows("defi_health", rows, "chain,ts")]
