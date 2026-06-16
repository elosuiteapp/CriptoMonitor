"""Farside — fluxo líquido de ETFs spot de BTC e ETH (institucional, diário).

A tabela diária da Farside (farside.co.uk/btc, /eth) traz o net flow por ETF e a
coluna **Total** (em US$ milhões; parênteses = saída). A linha do dia corrente vem
só com "-" até o fechamento do mercado US — por isso lemos a última linha com dado
real (algum ETF preenchido). Expomos: fluxo do dia, soma 7d e a sequência de dias
consecutivos no mesmo sentido. Dado diário → roda em cadência espaçada (carry-forward
no aggregator mantém o card entre coletas).
"""
from __future__ import annotations

import html as ihtml
import os
import re

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("etf_flows")

# A Farside é protegida por Cloudflare e dá 403 ao httpx (fingerprint TLS). Buscamos
# via relay Edge Function (Deno passa o CF), mesmo padrão do bybit-relay. Ver
# supabase/functions/farside-relay.
_RELAY = "{base}/functions/v1/farside-relay"
_COIN = {"BTC": "btc", "ETH": "eth"}
_DATE_RE = re.compile(r"\d{1,2}\s+\w{3}\s+\d{4}")


def _num(cell: str) -> float | None:
    """Converte célula da Farside em float (US$ mi). '(124.0)'→-124, '-'/''→None."""
    c = cell.strip().replace(",", "")
    if c in ("", "-"):
        return None
    neg = c.startswith("(") and c.endswith(")")
    c = c.strip("()")
    try:
        v = float(c)
    except ValueError:
        return None
    return -v if neg else v


def _parse(page: str) -> list[tuple[str, bool, float | None]]:
    """[(rótulo_dia, tem_dado_por_etf, total_musd)] em ordem cronológica."""
    out: list[tuple[str, bool, float | None]] = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        if not _DATE_RE.search(r):
            continue
        tds = [re.sub(r"<[^>]+>", "", ihtml.unescape(c)).strip()
               for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        if len(tds) < 2:
            continue
        per_etf = [_num(x) for x in tds[1:-1]]
        out.append((tds[0], any(v is not None for v in per_etf), _num(tds[-1])))
    return out


class EtfFlowsSource(BaseSource):
    name = "etf_flows"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        base = os.environ.get("SUPABASE_URL")
        if not base:
            raise RuntimeError("SUPABASE_URL necessária para o relay da Farside")
        relay = _RELAY.format(base=base)
        ts = to_iso(now_utc())
        rows: list[dict] = []
        for asset, coin in _COIN.items():
            if asset not in assets:
                continue
            try:
                r = await http.get(relay, params={"coin": coin}, timeout=25.0)
                r.raise_for_status()
                real = [(d, t) for (d, has, t) in _parse(r.text) if has and t is not None]
                if not real:
                    continue
                net_today = real[-1][1]
                flow_7d = sum(t for _, t in real[-7:])
                sign = 1 if net_today > 0 else (-1 if net_today < 0 else 0)
                streak = 0
                if sign != 0:
                    for _, t in reversed(real):
                        if (t > 0) == (sign > 0) and t != 0:
                            streak += 1
                        else:
                            break
                rows.append({
                    "asset": asset,
                    "net_flow_usd": net_today * 1e6,
                    "flow_7d_usd": flow_7d * 1e6,
                    "streak_days": streak * sign,
                    "as_of": real[-1][0],
                    "ts": ts,
                })
            except Exception as exc:  # noqa: BLE001 — best-effort por ativo
                log.warning("ETF %s indisponível: %s", asset, exc)
        return [TableRows("etf_flows", rows, "asset,ts")]
