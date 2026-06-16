"""Macro & Correlações (PRD3 §8.8.3, fonte #11) — Fase 6.

Yahoo Finance (endpoint chart v8, sem chave) para DXY, S&P 500, ouro e o yield
da treasury de 10 anos. Calcula a variação 24h/7d e a correlação de 30 dias dos
retornos diários entre cada cripto (BTC/ETH/SOL via Binance) e cada ativo macro.
Coletado em cadência mais espaçada (30 min) pelo aggregator.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import numpy as np

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("macro")
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
_YF = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2mo"
_BINANCE = "https://api.binance.com/api/v3/klines"

# (código interno, nome exibido, símbolo no Yahoo)
_MACRO = [
    ("DXY", "Dollar Index (DXY)", "DX-Y.NYB"),
    ("SPX", "S&P 500", "^GSPC"),
    ("GOLD", "Ouro", "GC=F"),
    ("US10Y", "Treasury 10 anos", "^TNX"),
]
_CRYPTO_SYMBOL = {
    "BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT",
    "XRP": "XRPUSDT", "DOGE": "DOGEUSDT", "ADA": "ADAUSDT", "AVAX": "AVAXUSDT",
    "LINK": "LINKUSDT", "SUI": "SUIUSDT", "TON": "TONUSDT", "POL": "POLUSDT",
    "DOT": "DOTUSDT", "LTC": "LTCUSDT",
    "AAVE": "AAVEUSDT", "UNI": "UNIUSDT", "LDO": "LDOUSDT", "ARB": "ARBUSDT", "ATOM": "ATOMUSDT",
    "PEPE": "PEPEUSDT",
}


def _date(ts_seconds: float) -> str:
    return datetime.fromtimestamp(ts_seconds, tz=timezone.utc).strftime("%Y-%m-%d")


def _series_to_returns(series: dict[str, float], other: dict[str, float]) -> tuple[np.ndarray, np.ndarray]:
    """Alinha duas séries date→close pelas datas comuns e devolve os retornos diários."""
    common = sorted(set(series) & set(other))
    a = np.array([series[d] for d in common], dtype=float)
    b = np.array([other[d] for d in common], dtype=float)
    if len(common) < 8:
        return np.array([]), np.array([])
    return np.diff(a) / a[:-1], np.diff(b) / b[:-1]


def _pearson(ra: np.ndarray, rb: np.ndarray) -> float | None:
    if len(ra) < 6 or ra.std() == 0 or rb.std() == 0:
        return None
    return round(float(np.corrcoef(ra, rb)[0, 1]), 4)


class MacroMarketsSource(BaseSource):
    name = "macro_markets"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        headers = {"User-Agent": _UA}

        # 1. Macro: preço + variações + série diária (para correlação)
        macro_rows: list[dict] = []
        macro_series: dict[str, dict[str, float]] = {}
        for code, name, yf in _MACRO:
            try:
                url = _YF.format(sym=yf.replace("^", "%5E"))
                r = await http.get(url, headers=headers, timeout=20.0)
                r.raise_for_status()
                result = r.json()["chart"]["result"][0]
                stamps = result.get("timestamp") or []
                closes = result["indicators"]["quote"][0].get("close") or []
                series = {
                    _date(t): float(c)
                    for t, c in zip(stamps, closes)
                    if c is not None
                }
                macro_series[code] = series
                ordered = [series[d] for d in sorted(series)]
                price = result.get("meta", {}).get("regularMarketPrice") or (ordered[-1] if ordered else None)
                change_24h = (ordered[-1] - ordered[-2]) / ordered[-2] if len(ordered) >= 2 else None
                change_7d = (ordered[-1] - ordered[-6]) / ordered[-6] if len(ordered) >= 6 else None
                macro_rows.append({
                    "symbol": code, "name": name, "price": price,
                    "change_24h": change_24h, "change_7d": change_7d, "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001 — um símbolo fora não derruba os demais
                log.warning("macro %s falhou: %s", code, exc)

        # 2. Cripto: série diária (Binance) para a correlação
        crypto_series: dict[str, dict[str, float]] = {}
        for asset in assets:
            sym = _CRYPTO_SYMBOL.get(asset)
            if not sym:
                continue
            try:
                r = await http.get(_BINANCE, params={"symbol": sym, "interval": "1d", "limit": 45}, timeout=20.0)
                r.raise_for_status()
                crypto_series[asset] = {_date(k[0] / 1000): float(k[4]) for k in r.json()}
            except Exception as exc:  # noqa: BLE001
                log.warning("klines diários %s falharam: %s", asset, exc)

        # 3. Correlação 30d (retornos diários) cripto × macro
        corr_rows: list[dict] = []
        for asset, cseries in crypto_series.items():
            for code in macro_series:
                ra, rb = _series_to_returns(cseries, macro_series[code])
                corr = _pearson(ra, rb)
                if corr is not None:
                    corr_rows.append({"asset": asset, "macro_symbol": code, "corr_30d": corr, "ts": ts})

        return [
            TableRows("macro_assets", macro_rows, "symbol,ts"),
            TableRows("macro_correlations", corr_rows, "asset,macro_symbol,ts"),
        ]
