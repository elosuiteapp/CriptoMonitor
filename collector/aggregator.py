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
from datetime import timedelta
from pathlib import Path

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

# Garante que `collector/` esteja no path quando rodado como script
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.logger import get_logger          # noqa: E402
from lib.supabase_client import get_supabase, upsert  # noqa: E402
from lib.timeutil import now_utc, to_iso    # noqa: E402
from sources import SourceResult, build_sources  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
log = get_logger("aggregator")

_USER_AGENT = "CryptoMonitor/1.0 (+collector)"

# Tabelas de SNAPSHOT (ts = instante da coleta): o ts é reescrito para o início do
# bucket de 5 min, de modo que ciclos extras (restart do worker, que dispara um ciclo
# imediato fora da grade, ou execução concorrente) no mesmo bucket colapsem numa ÚNICA
# linha via o upsert (…,ts) — em vez de gravar linhas redundantes com ts de microssegundo
# sempre distinto. Ficam de fora as tabelas com ts de EVENTO (sentiment diário,
# liquidations e news com tempo próprio) e o options_flow, que já ancora seu ts no bucket.
_GRID_TS_TABLES = frozenset({
    "prices_cex", "derivatives", "gamma_profile", "options_oi", "volatility_index",
    "onchain_perps", "dex_liquidity", "defi_health", "orderbook_walls",
    "macro", "macro_assets", "macro_correlations", "market_snapshot",
    "etf_flows", "market_liquidity",
})
_GRID_MINUTES = 5


def _assets() -> list[str]:
    # Conjunto-base SEMPRE coletado, definido no código (adicionar moeda = editar aqui
    # + push). A env ASSETS pode ADICIONAR ativos extras, mas nunca remove os do base —
    # assim o BNB (e o core) entram automaticamente, independente de config no host.
    base = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX",
            "LINK", "SUI", "TON", "POL", "DOT", "LTC",
            "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE"]
    extra = [a.strip().upper() for a in os.getenv("ASSETS", "").split(",") if a.strip()]
    return list(dict.fromkeys(base + extra))


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


def build_snapshots(
    results: list[SourceResult], assets: list[str], ts: str,
    macro_fallback: dict | None = None, deriv_fallback: dict[str, dict] | None = None,
    etf_fallback: dict[str, dict] | None = None, liquidity_fallback: dict | None = None,
) -> list[dict]:
    """Consolida a visão por ativo num único JSONB por ativo."""
    deriv_fb = deriv_fallback or {}
    etf_fb = etf_fallback or {}
    prices: dict[str, list[dict]] = {}
    for row in _rows_of(results, "prices_cex"):
        prices.setdefault(row["asset"], []).append(row)

    derivatives = _index_by_asset(results, "derivatives")
    gamma = _index_by_asset(results, "gamma_profile")
    onchain = _index_by_asset(results, "onchain_perps")
    dex = _index_by_asset(results, "dex_liquidity")
    etf = _index_by_asset(results, "etf_flows")

    defi_rows = _rows_of(results, "defi_health")
    defi_by_chain = {r["chain"]: r for r in defi_rows}
    chain_of = {"ETH": "ethereum", "SOL": "solana", "BNB": "bsc"}

    sentiment_rows = _rows_of(results, "sentiment")
    sentiment = sentiment_rows[0] if sentiment_rows else None
    macro_rows = _rows_of(results, "macro")
    macro = macro_rows[0] if macro_rows else macro_fallback
    liq_rows = _rows_of(results, "market_liquidity")
    liquidity = liq_rows[0] if liq_rows else liquidity_fallback
    news = _rows_of(results, "news_feed")

    snapshots: list[dict] = []
    for asset in assets:
        price_map = {p["exchange"]: p for p in prices.get(asset, [])}
        # Prêmio Coinbase: demanda institucional (Coinbase/US) × varejo/global
        # (Binance) — §8.6.3. >0 instituições comprando; <0 varejo pressiona.
        cb_price = (price_map.get("coinbase") or {}).get("price")
        bn_price = (price_map.get("binance") or {}).get("price")
        coinbase_premium = ((cb_price - bn_price) / bn_price) if (cb_price and bn_price) else None
        payload: dict = {
            "asset": asset,
            "generated_at": ts,
            "price": price_map or None,
            "coinbase_premium": coinbase_premium,
            # Coinalyze falhou neste ciclo? usa o último derivativo recente (< 30 min)
            # p/ a cockpit não piscar 'indisponível' num blip.
            "derivatives": derivatives.get(asset) or deriv_fb.get(asset),
            "gamma": gamma.get(asset),
            "onchain_perps": onchain.get(asset),
            "dex_liquidity": dex.get(asset),
            "defi_health": defi_by_chain.get(chain_of.get(asset, "")),
            "sentiment": sentiment,
            "macro": macro,
            # Camada institucional: ETFs spot (BTC/ETH) por ativo; liquidez de mercado
            # (stablecoins + TVL) é market-wide (igual ao macro).
            "etf_flows": etf.get(asset) or etf_fb.get(asset),
            "liquidity": liquidity,
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

    def _active_sources(self, minute: int, startup: bool = False):
        """Filtra as fontes do ciclo (espaça a CoinGecko)."""
        active = []
        for s in self.sources:
            if s.name == "coingecko" and (minute % self.macro_interval) != 0:
                continue
            if s.name == "macro_markets" and (minute % 30) != 0:  # macro/correlações: 30 min
                continue
            # Camada institucional (dado diário/lento): a cada 15 min, carry-forward preenche
            # os ciclos intermediários. Mantém o coletor leve (ETFs/stablecoins são páginas
            # grandes; não vale puxar a cada 5 min).
            if s.name in ("etf_flows", "market_liquidity") and (minute % 15) != 0:
                continue
            # No ciclo imediato de startup (todo restart dispara um, fora da grade) pulamos
            # a Coinalyze: ela cobra a cota por símbolo e um burst extra fora de hora estoura
            # o 429. Roda no próximo ciclo agendado.
            if startup and s.name == "coinalyze":
                continue
            active.append(s)
        return active

    def _latest_macro(self) -> dict | None:
        """Último macro gravado (carry-forward entre coletas do CoinGecko)."""
        try:
            res = (
                get_supabase().table("macro")
                .select("btc_dominance, total_mcap, ts")
                .order("ts", desc=True).limit(1).execute()
            )
            return res.data[0] if res.data else None
        except Exception as exc:  # noqa: BLE001
            log.warning("falha ao carregar macro anterior: %s", exc)
            return None

    def _latest_derivatives(self) -> dict[str, dict]:
        """Último derivativo por ativo, só se RECENTE (< 30 min). Carry-forward p/ a
        cockpit não piscar 'indisponível' num blip da Coinalyze — mas sem mascarar uma
        queda longa (aí o card fica indisponível mesmo, o que é honesto)."""
        try:
            cutoff = to_iso(now_utc() - timedelta(minutes=30))
            res = (
                get_supabase().table("derivatives")
                .select("asset, open_interest, funding_rate, long_short_ratio, "
                        "liq_long_usd, liq_short_usd, cvd, ts")
                .gte("ts", cutoff).order("ts", desc=True).limit(200).execute()
            )
            out: dict[str, dict] = {}
            for row in res.data or []:
                a = row.get("asset")
                if a and a not in out:
                    out[a] = row
            return out
        except Exception as exc:  # noqa: BLE001
            log.warning("falha ao carregar derivativos anteriores: %s", exc)
            return {}

    def _latest_by_asset(self, table: str, columns: str, max_age_min: int = 360) -> dict[str, dict]:
        """Carry-forward por ativo de uma tabela institucional (último valor recente)."""
        try:
            cutoff = to_iso(now_utc() - timedelta(minutes=max_age_min))
            res = (
                get_supabase().table(table).select(columns)
                .gte("ts", cutoff).order("ts", desc=True).limit(200).execute()
            )
            out: dict[str, dict] = {}
            for row in res.data or []:
                a = row.get("asset")
                if a and a not in out:
                    out[a] = row
            return out
        except Exception as exc:  # noqa: BLE001
            log.warning("falha ao carregar %s anterior: %s", table, exc)
            return {}

    def _latest_row(self, table: str, columns: str, max_age_min: int = 720) -> dict | None:
        """Carry-forward de uma tabela market-wide (última linha recente)."""
        try:
            cutoff = to_iso(now_utc() - timedelta(minutes=max_age_min))
            res = (
                get_supabase().table(table).select(columns)
                .gte("ts", cutoff).order("ts", desc=True).limit(1).execute()
            )
            return res.data[0] if res.data else None
        except Exception as exc:  # noqa: BLE001
            log.warning("falha ao carregar %s anterior: %s", table, exc)
            return None

    async def run_cycle(self, startup: bool = False) -> list[SourceResult]:
        now = now_utc()
        # ts do ciclo ancorado à grade de 5 min (…:00,:05,…): ciclos extras (restart do
        # worker / concorrência) no mesmo bucket viram a MESMA linha no upsert, não duplicam.
        grid = now.replace(second=0, microsecond=0)
        grid = grid.replace(minute=(grid.minute // _GRID_MINUTES) * _GRID_MINUTES)
        ts = to_iso(grid)
        sources = self._active_sources(now.minute, startup=startup)
        log.info("── ciclo %s · %d fonte(s) · ativos=%s", ts, len(sources), ",".join(self.assets))

        async with httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}) as http:
            results = await asyncio.gather(*(s.collect(http, self.assets) for s in sources))

        # Upsert das tabelas de coleta (isolado por tabela: uma falha não aborta o ciclo)
        written = 0
        for r in results:
            if not r.ok:
                continue
            for output in r.outputs:
                # Snapshot: ancora o ts da coleta no bucket de 5 min → dedup via upsert.
                if output.table in _GRID_TS_TABLES:
                    for row in output.rows:
                        if row.get("ts") is not None:
                            row["ts"] = ts
                try:
                    written += upsert(output.table, output.rows, output.on_conflict)
                except Exception as exc:  # noqa: BLE001
                    log.warning("falha no upsert de %s (%d linhas): %s", output.table, len(output.rows), exc)

        # Macro (CoinGecko) roda a cada 15 min; nos demais ciclos carregamos o
        # último valor do banco para o card não "piscar" no snapshot.
        macro_fallback = None
        if not any(o.table == "macro" for r in results if r.ok for o in r.outputs):
            macro_fallback = self._latest_macro()

        # Derivativos (Coinalyze): se faltou ativo neste ciclo (falha/429/skip de startup),
        # busca o último recente p/ a cockpit não piscar 'indisponível'.
        deriv_fallback = None
        if len(_index_by_asset(results, "derivatives")) < len(self.assets):
            deriv_fallback = self._latest_derivatives()

        # Camada institucional (roda a cada 15 min): nos ciclos em que não rodou, carrega
        # o último valor recente p/ o card não piscar. ETFs/CME por ativo, liquidez market-wide.
        etf_fallback = None
        if not _index_by_asset(results, "etf_flows"):
            etf_fallback = self._latest_by_asset(
                "etf_flows", "asset,net_flow_usd,flow_7d_usd,streak_days,as_of,ts")
        liquidity_fallback = None
        if not _rows_of(results, "market_liquidity"):
            liquidity_fallback = self._latest_row(
                "market_liquidity",
                "total_stablecoin_usd,stablecoin_chg_7d_usd,stablecoin_chg_7d_pct,total_tvl_usd,"
                "dex_volume_24h,dex_change_7d,fees_24h,fees_change_7d,ts")

        # Recalcular e gravar o snapshot consolidado (isolado: nunca derruba o ciclo)
        snapshots: list[dict] = []
        try:
            snapshots = build_snapshots(results, self.assets, ts, macro_fallback, deriv_fallback,
                                        etf_fallback, liquidity_fallback)
            upsert("market_snapshot", snapshots, "asset,ts")
        except Exception as exc:  # noqa: BLE001
            log.warning("falha ao montar/gravar market_snapshot: %s", exc)

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
    try:
        # Primeiro ciclo imediato (nunca pode derrubar o worker). startup=True pula a
        # Coinalyze p/ o restart não estourar o rate limit dela fora da grade.
        await collector.run_cycle(startup=True)
    except Exception as exc:  # noqa: BLE001
        log.exception("primeiro ciclo falhou (worker segue rodando): %s", exc)
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
