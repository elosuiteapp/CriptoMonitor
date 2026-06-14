"""Contrato base das fontes de dados.

Cada fonte herda de `BaseSource` e implementa `fetch()`, retornando uma lista de
`TableRows` (uma fonte pode alimentar mais de uma tabela — ex: Deribit grava
`options_oi` e `gamma_profile`). O método `collect()` envelopa `fetch()` com
medição de latência e captura de erro: uma fonte que falha NÃO derruba o ciclo
(PRD §11) — ela apenas retorna `ok=False` e o painel degrada graciosamente.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from time import perf_counter

import httpx

from lib.logger import get_logger

log = get_logger("source")


@dataclass
class TableRows:
    """Linhas normalizadas prontas para upsert em uma tabela."""
    table: str
    rows: list[dict]
    on_conflict: str


@dataclass
class SourceResult:
    """Resultado de um ciclo de coleta de uma fonte."""
    source: str
    outputs: list[TableRows]
    ok: bool
    error: str | None = None
    latency_ms: float = 0.0

    @property
    def rowcount(self) -> int:
        return sum(len(o.rows) for o in self.outputs)


class BaseSource(ABC):
    name: str = "base"
    requires_key: bool = False  # informativo: fonte precisa de chave de API?

    @abstractmethod
    async def fetch(self, http: httpx.AsyncClient, assets: list[str]) -> list[TableRows]:
        """Coleta e normaliza os dados. Deve levantar exceção em caso de falha."""
        raise NotImplementedError

    async def collect(self, http: httpx.AsyncClient, assets: list[str]) -> SourceResult:
        t0 = perf_counter()
        try:
            outputs = await self.fetch(http, assets)
            latency = (perf_counter() - t0) * 1000.0
            result = SourceResult(self.name, outputs, ok=True, latency_ms=latency)
            log.info("✓ %-16s %3d linha(s) em %6.0f ms", self.name, result.rowcount, latency)
            return result
        except Exception as exc:  # noqa: BLE001 — isolar falha por fonte é intencional
            latency = (perf_counter() - t0) * 1000.0
            log.warning("✗ %-16s indisponível (%.0f ms): %s", self.name, latency, exc)
            return SourceResult(self.name, [], ok=False, error=str(exc), latency_ms=latency)
