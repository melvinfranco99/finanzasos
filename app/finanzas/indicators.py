"""Indicadores técnicos (numpy puro). Todas las funciones devuelven arrays del mismo
largo que la entrada, con NaN durante el periodo de calentamiento."""
from __future__ import annotations

import numpy as np

NAN = np.nan


def _a(x):
    return np.asarray(x, dtype=float)


def _first_valid(x):
    idx = np.flatnonzero(~np.isnan(x))
    return int(idx[0]) if len(idx) else len(x)


# --------------------------------------------------------------------------- Medias
def sma(x, n):
    x = _a(x)
    out = np.full(len(x), NAN)
    n = int(n)
    s = _first_valid(x)
    if n <= 0 or len(x) - s < n:
        return out
    c = np.cumsum(np.insert(x[s:], 0, 0.0))
    out[s + n - 1:] = (c[n:] - c[:-n]) / n
    return out


def ema(x, n, alpha=None):
    x = _a(x)
    out = np.full(len(x), NAN)
    n = int(n)
    s = _first_valid(x)
    if n <= 0 or len(x) - s < n:
        return out
    a = alpha if alpha is not None else 2.0 / (n + 1)
    prev = np.mean(x[s:s + n])
    out[s + n - 1] = prev
    for i in range(s + n, len(x)):
        v = x[i]
        if not np.isnan(v):
            prev = a * v + (1 - a) * prev
        out[i] = prev
    return out


def rma(x, n):
    """Media de Wilder (RSI, ATR, ADX)."""
    return ema(x, n, alpha=1.0 / n)


def wma(x, n):
    x = _a(x)
    n = int(n)
    out = np.full(len(x), NAN)
    if len(x) < n:
        return out
    w = np.arange(1, n + 1, dtype=float)
    w /= w.sum()
    conv = np.convolve(x, w[::-1], mode="valid")
    out[n - 1:] = conv
    return out


def hma(x, n):
    n = int(n)
    return wma(2 * wma(x, max(n // 2, 1)) - wma(x, n), max(int(np.sqrt(n)), 1))


def dema(x, n):
    e = ema(x, n)
    return 2 * e - ema(e, n)


def tema(x, n):
    e1 = ema(x, n)
    e2 = ema(e1, n)
    return 3 * e1 - 3 * e2 + ema(e2, n)


def vwma(c, v, n):
    return sma(_a(c) * _a(v), n) / sma(v, n)


def rolling(x, n, fn):
    x = _a(x)
    n = int(n)
    out = np.full(len(x), NAN)
    if len(x) < n:
        return out
    win = np.lib.stride_tricks.sliding_window_view(x, n)
    out[n - 1:] = fn(win, axis=1)
    return out


def stdev(x, n):
    return rolling(x, n, np.std)


def highest(x, n):
    return rolling(x, n, np.max)


def lowest(x, n):
    return rolling(x, n, np.min)


# --------------------------------------------------------------------------- Osciladores
def rsi(c, n=14):
    c = _a(c)
    d = np.diff(c, prepend=NAN)
    up = rma(np.where(d > 0, d, 0.0) * np.where(np.isnan(d), NAN, 1), n)
    dn = rma(np.where(d < 0, -d, 0.0) * np.where(np.isnan(d), NAN, 1), n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = up / dn
        out = 100 - 100 / (1 + rs)
    out[(dn == 0) & ~np.isnan(up)] = 100
    return out


def macd(c, fast=12, slow=26, signal=9):
    m = ema(c, fast) - ema(c, slow)
    s = ema(m, signal)
    return m, s, m - s


def stochastic(h, l, c, k=14, d=3, smooth=3):
    hh, ll = highest(h, k), lowest(l, k)
    with np.errstate(divide="ignore", invalid="ignore"):
        raw = 100 * (_a(c) - ll) / (hh - ll)
    kk = sma(raw, smooth)
    return kk, sma(kk, d)


def stoch_rsi(c, n=14, k=3, d=3):
    r = rsi(c, n)
    hh, ll = highest(r, n), lowest(r, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        raw = 100 * (r - ll) / (hh - ll)
    kk = sma(raw, k)
    return kk, sma(kk, d)


def cci(h, l, c, n=20):
    tp = (_a(h) + _a(l) + _a(c)) / 3
    m = sma(tp, n)
    md = rolling(tp, n, lambda w, axis: np.mean(np.abs(w - w.mean(axis=1, keepdims=True)), axis=1))
    with np.errstate(divide="ignore", invalid="ignore"):
        return (tp - m) / (0.015 * md)


def williams_r(h, l, c, n=14):
    hh, ll = highest(h, n), lowest(l, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        return -100 * (hh - _a(c)) / (hh - ll)


def roc(c, n=12):
    c = _a(c)
    out = np.full(len(c), NAN)
    out[n:] = (c[n:] / c[:-n] - 1) * 100
    return out


def momentum(c, n=10):
    c = _a(c)
    out = np.full(len(c), NAN)
    out[n:] = c[n:] - c[:-n]
    return out


def trix(c, n=15):
    e = ema(ema(ema(c, n), n), n)
    return roc(e, 1) * 1.0


def awesome(h, l):
    mp = (_a(h) + _a(l)) / 2
    return sma(mp, 5) - sma(mp, 34)


def ultimate(h, l, c, a=7, b=14, d=28):
    h, l, c = _a(h), _a(l), _a(c)
    pc = np.concatenate([[c[0]], c[:-1]])
    bp = c - np.minimum(l, pc)
    tr = np.maximum(h, pc) - np.minimum(l, pc)

    def avg(n):
        return sma(bp, n) * n / (sma(tr, n) * n)
    return 100 * (4 * avg(a) + 2 * avg(b) + avg(d)) / 7


def mfi(h, l, c, v, n=14):
    tp = (_a(h) + _a(l) + _a(c)) / 3
    rmf = tp * _a(v)
    d = np.diff(tp, prepend=NAN)
    pos = np.where(d > 0, rmf, 0.0)
    neg = np.where(d < 0, rmf, 0.0)
    ps, ns = sma(pos, n), sma(neg, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = 100 - 100 / (1 + ps / ns)
    out[0] = NAN
    return out


# --------------------------------------------------------------------------- Volatilidad
def true_range(h, l, c):
    h, l, c = _a(h), _a(l), _a(c)
    pc = np.concatenate([[NAN], c[:-1]])
    tr = np.nanmax(np.vstack([h - l, np.abs(h - pc), np.abs(l - pc)]), axis=0)
    return tr


def atr(h, l, c, n=14):
    return rma(true_range(h, l, c), n)


def bollinger(c, n=20, k=2.0):
    m = sma(c, n)
    s = stdev(c, n)
    return m + k * s, m, m - k * s


def bb_percent(c, n=20, k=2.0):
    up, mid, lo = bollinger(c, n, k)
    with np.errstate(divide="ignore", invalid="ignore"):
        return (_a(c) - lo) / (up - lo)


def bb_width(c, n=20, k=2.0):
    up, mid, lo = bollinger(c, n, k)
    return (up - lo) / mid * 100


def keltner(h, l, c, n=20, mult=2.0, atr_n=10):
    m = ema(c, n)
    a = atr(h, l, c, atr_n)
    return m + mult * a, m, m - mult * a


def donchian(h, l, n=20):
    up, lo = highest(h, n), lowest(l, n)
    return up, (up + lo) / 2, lo


def hist_vol(c, n=20, periods=252):
    lr = np.diff(np.log(_a(c)), prepend=NAN)
    return stdev(lr, n) * np.sqrt(periods) * 100


def zscore(c, n=20):
    with np.errstate(divide="ignore", invalid="ignore"):
        return (_a(c) - sma(c, n)) / stdev(c, n)


# --------------------------------------------------------------------------- Tendencia
def adx(h, l, c, n=14):
    h, l = _a(h), _a(l)
    up = np.diff(h, prepend=NAN)
    dn = -np.diff(l, prepend=NAN)
    pdm = np.where((up > dn) & (up > 0), up, 0.0)
    ndm = np.where((dn > up) & (dn > 0), dn, 0.0)
    pdm[0] = ndm[0] = NAN
    tr = true_range(h, l, c)
    tr[0] = NAN
    a = rma(tr, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        pdi = 100 * rma(pdm, n) / a
        ndi = 100 * rma(ndm, n) / a
        dx = 100 * np.abs(pdi - ndi) / (pdi + ndi)
    return rma(dx, n), pdi, ndi


def aroon(h, l, n=25):
    h, l = _a(h), _a(l)
    up = np.full(len(h), NAN)
    dn = np.full(len(h), NAN)
    if len(h) > n:
        wh = np.lib.stride_tricks.sliding_window_view(h, n + 1)
        wl = np.lib.stride_tricks.sliding_window_view(l, n + 1)
        up[n:] = 100 * np.argmax(wh, axis=1) / n
        dn[n:] = 100 * np.argmin(wl, axis=1) / n
    return up, dn


def psar(h, l, step=0.02, max_step=0.2):
    h, l = _a(h), _a(l)
    n = len(h)
    out = np.full(n, NAN)
    if n < 3:
        return out
    bull = True
    af = step
    ep = h[0]
    sar = l[0]
    for i in range(1, n):
        sar = sar + af * (ep - sar)
        if bull:
            sar = min(sar, l[i - 1], l[i - 2] if i > 1 else l[i - 1])
            if l[i] < sar:
                bull, sar, ep, af = False, ep, l[i], step
            elif h[i] > ep:
                ep, af = h[i], min(af + step, max_step)
        else:
            sar = max(sar, h[i - 1], h[i - 2] if i > 1 else h[i - 1])
            if h[i] > sar:
                bull, sar, ep, af = True, ep, h[i], step
            elif l[i] < ep:
                ep, af = l[i], min(af + step, max_step)
        out[i] = sar
    return out


def supertrend(h, l, c, n=10, mult=3.0):
    h, l, c = _a(h), _a(l), _a(c)
    a = atr(h, l, c, n)
    hl2 = (h + l) / 2
    ub = hl2 + mult * a
    lb = hl2 - mult * a
    st = np.full(len(c), NAN)
    direction = np.zeros(len(c))
    fu, fl = NAN, NAN
    d = 1
    for i in range(len(c)):
        if np.isnan(a[i]):
            continue
        fu = ub[i] if np.isnan(fu) or ub[i] < fu or c[i - 1] > fu else fu
        fl = lb[i] if np.isnan(fl) or lb[i] > fl or c[i - 1] < fl else fl
        if d == 1 and c[i] < fl:
            d = -1
        elif d == -1 and c[i] > fu:
            d = 1
        st[i] = fl if d == 1 else fu
        direction[i] = d
    return st, direction


def ichimoku(h, l, tenkan=9, kijun=26, senkou=52):
    t = (highest(h, tenkan) + lowest(l, tenkan)) / 2
    k = (highest(h, kijun) + lowest(l, kijun)) / 2
    sa = (t + k) / 2
    sb = (highest(h, senkou) + lowest(l, senkou)) / 2
    # Desplazamiento hacia delante de las nubes (se recortan al final)
    sa_s = np.concatenate([np.full(kijun, NAN), sa[:-kijun]]) if len(sa) > kijun else np.full(len(sa), NAN)
    sb_s = np.concatenate([np.full(kijun, NAN), sb[:-kijun]]) if len(sb) > kijun else np.full(len(sb), NAN)
    return t, k, sa_s, sb_s


def linreg(c, n=50):
    c = _a(c)
    out = np.full(len(c), NAN)
    if len(c) < n:
        return out
    x = np.arange(n)
    xm = x.mean()
    den = ((x - xm) ** 2).sum()
    win = np.lib.stride_tricks.sliding_window_view(c, n)
    ym = win.mean(axis=1)
    slope = ((win - ym[:, None]) * (x - xm)).sum(axis=1) / den
    out[n - 1:] = ym + slope * (n - 1 - xm)
    return out


# --------------------------------------------------------------------------- Volumen
def obv(c, v):
    c, v = _a(c), _a(v)
    d = np.sign(np.diff(c, prepend=c[0]))
    return np.cumsum(d * v)


def cmf(h, l, c, v, n=20):
    h, l, c, v = _a(h), _a(l), _a(c), _a(v)
    with np.errstate(divide="ignore", invalid="ignore"):
        mfm = np.where(h != l, ((c - l) - (h - c)) / (h - l), 0.0)
        return sma(mfm * v, n) / sma(v, n)


def adl(h, l, c, v):
    h, l, c, v = _a(h), _a(l), _a(c), _a(v)
    with np.errstate(divide="ignore", invalid="ignore"):
        mfm = np.where(h != l, ((c - l) - (h - c)) / (h - l), 0.0)
    return np.cumsum(mfm * v)


def vwap(t, h, l, c, v, intraday=True):
    """VWAP anclado por sesión (intradía) o acumulado continuo."""
    t, h, l, c, v = map(_a, (t, h, l, c, v))
    tp = (h + l + c) / 3
    pv = tp * v
    out = np.full(len(c), NAN)
    if intraday:
        day = (t // 86400).astype(np.int64)
        cpv = cv = 0.0
        for i in range(len(c)):
            if i == 0 or day[i] != day[i - 1]:
                cpv = cv = 0.0
            cpv += pv[i]
            cv += v[i]
            out[i] = cpv / cv if cv else tp[i]
    else:
        with np.errstate(divide="ignore", invalid="ignore"):
            out = np.cumsum(pv) / np.cumsum(v)
    return out


def volume_osc(v, fast=5, slow=10):
    with np.errstate(divide="ignore", invalid="ignore"):
        return 100 * (ema(v, fast) - ema(v, slow)) / ema(v, slow)


# --------------------------------------------------------------------------- Pivotes
def pivots(h, l, c):
    """Puntos pivote clásicos, Fibonacci y Camarilla a partir de la última vela completa."""
    H, L, C = float(h), float(l), float(c)
    P = (H + L + C) / 3
    R = H - L
    return {
        "Clásico": {"R3": H + 2 * (P - L), "R2": P + R, "R1": 2 * P - L, "P": P,
                    "S1": 2 * P - H, "S2": P - R, "S3": L - 2 * (H - P)},
        "Fibonacci": {"R3": P + R, "R2": P + 0.618 * R, "R1": P + 0.382 * R, "P": P,
                      "S1": P - 0.382 * R, "S2": P - 0.618 * R, "S3": P - R},
        "Camarilla": {"R3": C + R * 1.1 / 4, "R2": C + R * 1.1 / 6, "R1": C + R * 1.1 / 12, "P": P,
                      "S1": C - R * 1.1 / 12, "S2": C - R * 1.1 / 6, "S3": C - R * 1.1 / 4},
        "Woodie": {"R3": H + 2 * ((H + L + 2 * C) / 4 - L), "R2": (H + L + 2 * C) / 4 + R,
                   "R1": 2 * (H + L + 2 * C) / 4 - L, "P": (H + L + 2 * C) / 4,
                   "S1": 2 * (H + L + 2 * C) / 4 - H, "S2": (H + L + 2 * C) / 4 - R,
                   "S3": L - 2 * (H - (H + L + 2 * C) / 4)},
    }


def heikin_ashi(o, h, l, c):
    o, h, l, c = map(_a, (o, h, l, c))
    hc = (o + h + l + c) / 4
    ho = np.empty_like(o)
    ho[0] = (o[0] + c[0]) / 2
    for i in range(1, len(o)):
        ho[i] = (ho[i - 1] + hc[i - 1]) / 2
    return ho, np.maximum.reduce([h, ho, hc]), np.minimum.reduce([l, ho, hc]), hc


# --------------------------------------------------------------------------- Registro
# pane: "overlay" (sobre el precio) o "pane" (panel propio).
# outputs: (clave, etiqueta, color, tipo)  tipo: line | hist | dots
# levels: líneas horizontales de referencia del panel
REGISTRY = {
    "sma": {"name": "Media móvil simple (SMA)", "group": "Medias", "pane": "overlay",
            "params": {"period": 50}, "outputs": [("v", "SMA", "#f5b700", "line")]},
    "ema": {"name": "Media móvil exponencial (EMA)", "group": "Medias", "pane": "overlay",
            "params": {"period": 21}, "outputs": [("v", "EMA", "#22d3ee", "line")]},
    "wma": {"name": "Media ponderada (WMA)", "group": "Medias", "pane": "overlay",
            "params": {"period": 20}, "outputs": [("v", "WMA", "#a78bfa", "line")]},
    "hma": {"name": "Media de Hull (HMA)", "group": "Medias", "pane": "overlay",
            "params": {"period": 21}, "outputs": [("v", "HMA", "#f472b6", "line")]},
    "dema": {"name": "Doble EMA (DEMA)", "group": "Medias", "pane": "overlay",
             "params": {"period": 21}, "outputs": [("v", "DEMA", "#34d399", "line")]},
    "tema": {"name": "Triple EMA (TEMA)", "group": "Medias", "pane": "overlay",
             "params": {"period": 21}, "outputs": [("v", "TEMA", "#fb923c", "line")]},
    "vwma": {"name": "Media ponderada por volumen (VWMA)", "group": "Medias", "pane": "overlay",
             "params": {"period": 20}, "outputs": [("v", "VWMA", "#60a5fa", "line")]},
    "vwap": {"name": "VWAP (precio medio ponderado por volumen)", "group": "Volumen", "pane": "overlay",
             "params": {}, "outputs": [("v", "VWAP", "#e879f9", "line")]},
    "bb": {"name": "Bandas de Bollinger", "group": "Volatilidad", "pane": "overlay",
           "params": {"period": 20, "k": 2.0},
           "outputs": [("up", "BB sup", "#60a5fa", "line"), ("mid", "BB media", "#94a3b8", "line"),
                       ("lo", "BB inf", "#60a5fa", "line")]},
    "keltner": {"name": "Canales de Keltner", "group": "Volatilidad", "pane": "overlay",
                "params": {"period": 20, "mult": 2.0},
                "outputs": [("up", "KC sup", "#c084fc", "line"), ("mid", "KC media", "#94a3b8", "line"),
                            ("lo", "KC inf", "#c084fc", "line")]},
    "donchian": {"name": "Canales de Donchian", "group": "Volatilidad", "pane": "overlay",
                 "params": {"period": 20},
                 "outputs": [("up", "DC sup", "#2dd4bf", "line"), ("mid", "DC media", "#64748b", "line"),
                             ("lo", "DC inf", "#2dd4bf", "line")]},
    "ichimoku": {"name": "Ichimoku Kinko Hyo", "group": "Tendencia", "pane": "overlay",
                 "params": {"tenkan": 9, "kijun": 26, "senkou": 52},
                 "outputs": [("t", "Tenkan", "#38bdf8", "line"), ("k", "Kijun", "#f43f5e", "line"),
                             ("a", "Senkou A", "#22c55e", "line"), ("b", "Senkou B", "#ef4444", "line")]},
    "psar": {"name": "Parabolic SAR", "group": "Tendencia", "pane": "overlay",
             "params": {"step": 0.02, "max": 0.2}, "outputs": [("v", "PSAR", "#fde047", "dots")]},
    "supertrend": {"name": "SuperTrend", "group": "Tendencia", "pane": "overlay",
                   "params": {"period": 10, "mult": 3.0}, "outputs": [("v", "SuperTrend", "#22c55e", "line")]},
    "linreg": {"name": "Regresión lineal", "group": "Tendencia", "pane": "overlay",
               "params": {"period": 50}, "outputs": [("v", "LinReg", "#fbbf24", "line")]},
    "volume": {"name": "Volumen", "group": "Volumen", "pane": "pane",
               "params": {"ma": 20}, "outputs": [("v", "Volumen", "#64748b", "hist"), ("ma", "Media vol.", "#f5b700", "line")]},
    "rsi": {"name": "RSI (Índice de fuerza relativa)", "group": "Osciladores", "pane": "pane",
            "params": {"period": 14}, "outputs": [("v", "RSI", "#a78bfa", "line")], "levels": [30, 50, 70]},
    "macd": {"name": "MACD", "group": "Osciladores", "pane": "pane",
             "params": {"fast": 12, "slow": 26, "signal": 9},
             "outputs": [("h", "Histograma", "#64748b", "hist"), ("m", "MACD", "#38bdf8", "line"),
                         ("s", "Señal", "#f97316", "line")], "levels": [0]},
    "stoch": {"name": "Estocástico", "group": "Osciladores", "pane": "pane",
              "params": {"k": 14, "d": 3, "smooth": 3},
              "outputs": [("k", "%K", "#38bdf8", "line"), ("d", "%D", "#f97316", "line")], "levels": [20, 80]},
    "stochrsi": {"name": "Stochastic RSI", "group": "Osciladores", "pane": "pane",
                 "params": {"period": 14, "k": 3, "d": 3},
                 "outputs": [("k", "%K", "#22d3ee", "line"), ("d", "%D", "#f472b6", "line")], "levels": [20, 80]},
    "cci": {"name": "CCI (Commodity Channel Index)", "group": "Osciladores", "pane": "pane",
            "params": {"period": 20}, "outputs": [("v", "CCI", "#2dd4bf", "line")], "levels": [-100, 0, 100]},
    "willr": {"name": "Williams %R", "group": "Osciladores", "pane": "pane",
              "params": {"period": 14}, "outputs": [("v", "%R", "#fb7185", "line")], "levels": [-80, -20]},
    "roc": {"name": "ROC (tasa de cambio)", "group": "Momento", "pane": "pane",
            "params": {"period": 12}, "outputs": [("v", "ROC %", "#facc15", "line")], "levels": [0]},
    "mom": {"name": "Momentum", "group": "Momento", "pane": "pane",
            "params": {"period": 10}, "outputs": [("v", "MOM", "#4ade80", "line")], "levels": [0]},
    "trix": {"name": "TRIX", "group": "Momento", "pane": "pane",
             "params": {"period": 15}, "outputs": [("v", "TRIX", "#c084fc", "line")], "levels": [0]},
    "ao": {"name": "Awesome Oscillator", "group": "Momento", "pane": "pane",
           "params": {}, "outputs": [("v", "AO", "#64748b", "hist")], "levels": [0]},
    "uo": {"name": "Ultimate Oscillator", "group": "Osciladores", "pane": "pane",
           "params": {"a": 7, "b": 14, "c": 28}, "outputs": [("v", "UO", "#fb923c", "line")], "levels": [30, 70]},
    "mfi": {"name": "MFI (Money Flow Index)", "group": "Volumen", "pane": "pane",
            "params": {"period": 14}, "outputs": [("v", "MFI", "#34d399", "line")], "levels": [20, 80]},
    "obv": {"name": "OBV (On-Balance Volume)", "group": "Volumen", "pane": "pane",
            "params": {}, "outputs": [("v", "OBV", "#60a5fa", "line")]},
    "cmf": {"name": "Chaikin Money Flow", "group": "Volumen", "pane": "pane",
            "params": {"period": 20}, "outputs": [("v", "CMF", "#2dd4bf", "hist")], "levels": [0]},
    "adl": {"name": "Acumulación/Distribución", "group": "Volumen", "pane": "pane",
            "params": {}, "outputs": [("v", "A/D", "#a3e635", "line")]},
    "atr": {"name": "ATR (rango verdadero medio)", "group": "Volatilidad", "pane": "pane",
            "params": {"period": 14}, "outputs": [("v", "ATR", "#f87171", "line")]},
    "hv": {"name": "Volatilidad histórica anualizada", "group": "Volatilidad", "pane": "pane",
           "params": {"period": 20}, "outputs": [("v", "HV %", "#fbbf24", "line")]},
    "bbw": {"name": "Ancho de Bollinger", "group": "Volatilidad", "pane": "pane",
            "params": {"period": 20, "k": 2.0}, "outputs": [("v", "BBW %", "#93c5fd", "line")]},
    "bbp": {"name": "%B de Bollinger", "group": "Volatilidad", "pane": "pane",
            "params": {"period": 20, "k": 2.0}, "outputs": [("v", "%B", "#818cf8", "line")], "levels": [0, 0.5, 1]},
    "adx": {"name": "ADX / DMI", "group": "Tendencia", "pane": "pane",
            "params": {"period": 14},
            "outputs": [("adx", "ADX", "#fbbf24", "line"), ("p", "+DI", "#22c55e", "line"),
                        ("n", "-DI", "#ef4444", "line")], "levels": [20, 25]},
    "aroon": {"name": "Aroon", "group": "Tendencia", "pane": "pane",
              "params": {"period": 25},
              "outputs": [("u", "Aroon Up", "#22c55e", "line"), ("d", "Aroon Down", "#ef4444", "line")],
              "levels": [30, 70]},
    "zscore": {"name": "Z-Score del precio", "group": "Estadística", "pane": "pane",
               "params": {"period": 20}, "outputs": [("v", "Z", "#f472b6", "line")], "levels": [-2, 0, 2]},
    "vo": {"name": "Oscilador de volumen", "group": "Volumen", "pane": "pane",
           "params": {"fast": 5, "slow": 10}, "outputs": [("v", "VO %", "#94a3b8", "line")], "levels": [0]},
}


def compute(key, d, p=None, bpy=252):
    """Calcula el indicador `key` sobre las velas `d`. Devuelve {salida: array}."""
    spec = REGISTRY[key]
    prm = dict(spec["params"])
    if p:
        for k, v in p.items():
            if k in prm:
                prm[k] = type(prm[k])(v)
    o, h, l, c, v, t = d["o"], d["h"], d["l"], d["c"], d["v"], d["t"]
    P = prm.get("period")
    if key in ("sma", "ema", "wma", "hma", "dema", "tema"):
        return {"v": globals()[key](c, P)}
    if key == "vwma":
        return {"v": vwma(c, v, P)}
    if key == "vwap":
        intraday = len(t) > 1 and (t[-1] - t[-2]) < 86400
        return {"v": vwap(t, h, l, c, v, intraday)}
    if key == "bb":
        u, m, lo = bollinger(c, P, prm["k"])
        return {"up": u, "mid": m, "lo": lo}
    if key == "keltner":
        u, m, lo = keltner(h, l, c, P, prm["mult"])
        return {"up": u, "mid": m, "lo": lo}
    if key == "donchian":
        u, m, lo = donchian(h, l, P)
        return {"up": u, "mid": m, "lo": lo}
    if key == "ichimoku":
        a, b, x, y = ichimoku(h, l, prm["tenkan"], prm["kijun"], prm["senkou"])
        return {"t": a, "k": b, "a": x, "b": y}
    if key == "psar":
        return {"v": psar(h, l, prm["step"], prm["max"])}
    if key == "supertrend":
        st, dr = supertrend(h, l, c, P, prm["mult"])
        return {"v": st, "dir": dr}
    if key == "linreg":
        return {"v": linreg(c, P)}
    if key == "volume":
        return {"v": v, "ma": sma(v, prm["ma"]), "up": (c >= o).astype(float)}
    if key == "rsi":
        return {"v": rsi(c, P)}
    if key == "macd":
        m, s, hh = macd(c, prm["fast"], prm["slow"], prm["signal"])
        return {"m": m, "s": s, "h": hh}
    if key == "stoch":
        k, dd = stochastic(h, l, c, prm["k"], prm["d"], prm["smooth"])
        return {"k": k, "d": dd}
    if key == "stochrsi":
        k, dd = stoch_rsi(c, P, prm["k"], prm["d"])
        return {"k": k, "d": dd}
    if key == "cci":
        return {"v": cci(h, l, c, P)}
    if key == "willr":
        return {"v": williams_r(h, l, c, P)}
    if key == "roc":
        return {"v": roc(c, P)}
    if key == "mom":
        return {"v": momentum(c, P)}
    if key == "trix":
        return {"v": trix(c, P)}
    if key == "ao":
        return {"v": awesome(h, l)}
    if key == "uo":
        return {"v": ultimate(h, l, c, prm["a"], prm["b"], prm["c"])}
    if key == "mfi":
        return {"v": mfi(h, l, c, v, P)}
    if key == "obv":
        return {"v": obv(c, v)}
    if key == "cmf":
        return {"v": cmf(h, l, c, v, P)}
    if key == "adl":
        return {"v": adl(h, l, c, v)}
    if key == "atr":
        return {"v": atr(h, l, c, P)}
    if key == "hv":
        return {"v": hist_vol(c, P, bpy)}
    if key == "bbw":
        return {"v": bb_width(c, P, prm["k"])}
    if key == "bbp":
        return {"v": bb_percent(c, P, prm["k"])}
    if key == "adx":
        a, pp, nn = adx(h, l, c, P)
        return {"adx": a, "p": pp, "n": nn}
    if key == "aroon":
        u, dd = aroon(h, l, P)
        return {"u": u, "d": dd}
    if key == "zscore":
        return {"v": zscore(c, P)}
    if key == "vo":
        return {"v": volume_osc(v, prm["fast"], prm["slow"])}
    raise KeyError(key)
