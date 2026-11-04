"""Análisis cuantitativo: resumen técnico, probabilidades, estadística, riesgo y sentimiento."""
from __future__ import annotations

import math
import time

import numpy as np

from . import indicators as I

HORIZONS = {  # temporalidad -> [(etiqueta, nº de velas)]
    "1m": [("15 min", 15), ("1 hora", 60), ("4 horas", 240), ("1 día", 390)],
    "5m": [("1 hora", 12), ("4 horas", 48), ("1 día", 78), ("1 semana", 390)],
    "15m": [("1 hora", 4), ("1 día", 26), ("1 semana", 130), ("2 semanas", 260)],
    "30m": [("1 día", 13), ("3 días", 39), ("1 semana", 65), ("2 semanas", 130)],
    "1h": [("4 horas", 4), ("1 día", 7), ("1 semana", 33), ("1 mes", 140)],
    "4h": [("1 día", 2), ("1 semana", 9), ("1 mes", 35), ("3 meses", 105)],
    "1d": [("1 día", 1), ("1 semana", 5), ("1 mes", 21), ("3 meses", 63), ("6 meses", 126), ("1 año", 252)],
    "1wk": [("1 semana", 1), ("1 mes", 4), ("3 meses", 13), ("6 meses", 26), ("1 año", 52)],
    "1mo": [("1 mes", 1), ("3 meses", 3), ("6 meses", 6), ("1 año", 12), ("3 años", 36)],
}


def _f(x, nd=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else round(x, nd)


def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


# --------------------------------------------------------------------------- Resumen técnico
def technical_summary(d):
    c, h, l, v = d["c"], d["h"], d["l"], d["v"]
    px = c[-1]
    rows_ma, rows_osc = [], []

    def vote(cond_buy, cond_sell):
        return "Compra" if cond_buy else "Venta" if cond_sell else "Neutral"

    for n in (10, 20, 30, 50, 100, 200):
        for kind, fn in (("SMA", I.sma), ("EMA", I.ema)):
            val = fn(c, n)[-1]
            if not np.isnan(val):
                rows_ma.append({"name": f"{kind} {n}", "value": _f(val), "signal": vote(px > val, px < val)})
    ich = I.ichimoku(h, l)
    if not np.isnan(ich[1][-1]):
        rows_ma.append({"name": "Ichimoku base (26)", "value": _f(ich[1][-1]),
                        "signal": vote(px > ich[1][-1], px < ich[1][-1])})
    vw = I.vwma(c, v, 20)[-1]
    if not np.isnan(vw):
        rows_ma.append({"name": "VWMA 20", "value": _f(vw), "signal": vote(px > vw, px < vw)})
    hm = I.hma(c, 9)[-1]
    if not np.isnan(hm):
        rows_ma.append({"name": "Hull MA 9", "value": _f(hm), "signal": vote(px > hm, px < hm)})

    r = I.rsi(c, 14)
    rows_osc.append({"name": "RSI (14)", "value": _f(r[-1], 2),
                     "signal": vote(r[-1] < 30 or (r[-1] < 50 and r[-1] > r[-2]),
                                    r[-1] > 70 or (r[-1] > 50 and r[-1] < r[-2]))})
    k, dd = I.stochastic(h, l, c)
    rows_osc.append({"name": "Estocástico %K (14,3,3)", "value": _f(k[-1], 2),
                     "signal": vote(k[-1] < 20 and k[-1] > dd[-1], k[-1] > 80 and k[-1] < dd[-1])})
    cc = I.cci(h, l, c, 20)
    rows_osc.append({"name": "CCI (20)", "value": _f(cc[-1], 2),
                     "signal": vote(cc[-1] < -100 and cc[-1] > cc[-2], cc[-1] > 100 and cc[-1] < cc[-2])})
    a, pdi, ndi = I.adx(h, l, c, 14)
    rows_osc.append({"name": "ADX (14)", "value": _f(a[-1], 2),
                     "signal": vote(a[-1] > 20 and pdi[-1] > ndi[-1], a[-1] > 20 and pdi[-1] < ndi[-1])})
    ao = I.awesome(h, l)
    rows_osc.append({"name": "Awesome Oscillator", "value": _f(ao[-1]),
                     "signal": vote(ao[-1] > 0 and ao[-1] > ao[-2], ao[-1] < 0 and ao[-1] < ao[-2])})
    mo = I.momentum(c, 10)
    rows_osc.append({"name": "Momentum (10)", "value": _f(mo[-1]),
                     "signal": vote(mo[-1] > 0 and mo[-1] > mo[-2], mo[-1] < 0 and mo[-1] < mo[-2])})
    m, s, hh = I.macd(c)
    rows_osc.append({"name": "MACD (12,26,9)", "value": _f(m[-1]), "signal": vote(m[-1] > s[-1], m[-1] < s[-1])})
    sk, sd = I.stoch_rsi(c)
    rows_osc.append({"name": "Stoch RSI (3,3,14,14)", "value": _f(sk[-1], 2),
                     "signal": vote(sk[-1] < 20 and sk[-1] > sd[-1], sk[-1] > 80 and sk[-1] < sd[-1])})
    w = I.williams_r(h, l, c)
    rows_osc.append({"name": "Williams %R (14)", "value": _f(w[-1], 2),
                     "signal": vote(w[-1] < -80 and w[-1] > w[-2], w[-1] > -20 and w[-1] < w[-2])})
    uo = I.ultimate(h, l, c)
    rows_osc.append({"name": "Ultimate Oscillator", "value": _f(uo[-1], 2),
                     "signal": vote(uo[-1] < 30, uo[-1] > 70)})
    mf = I.mfi(h, l, c, v)
    if not np.isnan(mf[-1]):
        rows_osc.append({"name": "MFI (14)", "value": _f(mf[-1], 2), "signal": vote(mf[-1] < 20, mf[-1] > 80)})
    bp = I.bb_percent(c)
    rows_osc.append({"name": "Bollinger %B (20,2)", "value": _f(bp[-1], 3), "signal": vote(bp[-1] < 0, bp[-1] > 1)})
    st, sdir = I.supertrend(h, l, c)
    rows_osc.append({"name": "SuperTrend (10,3)", "value": _f(st[-1]), "signal": vote(sdir[-1] > 0, sdir[-1] < 0)})

    def tally(rows):
        b = sum(r["signal"] == "Compra" for r in rows)
        s_ = sum(r["signal"] == "Venta" for r in rows)
        n = sum(r["signal"] == "Neutral" for r in rows)
        score = (b - s_) / max(len(rows), 1)
        return {"buy": b, "sell": s_, "neutral": n, "score": score, "label": _label(score)}

    t_ma, t_osc = tally(rows_ma), tally(rows_osc)
    total = tally(rows_ma + rows_osc)
    return {"ma": rows_ma, "osc": rows_osc, "tally_ma": t_ma, "tally_osc": t_osc, "total": total}


def _label(score):
    if score > 0.5:
        return "Compra fuerte"
    if score > 0.1:
        return "Compra"
    if score >= -0.1:
        return "Neutral"
    if score >= -0.5:
        return "Venta"
    return "Venta fuerte"


# --------------------------------------------------------------------------- Sentimiento por activo
def asset_sentiment(d):
    """Medidor de miedo/euforia del propio activo (0 = miedo extremo, 100 = euforia extrema)."""
    c, h, l, v = d["c"], d["h"], d["l"], d["v"]
    comps = []
    r = I.rsi(c, 14)[-1]
    comps.append(("RSI(14)", r, f"{r:.1f}"))
    k, _ = I.stochastic(h, l, c)
    comps.append(("Estocástico %K", k[-1], f"{k[-1]:.1f}"))
    bp = I.bb_percent(c)[-1]
    comps.append(("Posición en Bollinger (%B)", float(np.clip(bp * 100, 0, 100)), f"{bp:.2f}"))
    n = min(200, len(c) // 2)
    ma = I.sma(c, n)
    dist = c / ma - 1
    valid = dist[~np.isnan(dist)][-500:]
    if len(valid) > 20:
        comps.append((f"Distancia a media {n}", float((valid < dist[-1]).mean() * 100), f"{dist[-1]*100:+.2f}%"))
    hv = I.hist_vol(c, 20)
    hvv = hv[~np.isnan(hv)][-500:]
    if len(hvv) > 20:
        comps.append(("Volatilidad (inversa)", float(100 - (hvv < hv[-1]).mean() * 100), f"{hv[-1]:.1f}%"))
    m, s, hh = I.macd(c)
    hv2 = hh[~np.isnan(hh)][-500:]
    if len(hv2) > 20:
        comps.append(("Histograma MACD", float((hv2 < hh[-1]).mean() * 100), f"{hh[-1]:.4g}"))
    roc = I.roc(c, 20)
    rv = roc[~np.isnan(roc)][-500:]
    if len(rv) > 20:
        comps.append(("Momento 20 velas", float((rv < roc[-1]).mean() * 100), f"{roc[-1]:+.2f}%"))
    hi = np.max(c[-252:])
    lo = np.min(c[-252:])
    pos = (c[-1] - lo) / (hi - lo) * 100 if hi > lo else 50
    comps.append(("Posición en rango 252 velas", pos, f"{pos:.0f}%"))
    if v.sum() > 0:
        cm = I.cmf(h, l, c, v)[-1]
        if not np.isnan(cm):
            comps.append(("Flujo de dinero (CMF)", float(np.clip(50 + cm * 200, 0, 100)), f"{cm:+.3f}"))
    comps = [(a, float(b), x) for a, b, x in comps if not np.isnan(b)]
    score = float(np.mean([b for _, b, _ in comps])) if comps else 50
    from .data import _rating
    return {"score": score, "rating": _rating(score),
            "components": [{"name": a, "score": b, "value": x, "rating": _rating(b)} for a, b, x in comps]}


# --------------------------------------------------------------------------- Probabilidades
def _logistic_prob(feats, target, x_now, iters=400, lr=0.3, l2=1e-3):
    """Regresión logística con descenso de gradiente (numpy)."""
    mu = feats.mean(axis=0)
    sd = feats.std(axis=0) + 1e-9
    X = (feats - mu) / sd
    X = np.hstack([np.ones((len(X), 1)), X])
    w = np.zeros(X.shape[1])
    y = target.astype(float)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-X @ w))
        g = X.T @ (p - y) / len(y) + l2 * w
        w -= lr * g
    xn = np.concatenate([[1], (x_now - mu) / sd])
    p_now = 1 / (1 + np.exp(-xn @ w))
    p_in = 1 / (1 + np.exp(-X @ w))
    acc = float(((p_in > 0.5) == (y > 0.5)).mean())
    return float(p_now), acc


def probabilities(d, tf, bpy):
    c = d["c"]
    lr = np.diff(np.log(c))
    n = len(c)
    look = min(len(lr), int(bpy))  # ventana de 1 año aprox. para la deriva y la volatilidad
    mu = float(np.mean(lr[-look:]))
    sig = float(np.std(lr[-look:], ddof=1)) if look > 2 else 0.0
    mu_all = float(np.mean(lr))
    sig_all = float(np.std(lr, ddof=1))

    rsi = I.rsi(c, 14)
    sma50 = I.sma(c, min(50, n // 3))
    m, s, hh = I.macd(c)
    bbp = I.bb_percent(c)
    roc10 = I.roc(c, 10)
    hv = I.hist_vol(c, 20, bpy)

    out = []
    for label, hzn in HORIZONS.get(tf, HORIZONS["1d"]):
        if hzn >= n - 30:
            continue
        fwd = c[hzn:] / c[:-hzn] - 1  # rentabilidad futura desde cada vela
        emp = float((fwd > 0).mean())
        # Modelo normal / GBM (deriva del último año)
        if sig > 0:
            z = (mu * hzn) / (sig * math.sqrt(hzn))
            gbm = norm_cdf(z)
        else:
            gbm = 0.5
        # Condicional al régimen actual: RSI parecido y mismo lado de la media 50
        idx = np.arange(len(fwd))
        cond_mask = (~np.isnan(rsi[idx])) & (np.abs(rsi[idx] - rsi[-1]) < 7.5) & \
                    ((c[idx] > sma50[idx]) == (c[-1] > sma50[-1]))
        nc = int(cond_mask.sum())
        cond = float((fwd[cond_mask] > 0).mean()) if nc >= 15 else None
        # Regresión logística sobre indicadores
        F = np.vstack([rsi, hh / c * 100, bbp, roc10, c / sma50 - 1, hv]).T
        ok = ~np.isnan(F[:len(fwd)]).any(axis=1)
        logit = acc = None
        if ok.sum() > 120 and not np.isnan(F[-1]).any():
            logit, acc = _logistic_prob(F[:len(fwd)][ok], fwd[ok] > 0, F[-1])
        models = [emp, gbm] + ([cond] if cond is not None else []) + ([logit] if logit is not None else [])
        weights = [1, 1] + ([1.5] if cond is not None else []) + ([1] if logit is not None else [])
        comb = float(np.average(models, weights=weights))
        q = np.percentile(fwd, [5, 25, 50, 75, 95])
        # Proyección normal centrada en el precio actual
        lo95 = c[-1] * math.exp(mu * hzn - 1.645 * sig * math.sqrt(hzn))
        hi95 = c[-1] * math.exp(mu * hzn + 1.645 * sig * math.sqrt(hzn))
        out.append({
            "label": label, "bars": hzn, "p_up": comb, "p_down": 1 - comb,
            "empirical": emp, "gbm": gbm, "conditional": cond, "cond_n": nc,
            "logistic": logit, "logit_acc": acc,
            "exp_ret": float(np.mean(fwd)), "median_ret": float(q[2]),
            "q": [float(x) for x in q], "range90": [lo95, hi95],
            "p_up5": float((fwd > 0.05).mean()), "p_down5": float((fwd < -0.05).mean()),
        })
    return {"horizons": out, "mu": mu, "sigma": sig, "mu_all": mu_all, "sigma_all": sig_all}


def monte_carlo(d, bpy, horizon=None, paths=2000, seed=7):
    """Simulación por bootstrap de rentabilidades históricas (último año)."""
    c = d["c"]
    lr = np.diff(np.log(c))[-int(min(len(c) - 1, bpy * 2)):]
    horizon = horizon or max(10, min(int(bpy / 4), 120))
    rs = np.random.default_rng(seed)
    sims = rs.choice(lr, size=(paths, horizon), replace=True)
    p = c[-1] * np.exp(np.cumsum(sims, axis=1))
    pct = np.percentile(p, [5, 25, 50, 75, 95], axis=0)
    step = int(np.median(np.diff(d["t"][-50:])))
    times = [int(d["t"][-1] + step * (i + 1)) for i in range(horizon)]
    final = p[:, -1]
    return {"times": times, "bands": {k: [float(x) for x in pct[i]] for i, k in enumerate(["p5", "p25", "p50", "p75", "p95"])},
            "p_up": float((final > c[-1]).mean()), "horizon": horizon,
            "final_q": [float(x) for x in np.percentile(final, [5, 25, 50, 75, 95])],
            "sample": [[float(x) for x in p[i, ::max(1, horizon // 60)]] for i in range(0, 30)]}


# --------------------------------------------------------------------------- Estadística
def statistics(d, bpy, bench=None):
    c, t = d["c"], d["t"]
    r = np.diff(c) / c[:-1]
    lr = np.diff(np.log(c))
    ann_ret = float(np.exp(np.mean(lr) * bpy) - 1)
    ann_vol = float(np.std(lr, ddof=1) * math.sqrt(bpy))
    down = lr[lr < 0]
    dd_vol = float(np.sqrt(np.mean(down ** 2)) * math.sqrt(bpy)) if len(down) else 0
    eq = c / c[0]
    peak = np.maximum.accumulate(eq)
    dd = eq / peak - 1
    mdd = float(dd.min())
    m3 = float(np.mean((lr - lr.mean()) ** 3) / (lr.std() ** 3 + 1e-12))
    m4 = float(np.mean((lr - lr.mean()) ** 4) / (lr.std() ** 4 + 1e-12) - 3)
    var95 = float(np.percentile(r, 5))
    var99 = float(np.percentile(r, 1))
    cvar95 = float(r[r <= var95].mean()) if (r <= var95).any() else var95
    cvar99 = float(r[r <= var99].mean()) if (r <= var99).any() else var99
    pvar95 = -1.645 * float(np.std(r, ddof=1)) + float(np.mean(r))
    hist, edges = np.histogram(r * 100, bins=50)
    sd = float(np.std(r * 100, ddof=1))
    mean = float(np.mean(r * 100))
    width = edges[1] - edges[0]
    normal = [len(r) * width / (sd * math.sqrt(2 * math.pi)) * math.exp(-0.5 * (((edges[i] + edges[i + 1]) / 2 - mean) / sd) ** 2)
              for i in range(len(hist))]
    res = {
        "n": len(c), "first": int(t[0]), "last": int(t[-1]),
        "total_ret": float(c[-1] / c[0] - 1), "ann_ret": ann_ret, "ann_vol": ann_vol,
        "sharpe": ann_ret / ann_vol if ann_vol else None,
        "sortino": ann_ret / dd_vol if dd_vol else None,
        "max_dd": mdd, "calmar": ann_ret / abs(mdd) if mdd else None,
        "skew": m3, "kurt": m4, "pos_bars": float((r > 0).mean()),
        "best": float(r.max()), "worst": float(r.min()), "mean_bar": float(r.mean()),
        "var95": var95, "var99": var99, "cvar95": cvar95, "cvar99": cvar99, "pvar95": pvar95,
        "hist": {"counts": hist.tolist(), "edges": edges.tolist(), "normal": normal},
        "dd_series": [[int(t[i]), float(dd[i])] for i in range(0, len(dd), max(1, len(dd) // 800))],
        "hi52": float(c[-int(min(len(c), bpy)):].max()), "lo52": float(c[-int(min(len(c), bpy)):].min()),
    }
    if bench is not None:
        common, ia, ib = np.intersect1d(t, bench["t"], return_indices=True)
        if len(common) > 30:
            ra = np.diff(np.log(c[ia]))
            rb = np.diff(np.log(bench["c"][ib]))
            cov = np.cov(ra, rb)
            res["beta"] = float(cov[0, 1] / cov[1, 1])
            res["corr"] = float(np.corrcoef(ra, rb)[0, 1])
            res["alpha"] = float((np.mean(ra) - res["beta"] * np.mean(rb)) * bpy)
    return res


def seasonality(d):
    """Rentabilidad media por mes y por día de la semana (datos diarios)."""
    c, t = d["c"], d["t"]
    r = np.diff(c) / c[:-1]
    tt = t[1:]
    months = np.array([time.gmtime(int(x)).tm_mon for x in tt])
    wdays = np.array([time.gmtime(int(x)).tm_wday for x in tt])
    years = np.array([time.gmtime(int(x)).tm_year for x in tt])
    by_month = []
    for m in range(1, 13):
        mk = months == m
        # rentabilidad compuesta de cada mes de cada año
        rets = []
        for y in np.unique(years[mk]):
            sel = mk & (years == y)
            rets.append(float(np.prod(1 + r[sel]) - 1))
        by_month.append({"m": m, "avg": float(np.mean(rets)) if rets else 0,
                         "pos": float(np.mean(np.array(rets) > 0)) if rets else 0, "n": len(rets)})
    by_wday = [{"d": w, "avg": float(r[wdays == w].mean()) if (wdays == w).any() else 0,
                "pos": float((r[wdays == w] > 0).mean()) if (wdays == w).any() else 0}
               for w in range(7)]
    matrix = {}
    for y in np.unique(years):
        row = []
        for m in range(1, 13):
            sel = (years == y) & (months == m)
            row.append(float(np.prod(1 + r[sel]) - 1) if sel.any() else None)
        matrix[int(y)] = row
    return {"month": by_month, "wday": by_wday, "matrix": matrix}


def levels(d):
    """Soportes y resistencias por máximos/mínimos locales agrupados."""
    h, l, c = d["h"], d["l"], d["c"]
    n = len(c)
    w = 5
    pts = []
    for i in range(w, n - w):
        if h[i] == h[i - w:i + w + 1].max():
            pts.append(h[i])
        if l[i] == l[i - w:i + w + 1].min():
            pts.append(l[i])
    if not pts:
        return []
    pts = np.sort(np.array(pts[-200:]))
    tol = np.median(np.abs(np.diff(c[-200:]))) * 3 if n > 3 else 0
    clusters = []
    cur = [pts[0]]
    for p in pts[1:]:
        if p - cur[-1] <= tol:
            cur.append(p)
        else:
            clusters.append(cur)
            cur = [p]
    clusters.append(cur)
    lv = sorted(((float(np.mean(cl)), len(cl)) for cl in clusters), key=lambda x: -x[1])[:8]
    px = c[-1]
    return sorted([{"price": p, "touches": k, "type": "Resistencia" if p > px else "Soporte"} for p, k in lv],
                  key=lambda x: -x["price"])


def correlations(series: dict):
    """Matriz de correlación de rentabilidades diarias."""
    names = list(series)
    common = None
    for s in names:
        common = series[s]["t"] if common is None else np.intersect1d(common, series[s]["t"])
    rets = []
    for s in names:
        _, idx, _ = np.intersect1d(series[s]["t"], common, return_indices=True)
        rets.append(np.diff(np.log(series[s]["c"][idx])))
    m = np.corrcoef(np.vstack(rets)) if len(rets) > 1 else np.array([[1.0]])
    return {"names": names, "matrix": [[_f(x, 3) for x in row] for row in m]}
