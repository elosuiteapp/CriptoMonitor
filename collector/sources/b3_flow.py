"""Fluxo de investimento na B3 por tipo de investidor.

Estrangeiro / Institucional / Pessoa física / Inst. financeira / Outros — saldo
diário (R$ milhões), market-wide. Fonte: dadosdemercado.com.br/fluxo (tabela HTML;
não há API grátis, então fazemos parse leve da página). É contexto ESTRUTURAL do
fluxo de capital — o estrangeiro costuma liderar o IBOV. Robusto a falha.
"""
from __future__ import annotations

import re

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("b3_flow")
_URL = "https://www.dadosdemercado.com.br/fluxo"
_UA = "Mozilla/5.0 (compatible; OrbeView/1.0)"


def _num(s: str) -> float | None:
    t = re.sub(r"[^\d.,-]", "", s.replace("mi", "").replace("−", "-")).strip()
    if not t:
        return None
    t = t.replace(".", "").replace(",", ".")  # pt-BR: . milhar, , decimal
    try:
        return float(t)
    except ValueError:
        return None


class B3FlowSource(BaseSource):
    name = "b3_flow"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        r = await http.get(_URL, headers={"User-Agent": _UA}, timeout=25.0)
        r.raise_for_status()
        m = re.search(r"<table[\s\S]*?</table>", r.text, re.I)
        if not m:
            log.warning("b3_flow: tabela não encontrada")
            return []
        rows: list[dict] = []
        for tr in re.findall(r"<tr[\s\S]*?</tr>", m.group(0), re.I):
            cells = [re.sub(r"<[^>]+>", " ", c).replace("&nbsp;", " ").strip() for c in re.findall(r"<td[\s\S]*?</td>", tr, re.I)]
            if len(cells) < 6:
                continue
            dm = re.search(r"(\d{2})/(\d{2})/(\d{4})", cells[0])
            if not dm:
                continue
            rows.append({
                "date": f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}",
                "foreign_mi": _num(cells[1]),
                "institutional_mi": _num(cells[2]),
                "retail_mi": _num(cells[3]),
                "financial_mi": _num(cells[4]),
                "other_mi": _num(cells[5]),
                "ts": ts,
            })
        return [TableRows("b3_investor_flow", rows[:40], "date")]
