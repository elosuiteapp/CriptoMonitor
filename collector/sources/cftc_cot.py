"""CFTC Commitment of Traders — posicionamento institucional na CME (BTC/ETH).

Relatório **semanal** (sai sexta, dados de terça) das posições por categoria nos
futuros CME cheios de Bitcoin (133741) e Ether cash-settled (146021) — os contratos
onde os **Asset Managers** (dinheiro institucional "real money") e os **Leveraged
Funds** (hedge funds) de fato aparecem (os nano/micro são varejo). API pública oficial
da CFTC (Socrata). É contexto ESTRUTURAL, não tempo real → vive na aba Macro.

Atenção de leitura: o net short dos hedge funds é, em boa parte, **basis trade**
(vendido no futuro CME + comprado no spot/ETF) — carry, não aposta de queda.
"""
from __future__ import annotations

import httpx

from lib.logger import get_logger
from lib.timeutil import now_utc, to_iso

from .base import BaseSource, TableRows

log = get_logger("cftc_cot")

_URL = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
# Contratos CME cheios (com participação institucional real): code → ativo
_CODE_ASSET = {"133741": "BTC", "146021": "ETH"}


def _i(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


class CftcCotSource(BaseSource):
    name = "cftc_cot"

    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        ts = to_iso(now_utc())
        params = {
            "$where": "cftc_contract_market_code in('133741','146021')",
            "$order": "report_date_as_yyyy_mm_dd DESC",
            "$limit": "20",
        }
        r = await http.get(_URL, params=params, timeout=25.0)
        r.raise_for_status()

        latest: dict[str, dict] = {}
        for d in r.json():
            asset = _CODE_ASSET.get(d.get("cftc_contract_market_code"))
            if not asset or asset in latest:  # 1º por ativo = relatório mais recente (desc)
                continue
            report_date = (d.get("report_date_as_yyyy_mm_dd") or "")[:10]
            if not report_date:
                continue
            am_l, am_s = _i(d.get("asset_mgr_positions_long")), _i(d.get("asset_mgr_positions_short"))
            lf_l, lf_s = _i(d.get("lev_money_positions_long")), _i(d.get("lev_money_positions_short"))
            latest[asset] = {
                "asset": asset,
                "report_date": report_date,
                "asset_mgr_long": am_l, "asset_mgr_short": am_s, "asset_mgr_net": am_l - am_s,
                "lev_money_long": lf_l, "lev_money_short": lf_s, "lev_money_net": lf_l - lf_s,
                "asset_mgr_net_chg": _i(d.get("change_in_asset_mgr_long")) - _i(d.get("change_in_asset_mgr_short")),
                "lev_money_net_chg": _i(d.get("change_in_lev_money_long")) - _i(d.get("change_in_lev_money_short")),
                "open_interest": _i(d.get("open_interest_all")),
                "ts": ts,
            }
        return [TableRows("cot_positioning", list(latest.values()), "asset,report_date")]
