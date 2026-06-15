"""Smoke test das 10 fontes (PRD §9, critério de pronto da Fase 1/2).

Roda cada fonte UMA vez, sem gravar no banco, e imprime status, latência e uma
amostra do dado coletado. Não exige Supabase; fontes que precisam de chave
aparecem como "indisponível" se a chave não estiver no .env.

    python test_sources.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sources import build_sources  # noqa: E402


def _sample(outputs) -> str:
    for output in outputs:
        if output.rows:
            row = output.rows[0]
            compact = {k: row[k] for k in list(row)[:4]}
            return f"{output.table}: {compact}"
    return "(sem linhas)"


async def main() -> int:
    assets = [a.strip().upper() for a in os.getenv("ASSETS", "BTC,ETH,SOL,BNB").split(",") if a.strip()]
    sources = build_sources()

    print(f"\n  Smoke test · ativos={','.join(assets)} · {len(sources)} fontes\n")
    print(f"  {'fonte':<18}{'status':<14}{'latência':>10}{'linhas':>8}   amostra")
    print("  " + "-" * 92)

    ok_count = 0
    async with httpx.AsyncClient(headers={"User-Agent": "CryptoMonitor/1.0 (smoke-test)"}) as http:
        for source in sources:
            result = await source.collect(http, assets)
            status = "OK" if result.ok else "INDISPONÍVEL"
            mark = "✓" if result.ok else "✗"
            if result.ok:
                ok_count += 1
            detail = _sample(result.outputs) if result.ok else (result.error or "")
            print(f"  {mark} {source.name:<16}{status:<14}{result.latency_ms:>8.0f}ms"
                  f"{result.rowcount:>8}   {detail[:60]}")

    print("  " + "-" * 92)
    print(f"\n  Resultado: {ok_count}/{len(sources)} fontes responderam OK\n")
    return 0 if ok_count == len(sources) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
