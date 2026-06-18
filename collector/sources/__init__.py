"""Registro das fontes de dados do coletor.

`build_sources()` retorna a lista das 10 fontes na ordem de coleta. A Deribit
alimenta duas tabelas (options_oi + gamma_profile); as demais, uma cada.
"""
from __future__ import annotations

from .alternative_me import AlternativeMeSource
from .base import BaseSource, SourceResult, TableRows
from .binance import BinanceSource
from .binance_options import BinanceOptionsSource
from .bybit_options import BybitOptionsSource
from .cftc_cot import CftcCotSource
from .coinalyze import CoinalyzeSource
from .coinbase import CoinbaseSource
from .coingecko import CoinGeckoSource
from .cryptocurrency_cv import CryptocurrencyCvSource
from .defillama import DefiLlamaSource
from .deribit import DeribitSource
from .dexscreener import DexScreenerSource
from .etf_flows import EtfFlowsSource
from .hyperliquid import HyperliquidSource
from .macro_markets import MacroMarketsSource
from .market_liquidity import MarketLiquiditySource
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
        BybitOptionsSource(),  # gamma do SOL (via relay Supabase → Bybit)
        BinanceOptionsSource(),  # gamma do BNB (via relay Supabase → Binance)
        DefiLlamaSource(),
        AlternativeMeSource(),
        HyperliquidSource(),
        CoinGeckoSource(),
        DexScreenerSource(),
        CryptocurrencyCvSource(),
        MacroMarketsSource(),
        OrderbookWallsSource(),
        OptionsFlowSource(),
        EtfFlowsSource(),          # ETFs spot BTC/ETH (Farside via relay) — institucional
        MarketLiquiditySource(),   # stablecoins + TVL + DEX + fees (DefiLlama) — liquidez/direção
        CftcCotSource(),           # CFTC COT (CME BTC/ETH) — posicionamento institucional (aba Macro)
    ]
