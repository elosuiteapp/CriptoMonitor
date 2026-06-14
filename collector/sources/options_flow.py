"""Proxy de fluxo de opções — HIRO simplificado (PRD3, Fase 6 Tier).

A cada ciclo lê as negociações de opções da Deribit dos últimos 5 min e calcula
o delta-fluxo líquido do hedge dos dealers (convenção SpotGamma):
  · compra de call  → dealer compra o ativo  → fluxo +
  · venda de call   → dealer vende o ativo    → fluxo −
  · compra de put   → dealer vende o ativo    → fluxo −
  · venda de put    → dealer compra o ativo    → fluxo +
Peso = |delta| (Black-Scholes) × quantidade. É aproximação de 5 min, não tick a
tick — o HIRO real é proprietário/tempo real.
"""
from __future__ import annotations

import math
import time

import httpx

from lib.gamma import SECONDS_PER_YEAR, parse_instrument_name
from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("options_flow")
_URL = "https://www.deribit.com/api/v2/public/get_last_trades_by_currency_and_time"
OPTION_ASSETS = ("BTC", "ETH")


def _abs_delta(s: float, k: float, t_years: float, sigma: float, is_call: bool) -> float:
    if s <= 0 or k <= 0 or t_years <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(s / k) + 0.5 * sigma * sigma * t_years) / (sigma * math.sqrt(t_years))
    nd1 = 0.5 * (1.0 + math.erf(d1 / math.sqrt(2.0)))
    return abs(nd1 if is_call else nd1 - 1.0)


class OptionsFlowSource(BaseSource):
    name = "options_flow"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        now = now_utc()
        ts = to_iso(now.replace(second=0, microsecond=0))
        now_ms = int(time.time() * 1000)
        start_ms = now_ms - 5 * 60 * 1000  # janela do ciclo (5 min)

        rows: list[dict] = []
        for asset in assets:
            if asset not in OPTION_ASSETS:
                continue
            resp = await http.get(
                _URL,
                params={"currency": asset, "kind": "option", "start_timestamp": start_ms,
                        "end_timestamp": now_ms, "count": 1000},
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
                t_years = (parsed["expiry"] - now).total_seconds() / SECONDS_PER_YEAR
                delta = _abs_delta(float(spot), parsed["strike"], t_years, float(iv) / 100.0, parsed["type"] == "call")
                is_call = parsed["type"] == "call"
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
