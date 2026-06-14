"""Normalização de tempo — tudo em UTC (PRD §8.1).

As fontes retornam timestamps em milissegundos, segundos ou ISO. O coletor
converte tudo para datetime UTC e para string ISO 8601 antes de gravar, para
que o banco e a IA nunca enxerguem a heterogeneidade das fontes.
"""
from __future__ import annotations

from datetime import datetime, timezone


def now_utc() -> datetime:
    """Instante atual em UTC (timezone-aware)."""
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    """datetime → string ISO 8601 em UTC. Assume UTC se vier ingênuo."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def ms_to_iso(ms: float) -> str:
    """Timestamp em milissegundos (epoch) → ISO 8601 UTC."""
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()


def sec_to_iso(seconds: float) -> str:
    """Timestamp em segundos (epoch) → ISO 8601 UTC."""
    return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
