"""Cryptocurrency.cv — feed de notícias (PRD fonte #10).

Contexto de eventos para a análise de IA. REST JSON, sem chave. A URL é
configurável por `NEWS_FEED_URL` (o endpoint real deve ser confirmado quando
formos plugar a fonte). O parser aceita os formatos de campo mais comuns
(title, url, source, published_at, currencies/assets) e mapeia os ativos
citados para os símbolos padronizados BTC/ETH/SOL.
"""
from __future__ import annotations

import os

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_DEFAULT_URL = "https://cryptocurrency.cv/api/news"

# Termos → símbolo padronizado, para preencher `assets[]`.
_ASSET_TERMS = {
    "BTC": ("btc", "bitcoin"),
    "ETH": ("eth", "ethereum", "ether"),
    "SOL": ("sol", "solana"),
}


def _first(d: dict, *keys):
    for k in keys:
        if d.get(k) not in (None, ""):
            return d[k]
    return None


def _detect_assets(item: dict) -> list[str]:
    # Tenta campos explícitos primeiro
    explicit = _first(item, "currencies", "assets", "coins", "tickers")
    text = ""
    if isinstance(explicit, list):
        text = " ".join(str(x) for x in explicit)
    text = (text + " " + str(_first(item, "title", "headline") or "")).lower()
    return [sym for sym, terms in _ASSET_TERMS.items() if any(t in text for t in terms)]


class CryptocurrencyCvSource(BaseSource):
    name = "cryptocurrency_cv"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        url = os.getenv("NEWS_FEED_URL", _DEFAULT_URL)
        resp = await http.get(url, timeout=20.0)
        resp.raise_for_status()
        payload = resp.json()
        items = payload if isinstance(payload, list) else (
            payload.get("data") or payload.get("articles") or payload.get("results") or []
        )

        now_iso = to_iso(now_utc())
        rows: list[dict] = []
        for item in items[:50]:
            if not isinstance(item, dict):
                continue
            title = _first(item, "title", "headline", "name")
            link = _first(item, "url", "link", "source_url")
            if not title or not link:
                continue
            published = _first(item, "published_at", "publishedAt", "date", "created_at") or now_iso
            rows.append({
                "title": str(title)[:500],
                "source": _first(item, "source", "source_name", "publisher", "author"),
                "url": str(link),
                "assets": _detect_assets(item),
                "published_at": str(published),
            })
        return [TableRows("news_feed", rows, "url")]
