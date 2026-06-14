"""Feed de notícias (PRD §3 #10 e §8.6.4).

O endpoint "Cryptocurrency.cv" do PRD não estava acessível; usamos um feed RSS
público e gratuito (Cointelegraph por padrão, configurável por `NEWS_FEED_URL`).
O coletor lê o RSS, extrai as notícias e marca os ativos citados (BTC/ETH/SOL)
para o filtro por ativo no dashboard. Sem chave.
"""
from __future__ import annotations

import os
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import httpx

from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

_DEFAULT_URL = "https://cointelegraph.com/rss"
_UA = "Mozilla/5.0 (compatible; CryptoMonitor/1.0)"

# Termos → símbolo padronizado, para preencher `assets[]`.
_ASSET_TERMS = {
    "BTC": ("btc", "bitcoin"),
    "ETH": ("eth", "ethereum", "ether"),
    "SOL": ("sol", "solana"),
}


def _detect_assets(text: str) -> list[str]:
    low = text.lower()
    return [sym for sym, terms in _ASSET_TERMS.items() if any(t in low for t in terms)]


class CryptocurrencyCvSource(BaseSource):
    name = "news"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        url = os.getenv("NEWS_FEED_URL") or _DEFAULT_URL  # ignora valor vazio
        resp = await http.get(url, headers={"User-Agent": _UA}, timeout=20.0)
        resp.raise_for_status()

        root = ET.fromstring(resp.text)
        channel = root.find("channel")
        if channel is None:
            return [TableRows("news_feed", [], "url")]
        source_name = (channel.findtext("title") or "RSS").strip()
        now_iso = to_iso(now_utc())

        rows: list[dict] = []
        for item in channel.findall("item")[:60]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            if not title or not link:
                continue

            published_at = now_iso
            pub = item.findtext("pubDate")
            if pub:
                try:
                    published_at = to_iso(parsedate_to_datetime(pub))
                except (TypeError, ValueError):
                    pass

            categories = " ".join(c.text or "" for c in item.findall("category"))
            detected = _detect_assets(f"{title} {categories}")
            rows.append({
                "title": title[:500],
                "source": source_name,
                "url": link,
                "assets": detected,
                "published_at": published_at,
            })
        return [TableRows("news_feed", rows, "url")]
