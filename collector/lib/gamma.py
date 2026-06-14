"""Módulo Gamma — leitura estilo SpotGamma para cripto (PRD §8.5 v1.4).

Recebe o book de opções da Deribit (open interest + mark IV por instrumento) e:

  1. filtra por higiene (T ≥ 1 dia, OI > 0, IV presente);
  2. calcula o gamma de cada opção pela fórmula FECHADA de Black-Scholes
     (juros ≈ 0) — não é modelagem própria de volatilidade, a IV vem pronta
     da Deribit (`mark_iv`);
  3. soma o GEX líquido por strike (dealers comprados em calls, vendidos em puts);
  4. reconstrói a curva GEX(S) numa grade de 60+ spots (±15%, passo 0,5%) e
     localiza o Zero Gamma (flip) por interpolação linear no cruzamento por zero;
  5. determina o regime (sinal do GEX no spot) e o Max Pain do vencimento mais
     próximo.

Tudo vetorizado com NumPy: ~500 opções × ~60 spots resolve em milissegundos.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np

# ─── Constantes de cálculo ───────────────────────────────────────────────────
SECONDS_PER_YEAR = 365.0 * 24 * 3600
MIN_T_DAYS = 1.0          # descartar opções a < 1 dia do vencimento
GRID_RANGE = 0.15         # grade de spots: ±15% em torno do preço atual
GRID_STEP = 0.005         # passo de 0,5% → 61 pontos
_SQRT_2PI = math.sqrt(2.0 * math.pi)

# ─── Parsing do nome do instrumento Deribit (ex: "BTC-27JUN26-70000-C") ───────
_MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}
_INSTRUMENT_RE = re.compile(
    r"^(?P<asset>[A-Z]+)-(?P<day>\d{1,2})(?P<mon>[A-Z]{3})(?P<yr>\d{2})-"
    r"(?P<strike>\d+(?:\.\d+)?)-(?P<type>[CP])$"
)


def parse_instrument_name(name: str) -> dict | None:
    """Decodifica o nome do instrumento Deribit.

    Retorna {asset, expiry(datetime UTC), strike(float), type('call'|'put')}
    ou None se o formato não casar. Opções da Deribit expiram às 08:00 UTC.
    """
    m = _INSTRUMENT_RE.match(name.strip().upper())
    if not m:
        return None
    mon = _MONTHS.get(m.group("mon"))
    if mon is None:
        return None
    try:
        expiry = datetime(
            2000 + int(m.group("yr")), mon, int(m.group("day")),
            8, 0, 0, tzinfo=timezone.utc,
        )
    except ValueError:
        return None
    return {
        "asset": m.group("asset"),
        "expiry": expiry,
        "strike": float(m.group("strike")),
        "type": "call" if m.group("type") == "C" else "put",
    }


# ─── Black-Scholes: gamma fechado (vetorizado) ───────────────────────────────
def _norm_pdf(x: np.ndarray) -> np.ndarray:
    return np.exp(-0.5 * x * x) / _SQRT_2PI


def black_scholes_gamma(S, K, T, sigma) -> np.ndarray:
    """Gamma de Black-Scholes (r ≈ 0), vetorizado e seguro contra NaN/inf.

    gamma = φ(d1) / (S · σ · √T),  d1 = [ln(S/K) + σ²·T/2] / (σ·√T)

    Suporta broadcasting: S=(M,1) e K/σ/T=(1,N) → matriz (M,N).
    """
    S = np.asarray(S, dtype=float)
    K = np.asarray(K, dtype=float)
    T = np.asarray(T, dtype=float)
    sigma = np.asarray(sigma, dtype=float)

    denom = sigma * np.sqrt(T)
    with np.errstate(divide="ignore", invalid="ignore"):
        d1 = (np.log(S / K) + 0.5 * sigma * sigma * T) / denom
        gamma = _norm_pdf(d1) / (S * denom)
    return np.where(np.isfinite(gamma), gamma, 0.0)


def net_gex_curve(spots, strikes, sigmas, T, signs, oi) -> np.ndarray:
    """GEX líquido total para cada spot da grade.

    gex_opção = sinal · γ(S) · OI · S² · 0,01  (dólares de hedge por movimento 1%)
    Retorna um vetor (M,) com o GEX líquido somado em cada spot.
    """
    spots = np.asarray(spots, dtype=float)
    S = spots[:, None]                      # (M, 1)
    g = black_scholes_gamma(S, strikes[None, :], T[None, :], sigmas[None, :])
    gex = signs[None, :] * g * oi[None, :] * (S * S) * 0.01
    return gex.sum(axis=1)


def find_zero_gamma(spots, gex, spot) -> float | None:
    """Localiza o flip: cruzamento por zero da curva GEX(S), por interpolação.

    Se houver mais de um cruzamento, retorna o mais próximo do preço atual.
    Se não houver cruzamento na grade, regime estável → None.
    """
    spots = np.asarray(spots, dtype=float)
    gex = np.asarray(gex, dtype=float)
    crossings: list[float] = []
    for i in range(len(spots) - 1):
        y0, y1 = gex[i], gex[i + 1]
        if y0 == 0.0:
            crossings.append(float(spots[i]))
        elif y0 * y1 < 0.0:
            x0, x1 = spots[i], spots[i + 1]
            root = x0 + (x1 - x0) * (0.0 - y0) / (y1 - y0)
            crossings.append(float(root))
    if gex[-1] == 0.0:
        crossings.append(float(spots[-1]))
    if not crossings:
        return None
    return min(crossings, key=lambda x: abs(x - spot))


def compute_max_pain(strikes, types, oi) -> float | None:
    """Max Pain: strike que minimiza o valor pago aos detentores no vencimento.

    Para cada strike candidato S: Σ_calls OI·max(0, S−K) + Σ_puts OI·max(0, K−S).
    `types` é um array de 'call'/'put'. Vetorizado por broadcasting.
    """
    strikes = np.asarray(strikes, dtype=float)
    oi = np.asarray(oi, dtype=float)
    types = np.asarray(types)
    if strikes.size == 0:
        return None

    candidates = np.unique(strikes)          # (C,)
    is_call = types == "call"
    kc, oic = strikes[is_call], oi[is_call]
    kp, oip = strikes[~is_call], oi[~is_call]

    C = candidates[:, None]                  # (C, 1)
    call_pay = (oic[None, :] * np.maximum(0.0, C - kc[None, :])).sum(axis=1)
    put_pay = (oip[None, :] * np.maximum(0.0, kp[None, :] - C)).sum(axis=1)
    total = call_pay + put_pay
    return float(candidates[int(np.argmin(total))])


# ─── Orquestração ────────────────────────────────────────────────────────────
@dataclass
class OptionInput:
    """Uma opção do book da Deribit, já parseada."""
    strike: float
    type: str          # 'call' | 'put'
    oi: float
    iv: float          # mark_iv em % (ex: 65.0)
    expiry: datetime


@dataclass
class GammaResult:
    spot_price: float
    regime: str | None                 # 'positive' | 'negative'
    net_gex_spot: float
    zero_gamma_level: float | None
    max_pain: float | None
    max_pain_expiry: datetime | None
    profile: dict[str, float]          # {strike(str): gex líquido no spot}
    per_option_gex: list[float]        # alinhado a `options` (pós-filtro)
    per_option_gamma: list[float]
    options: list[OptionInput]         # opções que passaram nos filtros
    put_call_ratio: float | None       # OI(puts) / OI(calls)
    avg_iv: float | None               # IV média ponderada por OI (%)
    iv_skew: float | None              # IV(puts) − IV(calls), ponderada por OI (%)


def _filter(options: list[OptionInput], now: datetime) -> tuple[list[OptionInput], np.ndarray]:
    """Aplica os filtros de higiene e devolve (opções válidas, T em anos)."""
    kept: list[OptionInput] = []
    t_years: list[float] = []
    for o in options:
        if o.oi is None or o.oi <= 0:
            continue
        if o.iv is None or o.iv <= 0:
            continue
        secs = (o.expiry - now).total_seconds()
        if secs / 86400.0 < MIN_T_DAYS:
            continue
        kept.append(o)
        t_years.append(secs / SECONDS_PER_YEAR)
    return kept, np.asarray(t_years, dtype=float)


def compute(options: list[OptionInput], spot: float, now: datetime | None = None) -> GammaResult | None:
    """Calcula o perfil de gamma completo a partir do book + spot.

    Retorna None se, após os filtros, não sobrar opção utilizável.
    """
    now = now or datetime.now(timezone.utc)
    kept, T = _filter(options, now)
    if not kept:
        return None

    strikes = np.array([o.strike for o in kept], dtype=float)
    sigmas = np.array([o.iv / 100.0 for o in kept], dtype=float)
    types = np.array([o.type for o in kept])
    oi = np.array([o.oi for o in kept], dtype=float)
    signs = np.where(types == "call", 1.0, -1.0)

    # GEX por opção no spot atual
    g_spot = black_scholes_gamma(spot, strikes, T, sigmas)
    gex_spot = signs * g_spot * oi * (spot * spot) * 0.01
    net_gex_spot = float(gex_spot.sum())
    regime = "positive" if net_gex_spot >= 0 else "negative"

    # Perfil por strike (agrega o GEX das opções que dividem o mesmo strike)
    profile: dict[str, float] = {}
    for k, gx in zip(strikes, gex_spot):
        key = f"{k:g}"
        profile[key] = profile.get(key, 0.0) + float(gx)

    # Curva GEX(S) na grade → Zero Gamma
    offsets = np.arange(-GRID_RANGE, GRID_RANGE + GRID_STEP / 2, GRID_STEP)
    grid = spot * (1.0 + offsets)
    curve = net_gex_curve(grid, strikes, sigmas, T, signs, oi)
    zero_gamma = find_zero_gamma(grid, curve, spot)

    # Max Pain do vencimento mais próximo
    nearest_expiry = min(o.expiry for o in kept)
    mp_mask = np.array([o.expiry == nearest_expiry for o in kept])
    max_pain = compute_max_pain(strikes[mp_mask], types[mp_mask], oi[mp_mask])

    # Sentimento de opções: Put/Call ratio, IV média (ponderada por OI) e skew
    ivs = np.array([o.iv for o in kept], dtype=float)  # mark_iv em %
    put_mask = types == "put"
    call_mask = ~put_mask
    put_oi = float(oi[put_mask].sum())
    call_oi = float(oi[call_mask].sum())
    total_oi = float(oi.sum())
    put_call_ratio = round(put_oi / call_oi, 4) if call_oi > 0 else None
    avg_iv = round(float((ivs * oi).sum() / total_oi), 2) if total_oi > 0 else None
    put_iv = float((ivs[put_mask] * oi[put_mask]).sum() / put_oi) if put_oi > 0 else None
    call_iv = float((ivs[call_mask] * oi[call_mask]).sum() / call_oi) if call_oi > 0 else None
    iv_skew = round(put_iv - call_iv, 2) if (put_iv is not None and call_iv is not None) else None

    return GammaResult(
        spot_price=float(spot),
        regime=regime,
        net_gex_spot=net_gex_spot,
        zero_gamma_level=zero_gamma,
        max_pain=max_pain,
        max_pain_expiry=nearest_expiry,
        profile=profile,
        per_option_gex=[float(x) for x in gex_spot],
        per_option_gamma=[float(x) for x in g_spot],
        options=kept,
        put_call_ratio=put_call_ratio,
        avg_iv=avg_iv,
        iv_skew=iv_skew,
    )
