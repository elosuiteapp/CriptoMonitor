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
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_BOOK_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
OPTION_ASSETS = ("BTC", "ETH")


class DeribitSource(BaseSource):
    name = "deribit"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        now = now_utc()
        ts = to_iso(now)
        opt_rows: list[dict] = []
        gp_rows: list[dict] = []

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
                "ts": ts,
            })

        return [
            TableRows("options_oi", opt_rows, "asset,strike,type,expiry,ts"),
            TableRows("gamma_profile", gp_rows, "asset,ts"),
        ]
