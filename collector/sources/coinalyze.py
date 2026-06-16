"""Coinalyze — derivativos AGREGADOS multi-exchange (PRD fonte #3, primária).

Fornece OI, funding rate, long/short ratio e liquidações somados/médios entre
as exchanges. Chave gratuita (header `api_key`).

ATENÇÃO ao rate limit: o free tier cobra ~1 unidade de cota POR SÍMBOLO no
request (não por request), com teto de ~40/min. Como o ciclo faz 5 requisições
com símbolos (OI, funding, 2× liquidações, long/short), buscar os ~20 ativos de
uma vez precisaria de ~5×20 = 100+ unidades/min → estoura o teto e zera os cards.
Por isso usamos RODÍZIO: cada ciclo atualiza só uma "página" de _PAGE_SIZE ativos
(1 símbolo cada), a página gira pela grade de 5 min, e todos os ativos são cobertos
em ~ceil(N/page) ciclos. Os ativos fora da página vêm do carry-forward de 30 min do
aggregator (ver `_latest_derivatives`), então os cards não piscam.

Fluxo:
  1. /future-markets  → descobre os símbolos perpétuos de cada ativo;
  2. /open-interest    (atual, convert_to_usd) → soma por ativo;
  3. /funding-rate     (atual)                 → média por ativo;
  4. /liquidation-history (24h, 1h)            → soma long/short por ativo (card);
  4b. /liquidation-history (6h, 5min)          → buckets long/short → tabela `liquidations`;
  5. /long-short-ratio-history (último ponto)  → média por ativo.

Obs.: a validação fina dos nomes de campo desta API deve ser feita com a chave
real em mãos (o smoke test confirma). O CVD próprio vem da Binance (fonte #1).
"""
from __future__ import annotations

import asyncio
import math
import os
import random
import time

import httpx

from lib.timeutil import now_utc, sec_to_iso, to_iso

from .base import BaseSource, TableRows

_BASE = "https://api.coinalyze.net/v1"

# O free tier cobra a cota por nº de símbolos no request. Agregamos apenas as
# exchanges mais líquidas e limitamos por ativo para manter as chamadas leves.
_MAJOR_EXCHANGES = ("binance", "bybit", "okx", "bitget", "gate", "deribit", "htx", "kraken")
# 1 símbolo/ativo: com o rodízio, o nº de símbolos por requisição = nº de ativos da
# página. Manter em 1 deixa a página caber em 30 unidades (5 req × 6) e fechar o ciclo
# de cobertura em ~20 min — dentro do carry-forward de 30 min (não pisca).
_MAX_SYMBOLS_PER_ASSET = 1
# Ativos atualizados por ciclo (página do rodízio). 6 × 5 req = 30 unidades < 40/min,
# com folga p/ uma eventual sobreposição de instância. Ajustável via env.
_PAGE_SIZE = max(1, int(os.getenv("COINALYZE_PAGE_SIZE", "6")))
_GRID_SECONDS = 300  # ciclo de 5 min: a página avança 1 por ciclo (determinístico pelo relógio)

# O 429 do free tier reseta em segundos (o header Retry-After vem ~5s). Ele dispara
# quando várias instâncias do coletor — todas com CronTrigger */5 — batem na API no
# MESMO segundo da grade (rajada sincronizada). Retry curto honrando o Retry-After +
# jitter desincroniza e a chamada passa; só propaga o erro se esgotar o teto.
_MAX_RETRIES = 4


def _parse_retry_after(val: str | None, *, default: float = 3.0, cap: float = 8.0) -> float:
    try:
        return min(float(val), cap) if val else default
    except (TypeError, ValueError):
        return default


class CoinalyzeSource(BaseSource):
    name = "coinalyze"
    requires_key = True

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        key = os.getenv("COINALYZE_API_KEY")
        if not key:
            raise RuntimeError("COINALYZE_API_KEY ausente no .env")
        headers = {"api-key": key}
        ts = to_iso(now_utc())

        # Jitter inicial: várias instâncias do coletor disparam no MESMO segundo da
        # grade (CronTrigger */5) → rajada sincronizada estoura o 429 do free tier.
        # Um atraso aleatório curto desincroniza as instâncias já na 1ª tentativa.
        await asyncio.sleep(random.uniform(0, 8))

        # 1. Códigos das exchanges principais (para filtrar e aliviar a cota)
        ex_resp = await self._get(http, f"{_BASE}/exchanges", headers=headers)
        major_codes = {
            e["code"] for e in ex_resp.json()
            if any(maj in (e.get("name", "").lower()) for maj in _MAJOR_EXCHANGES)
        }

        # 2. Descobrir símbolos perpétuos por ativo (só exchanges principais, com teto)
        resp = await self._get(http, f"{_BASE}/future-markets", headers=headers)
        by_asset: dict[str, list[str]] = {a: [] for a in assets}
        for m in resp.json():
            if not m.get("is_perpetual"):
                continue
            base = m.get("base_asset")
            if base in by_asset and m.get("exchange") in major_codes:
                if len(by_asset[base]) < _MAX_SYMBOLS_PER_ASSET:
                    by_asset[base].append(m["symbol"])

        # Rodízio: este ciclo só atualiza uma página de ativos (ver docstring). A página
        # gira de forma determinística pelo relógio (bucket de 5 min % nº de páginas),
        # então todas as instâncias concordam na página atual e a cobertura é estável.
        pages = max(1, math.ceil(len(assets) / _PAGE_SIZE))
        # COINALYZE_PAGE força uma página específica (ops/backfill/debug); sem ela, a
        # página segue o relógio e avança 1 por ciclo.
        forced = os.getenv("COINALYZE_PAGE", "").strip()
        page = (int(forced) % pages) if forced else (int(time.time()) // _GRID_SECONDS) % pages
        page_assets = assets[page * _PAGE_SIZE:(page + 1) * _PAGE_SIZE]

        all_symbols = [s for a in page_assets for s in by_asset.get(a, [])]
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
        # Buckets de 5 min das últimas 6h (histórico por bucket, p/ o gráfico de barras)
        liq_buckets = await self._liquidation_buckets(http, headers, symbols, now_s - 6 * 3600, now_s)
        lsr_map = await self._latest_history(http, headers, "long-short-ratio-history",
                                             symbols, now_s - 1800, now_s, field="r")

        rows: list[dict] = []
        for asset in page_assets:
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

        # Buckets de 5 min agregados por ativo (soma dos símbolos por timestamp de bucket)
        liq_rows: list[dict] = []
        for asset in page_assets:
            syms = by_asset.get(asset, [])
            agg: dict[int, list[float]] = {}  # bucket epoch (s) → [long_usd, short_usd]
            for s in syms:
                for h in liq_buckets.get(s, []):
                    t = h.get("t")
                    if t is None:
                        continue
                    cur = agg.setdefault(int(t), [0.0, 0.0])
                    cur[0] += float(h.get("l") or 0.0)
                    cur[1] += float(h.get("s") or 0.0)
            for t, (lo, sh) in agg.items():
                liq_rows.append({"asset": asset, "ts": sec_to_iso(t),
                                 "long_usd": lo, "short_usd": sh})

        return [
            TableRows("derivatives", rows, "asset,ts"),
            TableRows("liquidations", liq_rows, "asset,ts"),
        ]

    # ─── helpers ─────────────────────────────────────────────────────────────
    async def _get(self, http, url, *, headers, params=None, timeout=20.0):
        """GET com retry no 429 do free tier (ver nota em _MAX_RETRIES). Espera o
        Retry-After + jitter e repete — desincronizando também retries concorrentes
        entre instâncias. Esgotado o teto, propaga o 429."""
        for attempt in range(_MAX_RETRIES):
            r = await http.get(url, headers=headers, params=params, timeout=timeout)
            if r.status_code != 429 or attempt == _MAX_RETRIES - 1:
                r.raise_for_status()
                return r
            await asyncio.sleep(_parse_retry_after(r.headers.get("Retry-After"))
                                + random.uniform(0.5, 2.5))
        raise RuntimeError("coinalyze: retries esgotados")  # inalcançável

    async def _current(self, http, headers, endpoint, symbols, params=None) -> dict[str, float]:
        p = {"symbols": symbols, **(params or {})}
        r = await self._get(http, f"{_BASE}/{endpoint}", headers=headers, params=p)
        return {x["symbol"]: x.get("value") for x in r.json()}

    async def _latest_history(self, http, headers, endpoint, symbols, frm, to, field) -> dict[str, float]:
        try:
            p = {"symbols": symbols, "interval": "5min", "from": frm, "to": to}
            r = await self._get(http, f"{_BASE}/{endpoint}", headers=headers, params=p)
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
            r = await self._get(http, f"{_BASE}/liquidation-history", headers=headers, params=p)
            for entry in r.json():
                sym = entry["symbol"]
                longs[sym] = sum(float(h.get("l") or 0.0) for h in entry.get("history", []))
                shorts[sym] = sum(float(h.get("s") or 0.0) for h in entry.get("history", []))
        except Exception:  # noqa: BLE001 — best-effort
            return None, None
        return longs, shorts

    async def _liquidation_buckets(self, http, headers, symbols, frm, to) -> dict[str, list[dict]]:
        """Histórico de liquidações por bucket de 5 min, por símbolo
        (`{symbol: [{t, l, s}, ...]}`). {} se a API falhar (best-effort)."""
        try:
            p = {"symbols": symbols, "interval": "5min", "from": frm, "to": to,
                 "convert_to_usd": "true"}
            r = await self._get(http, f"{_BASE}/liquidation-history", headers=headers, params=p)
            return {entry["symbol"]: (entry.get("history") or []) for entry in r.json()}
        except Exception:  # noqa: BLE001 — best-effort
            return {}
