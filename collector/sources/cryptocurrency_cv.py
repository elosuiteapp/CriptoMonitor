"""Feed de notícias (PRD §3 #10 e §8.6.4).

O endpoint "Cryptocurrency.cv" do PRD não estava acessível. Usamos feeds RSS
públicos e gratuitos, **por idioma**: fontes brasileiras (PT) e fontes globais
de cripto (EN). Cada notícia é marcada com o idioma da fonte (coluna `lang`) e o
front (NewsBlock) filtra pelo idioma selecionado — o link sempre abre a matéria
na fonte original (ver memory [[i18n-plan]]).

Override por env (csv de URLs): `NEWS_FEED_URL` (PT) e `NEWS_FEED_URL_EN` (EN).
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

# Feeds por MERCADO e idioma. Cada notícia é isolada por `market` (cripto/B3/forex)
# para o cockpit de cada módulo mostrar só o que é dele. Cripto: PT (BR) + EN (global);
# B3: PT (mercado brasileiro); Forex: EN (mercado global de câmbio).
# Override do CRIPTO por env: NEWS_FEED_URL (PT) e NEWS_FEED_URL_EN (EN), csv de URLs.
_FEEDS: dict[str, dict[str, list[str]]] = {
    "crypto": {
        "pt": [
            "https://portaldobitcoin.uol.com.br/feed/",
            "https://www.criptofacil.com/feed/",
            "https://livecoins.com.br/feed/",
        ],
        "en": [
            "https://cointelegraph.com/rss",
            "https://www.coindesk.com/arc/outboundfeeds/rss?outputType=xml",
            "https://decrypt.co/feed",
        ],
    },
    "b3": {
        "pt": [
            "https://www.infomoney.com.br/feed/",
            "https://www.moneytimes.com.br/feed/",
            "https://www.suno.com.br/noticias/feed/",
        ],
    },
    "forex": {
        "en": [
            "https://www.actionforex.com/feed/",
            "https://www.babypips.com/feed.rss",
            "https://www.investing.com/rss/news_1.rss",
        ],
    },
}

# Limites de palavra (\b) evitam falsos positivos (ex: "sol" em "solução").
_ASSET_PATTERNS = {
    "BTC": re.compile(r"\b(btc|bitcoin)\b"),
    "ETH": re.compile(r"\b(eth|ether|ethereum)\b"),
    "SOL": re.compile(r"\b(sol|solana)\b"),
    "BNB": re.compile(r"\b(bnb|binance coin|binance smart chain|bsc)\b"),
    "XRP": re.compile(r"\b(xrp|ripple)\b"),
    "DOGE": re.compile(r"\b(doge|dogecoin)\b"),
    "ADA": re.compile(r"\b(ada|cardano)\b"),
    "AVAX": re.compile(r"\b(avax|avalanche)\b"),
    "LINK": re.compile(r"\b(link|chainlink)\b"),
    "SUI": re.compile(r"\b(sui)\b"),
    "TON": re.compile(r"\b(ton|toncoin)\b"),
    "POL": re.compile(r"\b(pol|polygon|matic)\b"),
    "DOT": re.compile(r"\b(dot|polkadot)\b"),
    "LTC": re.compile(r"\b(ltc|litecoin)\b"),
    "AAVE": re.compile(r"\b(aave)\b"),
    "UNI": re.compile(r"\b(uni|uniswap)\b"),
    "LDO": re.compile(r"\b(ldo|lido)\b"),
    "ARB": re.compile(r"\b(arb|arbitrum)\b"),
    "ATOM": re.compile(r"\b(atom|cosmos)\b"),
    "PEPE": re.compile(r"\b(pepe)\b"),
}


def _feeds() -> dict[str, dict[str, list[str]]]:
    out = {mkt: {lang: list(urls) for lang, urls in langs.items()} for mkt, langs in _FEEDS.items()}
    pt = os.getenv("NEWS_FEED_URL")  # override só do cripto (compatibilidade)
    if pt and pt.strip():
        out["crypto"]["pt"] = [u.strip() for u in pt.split(",") if u.strip()]
    en = os.getenv("NEWS_FEED_URL_EN")
    if en and en.strip():
        out["crypto"]["en"] = [u.strip() for u in en.split(",") if u.strip()]
    return out


def _detect_assets(text: str) -> list[str]:
    low = text.lower()
    return [sym for sym, pat in _ASSET_PATTERNS.items() if pat.search(low)]


class CryptocurrencyCvSource(BaseSource):
    name = "news"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        now_iso = to_iso(now_utc())
        by_url: dict[str, dict] = {}

        for market, by_lang in _feeds().items():
          for lang, urls in by_lang.items():
            for url in urls:
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
                            "lang": lang,
                            "market": market,
                            # detecção de ativo é só do cripto; B3/forex usam o `market`
                            "assets": _detect_assets(f"{title} {categories} {description}") if market == "crypto" else [],
                            "published_at": published_at,
                        }
                except Exception as exc:  # noqa: BLE001 — um feed fora não derruba os demais
                    log.warning("feed de notícias falhou (%s/%s): %s", lang, url, exc)

        return [TableRows("news_feed", list(by_url.values()), "url")]
