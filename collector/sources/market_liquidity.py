"""DefiLlama — liquidez agregada do mercado (institucional/macro).

Dois sinais de DIREÇÃO de mercado, da fonte que já usamos (sem chave):
  • Oferta total de stablecoins (dry powder) + variação 7d — capital parado pronto
    pra entrar/sair de cripto. Subindo = liquidez entrando (combustível); caindo =
    capital saindo.
  • TVL DeFi total — apetite a risco on-chain.
A dominância de stablecoins (stablecoins ÷ market cap total) é calculada no
aggregator, que tem o total_mcap da CoinGecko. Dado diário → cadência espaçada.
"""
from __future__ import annotations

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_STABLE_ALL = "https://stablecoins.llama.fi/stablecoincharts/all"
_CHAINS = "https://api.llama.fi/v2/chains"
_DEXS = "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"
_FEES = "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"


def _total_circulating(point: dict) -> float | None:
    v = point.get("totalCirculatingUSD")
    if isinstance(v, dict):
        return sum(float(x) for x in v.values())
    return float(v) if v is not None else None


class MarketLiquiditySource(BaseSource):
    name = "market_liquidity"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())

        # Oferta total de stablecoins + variação 7d (série diária)
        total_sc = chg7 = chg7_pct = None
        r = await http.get(_STABLE_ALL, timeout=25.0)
        r.raise_for_status()
        series = r.json()
        if isinstance(series, list) and len(series) >= 8:
            last = _total_circulating(series[-1])
            prev7 = _total_circulating(series[-8])
            if last is not None and prev7 is not None:
                total_sc = last
                chg7 = last - prev7
                chg7_pct = (last / prev7 - 1) * 100 if prev7 else None

        # TVL DeFi total (soma das chains) — best-effort
        total_tvl = None
        try:
            c = await http.get(_CHAINS, timeout=20.0)
            c.raise_for_status()
            total_tvl = sum(float(x.get("tvl") or 0.0) for x in c.json()) or None
        except Exception:  # noqa: BLE001
            total_tvl = None

        # Atividade on-chain: volume de DEX (especulação) e fees/receita (uso real) — best-effort
        dex_vol_24h, dex_chg_7d = await self._overview(http, _DEXS)
        fees_24h, fees_chg_7d = await self._overview(http, _FEES)

        row = {
            "total_stablecoin_usd": total_sc,
            "stablecoin_chg_7d_usd": chg7,
            "stablecoin_chg_7d_pct": chg7_pct,
            "total_tvl_usd": total_tvl,
            "dex_volume_24h": dex_vol_24h,
            "dex_change_7d": dex_chg_7d,
            "fees_24h": fees_24h,
            "fees_change_7d": fees_chg_7d,
            "ts": ts,
        }
        return [TableRows("market_liquidity", [row], "ts")]

    async def _overview(self, http, url) -> tuple[float | None, float | None]:
        """(total24h, change_7d %) de um endpoint /overview da DefiLlama. (None, None) se falhar."""
        try:
            r = await http.get(url, timeout=25.0)
            r.raise_for_status()
            d = r.json()
            return d.get("total24h"), d.get("change_7d")
        except Exception:  # noqa: BLE001 — best-effort
            return None, None
