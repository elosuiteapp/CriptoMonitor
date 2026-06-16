"""Proxy de fluxo de opções — HIRO simplificado (PRD3, Fase 6 Tier).

A cada ciclo lê as negociações de opções da Deribit do último bucket de 5 min
COMPLETO (ancorado na grade …:00,:05,…) e calcula o delta-fluxo líquido do hedge
dos dealers (convenção SpotGamma):
  · compra de call  → dealer compra o ativo  → fluxo +
  · venda de call   → dealer vende o ativo    → fluxo −
  · compra de put   → dealer vende o ativo    → fluxo −
  · venda de put    → dealer compra o ativo    → fluxo +
Peso = |delta| (Black-Scholes) × quantidade. É aproximação de 5 min, não tick a
tick — o HIRO real é proprietário/tempo real.

Por que ancorar na grade: o upsert é por (asset, ts) com ts = início do bucket.
Assim, reinícios do worker (que disparam um ciclo imediato fora de hora) ou ciclos
sobrepostos reescrevem a MESMA linha em vez de re-somar trades de janelas que se
cruzam — o que inflava o fluxo acumulado. Buckets fixos tilam sem sobreposição.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

import httpx

from lib.gamma import SECONDS_PER_YEAR, parse_instrument_name
from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("options_flow")
_URL = "https://www.deribit.com/api/v2/public/get_last_trades_by_currency_and_time"
OPTION_ASSETS = ("BTC", "ETH")
_BUCKET_SEC = 5 * 60  # bucket de 5 min, alinhado à grade


def _abs_delta(s: float, k: float, t_years: float, sigma: float, is_call: bool) -> float:
    if s <= 0 or k <= 0 or t_years <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(s / k) + 0.5 * sigma * sigma * t_years) / (sigma * math.sqrt(t_years))
    nd1 = 0.5 * (1.0 + math.erf(d1 / math.sqrt(2.0)))
    return abs(nd1 if is_call else nd1 - 1.0)


class OptionsFlowSource(BaseSource):
    name = "options_flow"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        # Bucket de 5 min COMPLETO mais recente, ancorado na grade (…:00,:05,…).
        now_s = int(now_utc().timestamp())
        bucket_end_s = (now_s // _BUCKET_SEC) * _BUCKET_SEC
        bucket_start_s = bucket_end_s - _BUCKET_SEC
        bucket_end = datetime.fromtimestamp(bucket_end_s, tz=timezone.utc)
        ts = to_iso(datetime.fromtimestamp(bucket_start_s, tz=timezone.utc))
        start_ms = bucket_start_s * 1000
        end_ms = bucket_end_s * 1000

        rows: list[dict] = []
        for asset in assets:
            if asset not in OPTION_ASSETS:
                continue
            resp = await http.get(
                _URL,
                params={"currency": asset, "kind": "option", "start_timestamp": start_ms,
                        "end_timestamp": end_ms, "count": 1000},
                timeout=20.0,
            )
            resp.raise_for_status()
            trades = resp.json().get("result", {}).get("trades", [])

            net = 0.0
            for tr in trades:
                parsed = parse_instrument_name(tr.get("instrument_name", ""))
                spot = tr.get("index_price")
                iv = tr.get("iv")
                amount = tr.get("amount")
                if not parsed or not spot or not iv or not amount:
                    continue
                t_years = (parsed["expiry"] - bucket_end).total_seconds() / SECONDS_PER_YEAR
                is_call = parsed["type"] == "call"
                delta = _abs_delta(float(spot), parsed["strike"], t_years, float(iv) / 100.0, is_call)
                is_buy = tr.get("direction") == "buy"
                sign = (1 if is_buy else -1) if is_call else (-1 if is_buy else 1)
                net += sign * delta * float(amount)

            rows.append({
                "asset": asset,
                "net_delta_flow": round(net, 4),
                "trades_count": len(trades),
                "ts": ts,
            })
        return [TableRows("options_flow", rows, "asset,ts")]
