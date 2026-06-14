"""Testes do módulo Gamma (PRD §8.5).

Cobrem: fórmula fechada de gamma BS, parsing de instrumento Deribit, localização
do Zero Gamma por interpolação, Max Pain de um book artificial e os filtros de
higiene da função de orquestração.
"""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from lib import gamma


# ─── Black-Scholes gamma ─────────────────────────────────────────────────────
def test_bs_gamma_atm_valor_conhecido():
    # ATM: S=K=100, T=1, σ=0.2  →  d1=0.1, φ(0.1)=0.396953, gamma=0.0198477
    g = gamma.black_scholes_gamma(100.0, 100.0, 1.0, 0.2)
    assert float(g) == pytest.approx(0.0198477, abs=1e-6)


def test_bs_gamma_positivo_e_finito():
    g = gamma.black_scholes_gamma(
        np.array([100.0, 100.0, 100.0]),
        np.array([80.0, 100.0, 120.0]),
        np.array([0.5, 0.5, 0.5]),
        np.array([0.6, 0.6, 0.6]),
    )
    assert np.all(g >= 0)
    assert np.all(np.isfinite(g))


def test_bs_gamma_broadcasting_matriz():
    spots = np.array([90.0, 100.0, 110.0])[:, None]   # (3,1)
    strikes = np.array([95.0, 105.0])[None, :]         # (1,2)
    T = np.array([0.5, 0.5])[None, :]
    sig = np.array([0.5, 0.5])[None, :]
    g = gamma.black_scholes_gamma(spots, strikes, T, sig)
    assert g.shape == (3, 2)


# ─── Parsing de instrumento Deribit ──────────────────────────────────────────
def test_parse_instrument_call():
    p = gamma.parse_instrument_name("BTC-27JUN26-70000-C")
    assert p["asset"] == "BTC"
    assert p["strike"] == 70000.0
    assert p["type"] == "call"
    assert p["expiry"] == datetime(2026, 6, 27, 8, 0, tzinfo=timezone.utc)


def test_parse_instrument_put_e_invalido():
    assert gamma.parse_instrument_name("ETH-9JAN26-3200-P")["type"] == "put"
    assert gamma.parse_instrument_name("BTC-PERPETUAL") is None
    assert gamma.parse_instrument_name("lixo") is None


# ─── Zero Gamma (flip) por interpolação ──────────────────────────────────────
def test_find_zero_gamma_curva_linear():
    spots = np.linspace(80, 120, 41)        # passo de 1
    curve = spots - 100.0                    # cruza zero exatamente em 100
    flip = gamma.find_zero_gamma(spots, curve, spot=100.0)
    assert flip == pytest.approx(100.0, abs=1e-9)


def test_find_zero_gamma_interpola_entre_pontos():
    spots = np.array([100.0, 110.0])
    curve = np.array([-5.0, 5.0])            # cruza no meio → 105
    assert gamma.find_zero_gamma(spots, curve, 105.0) == pytest.approx(105.0)


def test_find_zero_gamma_sem_cruzamento():
    spots = np.array([100.0, 110.0, 120.0])
    curve = np.array([3.0, 5.0, 9.0])        # sempre positivo → None
    assert gamma.find_zero_gamma(spots, curve, 110.0) is None


def test_find_zero_gamma_escolhe_mais_proximo_do_spot():
    spots = np.array([90.0, 100.0, 110.0, 120.0])
    curve = np.array([-1.0, 1.0, -1.0, 1.0])  # cruza em 95, 105, 115
    flip = gamma.find_zero_gamma(spots, curve, spot=104.0)
    assert flip == pytest.approx(105.0)       # 105 é o mais próximo de 104


# ─── Max Pain ────────────────────────────────────────────────────────────────
def test_max_pain_book_artificial():
    # calls/puts em 100 (OI 10) + call 110 (OI 5) + put 90 (OI 5) → min em 100
    strikes = np.array([100.0, 100.0, 110.0, 90.0])
    types = np.array(["call", "put", "call", "put"])
    oi = np.array([10.0, 10.0, 5.0, 5.0])
    assert gamma.compute_max_pain(strikes, types, oi) == pytest.approx(100.0)


def test_max_pain_vazio():
    assert gamma.compute_max_pain(np.array([]), np.array([]), np.array([])) is None


# ─── Orquestração compute() ──────────────────────────────────────────────────
def _opt(strike, typ, oi, iv, days):
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return gamma.OptionInput(strike, typ, oi, iv, now + timedelta(days=days))


def test_compute_regime_e_perfil():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = [
        _opt(100.0, "call", 100.0, 60.0, 30),
        _opt(110.0, "call", 50.0, 55.0, 30),
        _opt(90.0, "put", 80.0, 65.0, 30),
    ]
    res = gamma.compute(book, spot=100.0, now=now)
    assert res is not None
    assert res.regime in ("positive", "negative")
    # sinal do net_gex bate com o regime
    assert (res.net_gex_spot >= 0) == (res.regime == "positive")
    assert res.profile                      # perfil por strike preenchido
    assert res.max_pain is not None
    assert len(res.per_option_gex) == len(res.options) == 3


def test_compute_filtra_higiene():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = [
        _opt(100.0, "call", 100.0, 60.0, 30),   # ok
        _opt(100.0, "call", 0.0, 60.0, 30),     # OI zero → descartada
        _opt(100.0, "put", 50.0, 0.0, 30),      # IV zero → descartada
        _opt(100.0, "call", 50.0, 60.0, 0),     # T < 1 dia → descartada
    ]
    res = gamma.compute(book, spot=100.0, now=now)
    assert res is not None
    assert len(res.options) == 1


def test_compute_sem_opcoes_validas_retorna_none():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = [_opt(100.0, "call", 0.0, 60.0, 30)]   # só inválidas
    assert gamma.compute(book, spot=100.0, now=now) is None


def test_compute_so_calls_regime_positivo():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = [_opt(100.0, "call", 100.0, 60.0, 30), _opt(105.0, "call", 80.0, 58.0, 30)]
    res = gamma.compute(book, spot=100.0, now=now)
    assert res.regime == "positive"           # dealers comprados em calls → +gamma


def test_compute_so_puts_regime_negativo():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = [_opt(100.0, "put", 100.0, 60.0, 30), _opt(95.0, "put", 80.0, 62.0, 30)]
    res = gamma.compute(book, spot=100.0, now=now)
    assert res.regime == "negative"           # dealers vendidos em puts → −gamma
