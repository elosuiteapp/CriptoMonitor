"""Orquestrador do coletor (PRD §4).

Ciclo de 5 min (CronTrigger alinhado a :00,:05,…) que:
  1. roda as 10 fontes em paralelo (asyncio), com falha isolada por fonte;
  2. faz upsert das linhas normalizadas no Supabase;
  3. recalcula o `market_snapshot` consolidado por ativo (a visão única que a IA lê).

CoinGecko (macro) roda em cadência mais espaçada (MACRO_INTERVAL_MINUTES) para
respeitar o rate limit do free tier.

Uso:
    python aggregator.py            # roda o scheduler (contínuo)
    python aggregator.py --once     # roda um único ciclo e sai (debug)
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

# Garante que `collector/` esteja no path quando rodado como script
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.logger import get_logger          # noqa: E402
from lib.supabase_client import upsert      # noqa: E402
from lib.timeutil import now_utc, to_iso    # noqa: E402
from sources import SourceResult, build_sources  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
log = get_logger("aggregator")

_USER_AGENT = "CryptoMonitor/1.0 (+collector)"


def _assets() -> list[str]:
    raw = os.getenv("ASSETS", "BTC,ETH,SOL")
    return [a.strip().upper() for a in raw.split(",") if a.strip()]


# ─── Construção do market_snapshot ───────────────────────────────────────────
def _index_by_asset(results: list[SourceResult], table: str) -> dict[str, dict]:
    """Mapeia asset → primeira linha daquela tabela (entre as fontes ok)."""
    out: dict[str, dict] = {}
    for r in results:
        if not r.ok:
            continue
        for output in r.outputs:
            if output.table != table:
                continue
            for row in output.rows:
                asset = row.get("asset")
                if asset and asset not in out:
                    out[asset] = row
    return out


def _rows_of(results: list[SourceResult], table: str) -> list[dict]:
    return [
        row
        for r in results if r.ok
        for output in r.outputs if output.table == table
        for row in output.rows
    ]


def build_snapshots(results: list[SourceResult], assets: list[str], ts: str) -> list[dict]:
    """Consolida a visão por ativo num único JSONB por ativo."""
    prices: dict[str, list[dict]] = {}
    for row in _rows_of(results, "prices_cex"):
        prices.setdefault(row["asset"], []).append(row)

    derivatives = _index_by_asset(results, "derivatives")
    gamma = _index_by_asset(results, "gamma_profile")
    onchain = _index_by_asset(results, "onchain_perps")
    dex = _index_by_asset(results, "dex_liquidity")

    defi_rows = _rows_of(results, "defi_health")
    defi_by_chain = {r["chain"]: r for r in defi_rows}
    chain_of = {"ETH": "ethereum", "SOL": "solana"}

    sentiment_rows = _rows_of(results, "sentiment")
    sentiment = sentiment_rows[0] if sentiment_rows else None
    macro_rows = _rows_of(results, "macro")
    macro = macro_rows[0] if macro_rows else None
    news = _rows_of(results, "news_feed")

    snapshots: list[dict] = []
    for asset in assets:
        payload: dict = {
            "asset": asset,
            "generated_at": ts,
            "price": {p["exchange"]: p for p in prices.get(asset, [])} or None,
            "derivatives": derivatives.get(asset),
            "gamma": gamma.get(asset),
            "onchain_perps": onchain.get(asset),
            "dex_liquidity": dex.get(asset),
            "defi_health": defi_by_chain.get(chain_of.get(asset, "")),
            "sentiment": sentiment,
            "macro": macro,
            "news": [n for n in news if asset in (n.get("assets") or [])][:5],
        }
        snapshots.append({"asset": asset, "payload": payload, "ts": ts})
    return snapshots


# ─── Ciclo de coleta ─────────────────────────────────────────────────────────
class Collector:
    def __init__(self) -> None:
        self.assets = _assets()
        self.sources = build_sources()
        self.macro_interval = int(os.getenv("MACRO_INTERVAL_MINUTES", "15"))
        self._last_macro_minute: int | None = None

    def _active_sources(self, minute: int):
        """Filtra as fontes do ciclo (espaça a CoinGecko)."""
        active = []
        for s in self.sources:
            if s.name == "coingecko" and (minute % self.macro_interval) != 0:
                continue
            active.append(s)
        return active

    async def run_cycle(self) -> list[SourceResult]:
        now = now_utc()
        ts = to_iso(now.replace(second=0, microsecond=0))
        sources = self._active_sources(now.minute)
        log.info("── ciclo %s · %d fonte(s) · ativos=%s", ts, len(sources), ",".join(self.assets))

        async with httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}) as http:
            results = await asyncio.gather(*(s.collect(http, self.assets) for s in sources))

        # Upsert das tabelas de coleta
        written = 0
        for r in results:
            if not r.ok:
                continue
            for output in r.outputs:
                written += upsert(output.table, output.rows, output.on_conflict)

        # Recalcular e gravar o snapshot consolidado
        snapshots = build_snapshots(results, self.assets, ts)
        upsert("market_snapshot", snapshots, "asset,ts")

        ok = sum(1 for r in results if r.ok)
        log.info("── ciclo concluído: %d/%d fontes OK · %d linhas · %d snapshot(s)",
                 ok, len(results), written, len(snapshots))
        return results


async def _main_async(once: bool) -> None:
    collector = Collector()
    if once:
        await collector.run_cycle()
        return

    scheduler = AsyncIOScheduler(timezone="UTC")
    interval = int(os.getenv("COLLECT_INTERVAL_MINUTES", "5"))
    scheduler.add_job(collector.run_cycle, CronTrigger(minute=f"*/{interval}"),
                      max_instances=1, coalesce=True)
    scheduler.start()
    log.info("scheduler iniciado · ciclo a cada %d min · Ctrl+C para sair", interval)
    await collector.run_cycle()  # primeiro ciclo imediato
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        log.info("encerrando…")


def main() -> None:
    parser = argparse.ArgumentParser(description="Coletor Crypto Monitor")
    parser.add_argument("--once", action="store_true", help="roda um único ciclo e sai")
    args = parser.parse_args()
    asyncio.run(_main_async(args.once))


if __name__ == "__main__":
    main()
