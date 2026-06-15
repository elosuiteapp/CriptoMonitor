"""Feed de notícias (PRD §3 #10 e §8.6.4).

O endpoint "Cryptocurrency.cv" do PRD não estava acessível. Usamos feeds RSS
públicos e gratuitos — por padrão em **português** (idioma atual do sistema),
combinando algumas fontes brasileiras para boa cobertura por ativo. Quando o
sistema ganhar seletor de idioma, basta trocar a lista de feeds por idioma
(ou definir `NEWS_FEED_URL`, aceita múltiplas URLs separadas por vírgula).
"""
from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("news")
_UA = "Mozilla/5.0 (compatible; CryptoMonitor/1.0)"

# Feeds em português (idioma atual). Configurável por NEWS_FEED_URL (csv).
_DEFAULT_FEEDS = [
    "https://portaldobitcoin.uol.com.br/feed/",
    "https://www.criptofacil.com/feed/",
    "https://livecoins.com.br/feed/",
]

# Limites de palavra (\b) evitam falsos positivos (ex: "sol" em "solução").
_ASSET_PATTERNS = {
    "BTC": re.compile(r"\b(btc|bitcoin)\b"),
    "ETH": re.compile(r"\b(eth|ether|ethereum)\b"),
    "SOL": re.compile(r"\b(sol|solana)\b"),
    "BNB": re.compile(r"\b(bnb|binance coin|binance smart chain|bsc)\b"),
}


def _feeds() -> list[str]:
    env = os.getenv("NEWS_FEED_URL")
    if env and env.strip():
        return [u.strip() for u in env.split(",") if u.strip()]
    return _DEFAULT_FEEDS


def _detect_assets(text: str) -> list[str]:
    low = text.lower()
    return [sym for sym, pat in _ASSET_PATTERNS.items() if pat.search(low)]


class CryptocurrencyCvSource(BaseSource):
    name = "news"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        now_iso = to_iso(now_utc())
        by_url: dict[str, dict] = {}

        for url in _feeds():
            try:
                resp = await http.get(url, headers={"User-Agent": _UA}, timeout=20.0)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                channel = root.find("channel")
                if channel is None:
                    continue
                source_name = (channel.findtext("title") or "Notícias").strip()

                for item in channel.findall("item")[:25]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    if not title or not link or link in by_url:
                        continue

                    published_at = now_iso
                    pub = item.findtext("pubDate")
                    if pub:
                        try:
                            published_at = to_iso(parsedate_to_datetime(pub))
                        except (TypeError, ValueError):
                            pass

                    categories = " ".join(c.text or "" for c in item.findall("category"))
                    description = item.findtext("description") or ""
                    by_url[link] = {
                        "title": title[:500],
                        "source": source_name,
                        "url": link,
                        "assets": _detect_assets(f"{title} {categories} {description}"),
                        "published_at": published_at,
                    }
            except Exception as exc:  # noqa: BLE001 — um feed fora não derruba os demais
                log.warning("feed de notícias falhou (%s): %s", url, exc)

        return [TableRows("news_feed", list(by_url.values()), "url")]
