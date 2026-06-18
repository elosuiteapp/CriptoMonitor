"""Binance European Options → módulo Gamma para BNB (sem opções na Deribit).

A Binance é geo-bloqueada na região do coletor (Railway US), então — igual à Bybit —
NÃO chamamos a Binance direto: chamamos a Edge Function `bybit-relay` (Supabase em
sa-east-1, que alcança a Binance) com `?venue=binance&coin=BNB`. O relay junta IV
(mark), OI (por expiração) e spot (index) num book enxuto, que alimenta o MESMO motor
`lib/gamma.py` (agnóstico de fonte).

Símbolo Binance: `BNB-260619-560-C` (base-YYMMDD-strike-tipo). Opções expiram 08:00 UTC.
markIV vem em fração (0.87) → ×100 para % (o motor faz iv/100).
"""
from __future__ import annotations

import asyncio
import os
import re
import statistics
from datetime import datetime, timezone

import httpx

from lib import gamma
from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("binance_options")

# Ativos cujo gamma vem da Binance (Deribit cobre BTC/ETH; Bybit cobre SOL).
BINANCE_OPTION_ASSETS = ("BNB",)
_RE = re.compile(r"^[A-Z]+-(\d{6})-(\d+(?:\.\d+)?)-([CP])$")


def _parse(symbol: str) -> dict | None:
    """Decodifica o instrumento Binance (BNB-YYMMDD-strike-C/P). Expira 08:00 UTC."""
    m = _RE.match(symbol.strip().upper())
    if not m:
        return None
    yymmdd, strike, typ = m.groups()
    try:
        expiry = datetime(
            2000 + int(yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:6]),
            8, 0, 0, tzinfo=timezone.utc,
        )
    except ValueError:
        return None
    return {"strike": float(strike), "type": "call" if typ == "C" else "put", "expiry": expiry}


class BinanceOptionsSource(BaseSource):
    name = "binance_options"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        url = os.environ.get("SUPABASE_URL")
        if not url:
            raise RuntimeError("SUPABASE_URL necessaria para o relay Binance")
        relay = f"{url}/functions/v1/bybit-relay"

        now = now_utc()
        ts = to_iso(now)
        opt_rows: list[dict] = []
        gp_rows: list[dict] = []

        for asset in assets:
            if asset not in BINANCE_OPTION_ASSETS:
                continue
            headers = {"x-region": "sa-east-1"}  # força execução em SP (egress que a Binance aceita)
            items: list[dict] = []
            for attempt in range(1, 6):
                try:
                    resp = await http.get(
                        relay, params={"coin": asset, "venue": "binance"}, headers=headers, timeout=25.0,
                    )
                    body = resp.json()
                    if resp.status_code == 200 and body.get("list"):
                        items = body["list"]
                        break
                    log.warning("relay binance %s tent.%d: http=%s count=%s",
                                asset, attempt, resp.status_code, body.get("count"))
                except Exception as exc:  # noqa: BLE001
                    log.warning("relay binance %s tent.%d erro: %s", asset, attempt, exc)
                await asyncio.sleep(1.0)
            if not items:
                log.warning("binance_options %s: relay sem dados apos retries", asset)
                continue

            book: list[gamma.OptionInput] = []
            underlyings: list[float] = []
            for it in items:
                parsed = _parse(it.get("s", ""))
                if not parsed:
                    continue
                u, iv, oi = it.get("u"), it.get("iv"), it.get("oi")
                if u:
                    underlyings.append(float(u))
                book.append(gamma.OptionInput(
                    strike=parsed["strike"],
                    type=parsed["type"],
                    oi=float(oi) if oi else 0.0,
                    iv=float(iv) * 100.0 if iv else 0.0,  # fração → %
                    expiry=parsed["expiry"],
                ))

            if not book or not underlyings:
                log.warning("binance_options %s: book vazio", asset)
                continue
            spot = statistics.median(underlyings)
            res = gamma.compute(book, spot, now)
            if res is None:
                continue

            nearest = res.max_pain_expiry
            for opt, gm, gx in zip(res.options, res.per_option_gamma, res.per_option_gex):
                if opt.expiry != nearest:
                    continue
                opt_rows.append({
                    "asset": asset, "strike": opt.strike, "type": opt.type, "oi": opt.oi,
                    "gamma": gm, "gex": gx, "expiry": to_iso(opt.expiry), "ts": ts,
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
            log.info("binance_options %s: %d opcoes, spot=%.2f, zero_gamma=%s, max_pain=%s",
                     asset, len(book), spot, res.zero_gamma_level, res.max_pain)

        return [
            TableRows("options_oi", opt_rows, "asset,strike,type,expiry,ts"),
            TableRows("gamma_profile", gp_rows, "asset,ts"),
        ]
