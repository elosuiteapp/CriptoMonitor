"""Deribit — book de opções → módulo Gamma (PRD fonte #4 + §8.5).

Uma única chamada por ativo (`get_book_summary_by_currency`) traz todos os
instrumentos com OI, mark IV e underlying price. O `lib.gamma` calcula GEX por
strike, Zero Gamma, regime e Max Pain. Restrito a BTC e ETH (liquidez de opções
de SOL insuficiente).

Para manter o `options_oi` enxuto no free tier, gravamos apenas os instrumentos
do vencimento mais próximo (o relevante para walls/max pain); o histograma
completo por strike fica no `gamma_profile.profile_jsonb`.
"""
from __future__ import annotations

import statistics

import httpx

from lib import gamma
from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso
from lib.volatility import fetch_rv_30d, ivp_90d, term_structure

from .base import BaseSource, TableRows

log = get_logger("deribit")

_BOOK_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
_VOL_URL = "https://www.deribit.com/api/v2/public/get_volatility_index_data"
OPTION_ASSETS = ("BTC", "ETH")


# ─── DVOL: índice de volatilidade implícita exclusivo da Deribit (só BTC/ETH) ──
async def fetch_dvol(http: httpx.AsyncClient, currency: str, now) -> float | None:
    """Ultimo DVOL (indice de volatilidade implicita da Deribit), em %."""
    now_ms = int(now.timestamp() * 1000)
    try:
        r = await http.get(_VOL_URL, params={
            "currency": currency, "start_timestamp": now_ms - 1_800_000,
            "end_timestamp": now_ms, "resolution": 60,
        }, timeout=15.0)
        r.raise_for_status()
        data = r.json().get("result", {}).get("data", [])
        return round(float(data[-1][4]), 4) if data else None  # close do ultimo candle
    except Exception as exc:  # noqa: BLE001
        log.warning("DVOL %s indisponivel: %s", currency, exc)
        return None


class DeribitSource(BaseSource):
    name = "deribit"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        now = now_utc()
        ts = to_iso(now)
        opt_rows: list[dict] = []
        gp_rows: list[dict] = []
        vol_rows: list[dict] = []

        for asset in assets:
            if asset not in OPTION_ASSETS:
                continue
            resp = await http.get(
                _BOOK_URL, params={"currency": asset, "kind": "option"}, timeout=20.0
            )
            resp.raise_for_status()
            data = resp.json().get("result", [])

            book: list[gamma.OptionInput] = []
            underlyings: list[float] = []
            for item in data:
                parsed = gamma.parse_instrument_name(item.get("instrument_name", ""))
                if not parsed:
                    continue
                up = item.get("underlying_price")
                if up:
                    underlyings.append(float(up))
                book.append(gamma.OptionInput(
                    strike=parsed["strike"],
                    type=parsed["type"],
                    oi=item.get("open_interest") or 0.0,
                    iv=item.get("mark_iv") or 0.0,
                    expiry=parsed["expiry"],
                ))

            if not book or not underlyings:
                continue
            spot = statistics.median(underlyings)
            res = gamma.compute(book, spot, now)
            if res is None:
                continue

            # options_oi: apenas o vencimento mais próximo (limita volume)
            nearest = res.max_pain_expiry
            for opt, gm, gx in zip(res.options, res.per_option_gamma, res.per_option_gex):
                if opt.expiry != nearest:
                    continue
                opt_rows.append({
                    "asset": asset,
                    "strike": opt.strike,
                    "type": opt.type,
                    "oi": opt.oi,
                    "gamma": gm,
                    "gex": gx,
                    "expiry": to_iso(opt.expiry),
                    "ts": ts,
                })

            gp_rows.append({
                "asset": asset,
                "zero_gamma_level": res.zero_gamma_level,
                "regime": res.regime,
                "max_pain": res.max_pain,
                "max_pain_expiry": to_iso(res.max_pain_expiry) if res.max_pain_expiry else None,
                "net_gex_spot": res.net_gex_spot,
                "spot_price": res.spot_price,
                "profile_jsonb": res.profile,
                "put_call_ratio": res.put_call_ratio,
                "avg_iv": res.avg_iv,
                "iv_skew": res.iv_skew,
                "call_wall": res.call_wall,
                "put_wall": res.put_wall,
                "avg_call_strike": res.avg_call_strike,
                "avg_put_strike": res.avg_put_strike,
                "ts": ts,
            })

            # Volatility Dashboard — isolado: erro aqui nunca afeta o gamma
            try:
                dvol = await fetch_dvol(http, asset, now)
                rv30, rv_days = await fetch_rv_30d(http, asset)
                ivp, ivp_n = ivp_90d(asset, res.avg_iv, now)
                term = term_structure(book, now)
                spread = round(dvol - rv30, 4) if (dvol is not None and rv30 is not None) else None
                log.info("vol %s: dvol=%s ivp=%s(n=%s) rv30=%s(dias=%s) term=%s",
                         asset, dvol, ivp, ivp_n, rv30, rv_days, term)
                vol_rows.append({
                    "asset": asset, "dvol": dvol, "ivp_90d": ivp, "rv_30d": rv30,
                    "iv_rv_spread": spread, "term_structure": term, "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001
                log.warning("metricas de volatilidade %s falharam: %s", asset, exc)

        return [
            TableRows("options_oi", opt_rows, "asset,strike,type,expiry,ts"),
            TableRows("gamma_profile", gp_rows, "asset,ts"),
            TableRows("volatility_index", vol_rows, "asset,ts"),
        ]
