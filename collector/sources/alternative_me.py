"""Alternative.me — Fear & Greed Index (PRD fonte #6).

Termômetro de sentimento macro, global (não por ativo). Sem chave.
"""
from __future__ import annotations

import httpx

from lib.timeutil import sec_to_iso

from .base import BaseSource, TableRows

_URL = "https://api.alternative.me/fng/?limit=1"


class AlternativeMeSource(BaseSource):
    name = "alternative_me"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        resp = await http.get(_URL, timeout=15.0)
        resp.raise_for_status()
        item = resp.json()["data"][0]
        row = {
            "fng_value": int(item["value"]),
            "classification": item.get("value_classification"),
            "ts": sec_to_iso(int(item["timestamp"])),
        }
        return [TableRows("sentiment", [row], "ts")]
