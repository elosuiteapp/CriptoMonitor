"""Coinalyze — derivativos AGREGADOS multi-exchange (PRD fonte #3, primária).

Fornece OI, funding rate, long/short ratio e liquidações somados/médios entre
todas as exchanges. Chave gratuita (header `api_key`), 40 calls/min — usamos
~5 calls/ciclo (batch de símbolos), bem dentro do limite.

Fluxo:
  1. /future-markets  → descobre os símbolos perpétuos de cada ativo;
  2. /open-interest    (atual, convert_to_usd) → soma por ativo;
  3. /funding-rate     (atual)                 → média por ativo;
  4. /liquidation-history (última hora)        → soma long/short por ativo;
  5. /long-short-ratio-history (último ponto)  → média por ativo.

Obs.: a validação fina dos nomes de campo desta API deve ser feita com a chave
real em mãos (o smoke test confirma). O CVD próprio vem da Binance (fonte #1).
"""
from __future__ import annotations

import os
import time

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_BASE = "https://api.coinalyze.net/v1"

# O free tier cobra a cota por nº de símbolos no request. Agregamos apenas as
# exchanges mais líquidas e limitamos por ativo para manter as chamadas leves.
_MAJOR_EXCHANGES = ("binance", "bybit", "okx", "bitget", "gate", "deribit", "htx", "kraken")
_MAX_SYMBOLS_PER_ASSET = 3


class CoinalyzeSource(BaseSource):
    name = "coinalyze"
    requires_key = True

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        key = os.getenv("COINALYZE_API_KEY")
        if not key:
            raise RuntimeError("COINALYZE_API_KEY ausente no .env")
        headers = {"api-key": key}
        ts = to_iso(now_utc())

        # 1. Códigos das exchanges principais (para filtrar e aliviar a cota)
        ex_resp = await http.get(f"{_BASE}/exchanges", headers=headers, timeout=20.0)
        ex_resp.raise_for_status()
        major_codes = {
            e["code"] for e in ex_resp.json()
            if any(maj in (e.get("name", "").lower()) for maj in _MAJOR_EXCHANGES)
        }

        # 2. Descobrir símbolos perpétuos por ativo (só exchanges principais, com teto)
        resp = await http.get(f"{_BASE}/future-markets", headers=headers, timeout=20.0)
        resp.raise_for_status()
        by_asset: dict[str, list[str]] = {a: [] for a in assets}
        for m in resp.json():
            if not m.get("is_perpetual"):
                continue
            base = m.get("base_asset")
            if base in by_asset and m.get("exchange") in major_codes:
                if len(by_asset[base]) < _MAX_SYMBOLS_PER_ASSET:
                    by_asset[base].append(m["symbol"])

        all_symbols = [s for a in assets for s in by_asset.get(a, [])]
        if not all_symbols:
            return [TableRows("derivatives", [], "asset,ts")]
        symbols = ",".join(all_symbols)

        # 2-3. OI e funding atuais (batch)
        oi_map = await self._current(http, headers, "open-interest", symbols,
                                     params={"convert_to_usd": "true"})
        fr_map = await self._current(http, headers, "funding-rate", symbols)

        # 4-5. Liquidações (24h — esporádicas; janela curta vinha quase sempre
        # vazia) e long/short ratio (último ponto)
        now_s = int(time.time())
        liq_long, liq_short = await self._liquidations(http, headers, symbols, now_s - 86400, now_s)
        lsr_map = await self._latest_history(http, headers, "long-short-ratio-history",
                                             symbols, now_s - 1800, now_s, field="r")

        rows: list[dict] = []
        for asset in assets:
            syms = by_asset.get(asset, [])
            if not syms:
                continue
            oi_sum = sum(oi_map.get(s) or 0.0 for s in syms) or None
            fr_vals = [fr_map[s] for s in syms if fr_map.get(s) is not None]
            lsr_vals = [lsr_map[s] for s in syms if lsr_map.get(s) is not None]
            rows.append({
                "asset": asset,
                "open_interest": oi_sum,
                "funding_rate": (sum(fr_vals) / len(fr_vals)) if fr_vals else None,
                "long_short_ratio": (sum(lsr_vals) / len(lsr_vals)) if lsr_vals else None,
                # 0 é zero real (sem liquidações na janela); None só se a API falhou
                "liq_long_usd": None if liq_long is None else sum(liq_long.get(s, 0.0) for s in syms),
                "liq_short_usd": None if liq_short is None else sum(liq_short.get(s, 0.0) for s in syms),
                "cvd": None,  # CVD próprio vem da Binance
                "ts": ts,
            })
        return [TableRows("derivatives", rows, "asset,ts")]

    # ─── helpers ─────────────────────────────────────────────────────────────
    async def _current(self, http, headers, endpoint, symbols, params=None) -> dict[str, float]:
        p = {"symbols": symbols, **(params or {})}
        r = await http.get(f"{_BASE}/{endpoint}", headers=headers, params=p, timeout=20.0)
        r.raise_for_status()
        return {x["symbol"]: x.get("value") for x in r.json()}

    async def _latest_history(self, http, headers, endpoint, symbols, frm, to, field) -> dict[str, float]:
        try:
            p = {"symbols": symbols, "interval": "5min", "from": frm, "to": to}
            r = await http.get(f"{_BASE}/{endpoint}", headers=headers, params=p, timeout=20.0)
            r.raise_for_status()
            out: dict[str, float] = {}
            for entry in r.json():
                hist = entry.get("history") or []
                if hist:
                    out[entry["symbol"]] = hist[-1].get(field)
            return out
        except Exception:  # noqa: BLE001 — best-effort
            return {}

    async def _liquidations(self, http, headers, symbols, frm, to) -> tuple[dict | None, dict | None]:
        """Soma de liquidações long/short por símbolo na janela. (None, None) se a
        API falhar — para distinguir 'sem liquidações' (0) de 'indisponível'."""
        longs: dict[str, float] = {}
        shorts: dict[str, float] = {}
        try:
            p = {"symbols": symbols, "interval": "1hour", "from": frm, "to": to,
                 "convert_to_usd": "true"}
            r = await http.get(f"{_BASE}/liquidation-history", headers=headers, params=p, timeout=20.0)
            r.raise_for_status()
            for entry in r.json():
                sym = entry["symbol"]
                longs[sym] = sum(float(h.get("l") or 0.0) for h in entry.get("history", []))
                shorts[sym] = sum(float(h.get("s") or 0.0) for h in entry.get("history", []))
        except Exception:  # noqa: BLE001 — best-effort
            return None, None
        return longs, shorts
