"""Cliente Supabase do coletor.

Usa a SERVICE_ROLE key — ela tem BYPASSRLS, então os upserts do coletor nunca
são bloqueados pelas policies de gating (que valem para os usuários no front).
NUNCA usar esta key no frontend.
"""
from __future__ import annotations

import os

from supabase import Client, create_client

from .logger import get_logger

log = get_logger("supabase")

_client: Client | None = None


def get_supabase() -> Client:
    """Singleton do cliente Supabase (service_role)."""
    global _client
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env"
        )
    _client = create_client(url, key)
    return _client


def upsert(table: str, rows: list[dict], on_conflict: str) -> int:
    """Upsert idempotente de uma lista de linhas. Retorna a quantidade gravada.

    Não levanta exceção se `rows` estiver vazio (fonte indisponível no ciclo).
    """
    if not rows:
        return 0
    client = get_supabase()
    client.table(table).upsert(rows, on_conflict=on_conflict).execute()
    log.debug("upsert %s: %d linha(s)", table, len(rows))
    return len(rows)
