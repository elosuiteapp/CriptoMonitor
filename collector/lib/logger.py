"""Logging estruturado e simples para o coletor.

Nível controlado por LOG_LEVEL (DEBUG | INFO | WARNING | ERROR). Saída em stdout
para funcionar bem em VPS, Railway/Fly.io ou container.
"""
from __future__ import annotations

import logging
import os
import sys

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"


def _ensure_utf8() -> None:
    """Força UTF-8 no stdout/stderr (consoles Windows usam cp1252 por padrão)."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                pass


_ensure_utf8()


def get_logger(name: str) -> logging.Logger:
    """Retorna um logger configurado uma única vez por nome."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT, _DATEFMT))
    logger.addHandler(handler)
    logger.propagate = False
    return logger
