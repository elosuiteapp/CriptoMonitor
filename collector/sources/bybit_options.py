"""Bybit options → módulo Gamma para ativos SEM opções na Deribit (ex.: SOL).

A Bybit é geo-bloqueada na região do coletor (Railway US), mas tem opções de SOL
líquidas. Solução: o coletor NÃO chama a Bybit direto — chama a Edge Function
`bybit-relay` (Supabase em sa-east-1, que alcança a Bybit) e recebe o book de opções.
Os dados alimentam o MESMO motor `lib/gamma.py` (agnóstico de fonte).

Símbolo Bybit: `SOL-26JUN26-82-P-USDT` (base-DDMMMYY-strike-tipo-settle). IV vem em
fração (0.54) → convertemos para % (×100) para casar com o motor (que faz iv/100).
"""
from __future__ import annotations

import asyncio
import math
import os
import re
import statistics
from datetime import datetime, timezone

import httpx

from lib import gamma
from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso
from lib.volatility import fetch_rv_30d, ivp_90d, term_structure

from .base import BaseSource, TableRows

log = get_logger("bybit_options")

# Ativos cujo gamma vem da Bybit (Deribit cobre BTC/ETH; não duplicar).
BYBIT_OPTION_ASSETS = ("SOL",)
_MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}
_RE = re.compile(r"^[A-Z]+-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])-[A-Z]+$")


def _parse(symbol: str) -> dict | None:
    """Decodifica o instrumento Bybit. Opções expiram às 08:00 UTC."""
    m = _RE.match(symbol.strip().upper())
    if not m:
        return None
    day, mon, yr, strike, typ = m.groups()
    month = _MONTHS.get(mon)
    if month is None:
        return None
    try:
        expiry = datetime(2000 + int(yr), month, int(day), 8, 0, 0, tzinfo=timezone.utc)
    except ValueError:
        return None
    return {"strike": float(strike), "type": "call" if typ == "C" else "put", "expiry": expiry}


def _abs_delta(s: float, k: float, t_years: float, sigma: float, is_call: bool) -> float:
    """|delta| de Black-Scholes (r≈0); sigma em FRAÇÃO (ex.: 0.52). Usado no HIRO."""
    if s <= 0 or k <= 0 or t_years <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(s / k) + 0.5 * sigma * sigma * t_years) / (sigma * math.sqrt(t_years))
    nd1 = 0.5 * (1.0 + math.erf(d1 / math.sqrt(2.0)))
    return abs(nd1 if is_call else nd1 - 1.0)


class BybitOptionsSource(BaseSource):
    name = "bybit_options"

    async def _options_flow(self, http: httpx.AsyncClient, relay: str, asset: str, now: datetime) -> dict | None:
        """HIRO da SOL: delta-fluxo do hedge dos dealers a partir dos TRADES de opções da
        Bybit (relay kind=trades), no último bucket COMPLETO de 5 min ancorado na grade
        (…:00,:05,…). Convenção SpotGamma: compra call/venda put → +; venda call/compra put → −.
        Peso = |delta| (Black-Scholes) × tamanho. Ancorar na grade evita re-somar trades em
        reinícios do worker (o upsert por (asset,ts) reescreve a mesma linha)."""
        bucket_sec = 5 * 60
        now_s = int(now.timestamp())
        bucket_end_s = (now_s // bucket_sec) * bucket_sec
        bucket_start_s = bucket_end_s - bucket_sec
        bucket_end = datetime.fromtimestamp(bucket_end_s, tz=timezone.utc)
        ts = to_iso(datetime.fromtimestamp(bucket_start_s, tz=timezone.utc))
        start_ms, end_ms = bucket_start_s * 1000, bucket_end_s * 1000

        trades: list[dict] = []
        for attempt in range(1, 4):
            try:
                resp = await http.get(
                    relay, params={"coin": asset, "kind": "trades"},
                    headers={"x-region": "sa-east-1"}, timeout=25.0,
                )
                body = resp.json()
                if resp.status_code == 200 and isinstance(body.get("list"), list):
                    trades = body["list"]
                    break
            except Exception as exc:  # noqa: BLE001
                log.warning("relay trades %s tent.%d erro: %s", asset, attempt, exc)
            await asyncio.sleep(1.0)

        net = 0.0
        count = 0
        for tr in trades:
            t = tr.get("t")
            if t is None or not (start_ms <= int(t) < end_ms):
                continue
            parsed = _parse(tr.get("s", ""))
            spot, iv, amount, side = tr.get("ip"), tr.get("iv"), tr.get("q"), tr.get("side")
            if not parsed or not spot or not iv or not amount:
                continue
            t_years = (parsed["expiry"] - bucket_end).total_seconds() / gamma.SECONDS_PER_YEAR
            is_call = parsed["type"] == "call"
            delta = _abs_delta(float(spot), parsed["strike"], t_years, float(iv), is_call)  # iv já é fração
            is_buy = side == "Buy"
            sign = (1 if is_buy else -1) if is_call else (-1 if is_buy else 1)
            net += sign * delta * float(amount)
            count += 1

        return {"asset": asset, "net_delta_flow": round(net, 4), "trades_count": count, "ts": ts}

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        url = os.environ.get("SUPABASE_URL")
        if not url:
            raise RuntimeError("SUPABASE_URL necessaria para o relay Bybit")
        relay = f"{url}/functions/v1/bybit-relay"  # Edge Function publica (verify_jwt=false)

        now = now_utc()
        ts = to_iso(now)
        opt_rows: list[dict] = []
        gp_rows: list[dict] = []
        vol_rows: list[dict] = []
        flow_rows: list[dict] = []

        for asset in assets:
            if asset not in BYBIT_OPTION_ASSETS:
                continue
            # HIRO (fluxo de opções) — independente do gamma; um erro aqui nunca o bloqueia.
            try:
                flow = await self._options_flow(http, relay, asset, now)
                if flow is not None:
                    flow_rows.append(flow)
            except Exception as exc:  # noqa: BLE001
                log.warning("options_flow %s (Bybit) falhou: %s", asset, exc)
            # Edge Functions executam no no mais proximo de QUEM CHAMA. O coletor esta
            # nos EUA (egress que a Bybit bloqueia). x-region=sa-east-1 forca a execucao
            # em Sao Paulo (egress que a Bybit aceita). Retry cobre transientes.
            headers = {"x-region": "sa-east-1"}
            items: list[dict] = []
            for attempt in range(1, 6):
                try:
                    resp = await http.get(relay, params={"coin": asset}, headers=headers, timeout=25.0)
                    body = resp.json()
                    if resp.status_code == 200 and body.get("list"):
                        items = body["list"]
                        break
                    log.warning("relay %s tent.%d: http=%s bybit=%s count=%s",
                                asset, attempt, resp.status_code, body.get("status"), body.get("count"))
                except Exception as exc:  # noqa: BLE001
                    log.warning("relay %s tent.%d erro: %s", asset, attempt, exc)
                await asyncio.sleep(1.0)
            if not items:
                log.warning("bybit_options %s: relay sem dados apos retries", asset)
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
                log.warning("bybit_options %s: book vazio", asset)
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
            log.info("bybit_options %s: %d opcoes, spot=%.2f, zero_gamma=%s, max_pain=%s",
                     asset, len(book), spot, res.zero_gamma_level, res.max_pain)

            # Volatility Dashboard — isolado: erro aqui nunca afeta o gamma.
            # DVOL não existe para SOL (índice exclusivo da Deribit) → fica null.
            try:
                rv30, rv_days = await fetch_rv_30d(http, asset)
                ivp, ivp_n = ivp_90d(asset, res.avg_iv, now)
                term = term_structure(book, now)
                spread = round(res.avg_iv - rv30, 4) if (res.avg_iv is not None and rv30 is not None) else None
                log.info("vol %s (Bybit): ivp=%s(n=%s) rv30=%s(dias=%s) term=%s",
                         asset, ivp, ivp_n, rv30, rv_days, term)
                vol_rows.append({
                    "asset": asset, "dvol": None, "ivp_90d": ivp, "rv_30d": rv30,
                    "iv_rv_spread": spread, "term_structure": term, "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001
                log.warning("metricas de volatilidade %s (Bybit) falharam: %s", asset, exc)

        return [
            TableRows("options_oi", opt_rows, "asset,strike,type,expiry,ts"),
            TableRows("gamma_profile", gp_rows, "asset,ts"),
            TableRows("volatility_index", vol_rows, "asset,ts"),
            TableRows("options_flow", flow_rows, "asset,ts"),
        ]
