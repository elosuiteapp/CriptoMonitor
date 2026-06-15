"""Métricas de volatilidade compartilhadas — usadas pelo Deribit (BTC/ETH) e pelo
Bybit (SOL via relay). Genéricas: funcionam para qualquer ativo com book de opções
+ par spot na Binance.vision. O DVOL fica no `deribit.py` (índice exclusivo da Deribit).

- `fetch_rv_30d`: realized vol 30d anualizada, dos klines diários (binance.vision).
- `term_structure`: IV média ponderada por OI por tenor [7,30,90,180]d, do book ao vivo.
- `ivp_90d`: percentil do IV atual contra os últimos 90d de `gamma_profile.avg_iv`.
"""
from __future__ import annotations

import math
import statistics
from datetime import timedelta

import httpx

from lib import gamma
from lib.logger import get_logger
from lib.supabase_client import get_supabase
from lib.timeutil import to_iso

log = get_logger("volatility")

_KLINES = "https://data-api.binance.vision/api/v3/klines"  # OHLCV diário (RV), sem geo-bloqueio
TENORS = [7, 30, 90, 180]  # buckets da term structure (dias)
# Par spot p/ a RV. Estender aqui habilita a RV de novos ativos automaticamente.
RV_SYMBOL = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"}


async def fetch_rv_30d(http: httpx.AsyncClient, asset: str) -> tuple[float | None, int]:
    """RV 30d anualizada (%): std dos log-returns diários x sqrt(365). Klines diários."""
    symbol = RV_SYMBOL.get(asset)
    if not symbol:
        return None, 0
    try:
        r = await http.get(_KLINES, params={"symbol": symbol, "interval": "1d", "limit": 31}, timeout=15.0)
        r.raise_for_status()
        closes = [float(k[4]) for k in r.json()]
        rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes)) if closes[i - 1] > 0]
        if len(rets) < 2:
            return None, len(closes)
        rv = statistics.stdev(rets) * math.sqrt(365) * 100.0
        return round(rv, 4), len(rets)
    except Exception as exc:  # noqa: BLE001
        log.warning("RV30 %s indisponivel: %s", asset, exc)
        return None, 0


def term_structure(book: list[gamma.OptionInput], now) -> dict | None:
    """IV media ponderada por OI por tenor [7,30,90,180] dias, do book ao vivo."""
    buckets = {t: [0.0, 0.0] for t in TENORS}  # tenor -> [sum(iv*oi), sum(oi)]
    for o in book:
        if not o.iv or not o.oi or o.oi <= 0:
            continue
        dte = (o.expiry - now).total_seconds() / 86400.0
        if dte < 0:
            continue
        tenor = min(TENORS, key=lambda t: abs(t - dte))
        buckets[tenor][0] += o.iv * o.oi
        buckets[tenor][1] += o.oi
    out = {f"{t}d": round(s / w, 2) for t, (s, w) in buckets.items() if w > 0}
    return out or None


def ivp_90d(asset: str, current_iv: float | None, now) -> tuple[float | None, int]:
    """Percentil (0-100) do IV atual contra os ultimos 90d de avg_iv (gamma_profile)."""
    if current_iv is None:
        return None, 0
    try:
        cutoff = to_iso(now - timedelta(days=90))
        res = (
            get_supabase().table("gamma_profile")
            .select("avg_iv").eq("asset", asset).gte("ts", cutoff)
            .not_.is_("avg_iv", "null").limit(30000).execute()
        )
        hist = [float(r["avg_iv"]) for r in (res.data or []) if r.get("avg_iv") is not None]
        if len(hist) < 5:
            return None, len(hist)
        below = sum(1 for v in hist if v <= current_iv)
        return round(below / len(hist) * 100.0, 2), len(hist)
    except Exception as exc:  # noqa: BLE001
        log.warning("IVP %s indisponivel: %s", asset, exc)
        return None, 0
