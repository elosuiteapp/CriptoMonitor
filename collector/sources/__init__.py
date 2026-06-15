"""Registro das fontes de dados do coletor.

`build_sources()` retorna a lista das 10 fontes na ordem de coleta. A Deribit
alimenta duas tabelas (options_oi + gamma_profile); as demais, uma cada.
"""
from __future__ import annotations

from .alternative_me import AlternativeMeSource
from .base import BaseSource, SourceResult, TableRows
from .binance import BinanceSource
from .coinalyze import CoinalyzeSource
from .coinbase import CoinbaseSource
from .coingecko import CoinGeckoSource
from .cryptocurrency_cv import CryptocurrencyCvSource
from .defillama import DefiLlamaSource
from .deribit import DeribitSource
from .dexscreener import DexScreenerSource
from .hyperliquid import HyperliquidSource
from .macro_markets import MacroMarketsSource
from .okx import OkxSource
from .options_flow import OptionsFlowSource
from .orderbook_walls import OrderbookWallsSource

__all__ = ["BaseSource", "SourceResult", "TableRows", "build_sources"]


def build_sources() -> list[BaseSource]:
    return [
        BinanceSource(),
        OkxSource(),  # Bybit fica de fora: geo-bloqueada (403) na região do Railway
        CoinbaseSource(),
        CoinalyzeSource(),
        DeribitSource(),
        DefiLlamaSource(),
        AlternativeMeSource(),
        HyperliquidSource(),
        CoinGeckoSource(),
        DexScreenerSource(),
        CryptocurrencyCvSource(),
        MacroMarketsSource(),
        OrderbookWallsSource(),
        OptionsFlowSource(),
    ]
