"""Mis favoritas: veredicto comprar / mantener / vender por horizonte, con rentabilidad estimada
y los datos técnicos, fundamentales y macroeconómicos que lo justifican.

Modelo (transparente y explicable, no una caja negra):
  * Puntuación técnica, fundamental y macro, cada una en [-1, 1], como media ponderada de factores.
  * Rentabilidad esperada = mezcla de 4 modelos (histórico ajustado, régimen actual, analistas, valoración),
    con pesos que dependen del horizonte. Rango P10–P90 por modelo log-normal con la volatilidad reciente.
  * Puntuación final = técnico/fundamental/macro ponderados por horizonte (a corto manda el técnico,
    a largo los fundamentales) + ventaja de la rentabilidad esperada sobre el mercado ajustada al riesgo.
"""
from __future__ import annotations

import http.cookiejar
import json
import math
import threading
import time
import urllib.parse
import urllib.request

import numpy as np

from . import analysis as A
from . import data as D
from . import indicators as I

DEFAULT = ["NVDA", "AMZN", "AAPL", "SHOP", "EL", "WYNN", "CELH", "NFLX"]
HORIZONS = [1, 3, 6, 12, 24]            # meses
MKT = 0.08                              # rentabilidad anual de referencia del mercado (prior)
# pesos (técnico, fundamental, macro) por horizonte
W_TFM = {1: (.60, .15, .25), 3: (.50, .25, .25), 6: (.35, .40, .25), 12: (.20, .60, .20), 24: (.10, .70, .20)}
# pesos de los modelos de rentabilidad (histórico, régimen, analistas, valoración)
W_RET = {1: (.25, .45, .15, .15), 3: (.25, .35, .25, .15), 6: (.25, .25, .30, .20), 12: (.25, .15, .35, .25), 24: (.30, .10, .25, .35)}
SECTOR_ETF = {"Technology": "XLK", "Consumer Cyclical": "XLY", "Consumer Defensive": "XLP", "Communication Services": "XLC",
              "Healthcare": "XLV", "Financial Services": "XLF", "Industrials": "XLI", "Energy": "XLE", "Utilities": "XLU",
              "Real Estate": "XLRE", "Basic Materials": "XLB"}
SECTOR_ES = {"Technology": "Tecnología", "Consumer Cyclical": "Consumo cíclico", "Consumer Defensive": "Consumo defensivo",
             "Communication Services": "Comunicaciones", "Healthcare": "Salud", "Financial Services": "Financiero",
             "Industrials": "Industria", "Energy": "Energía", "Utilities": "Servicios públicos", "Real Estate": "Inmobiliario",
             "Basic Materials": "Materiales"}
REC_ES = {"strong_buy": "Compra fuerte", "buy": "Comprar", "hold": "Mantener", "underperform": "Infraponderar",
          "sell": "Vender", "none": "—"}


def clip(x, a=-1.0, b=1.0):
    return float(max(a, min(b, x)))


def nz(x):
    return x is not None and not (isinstance(x, float) and (math.isnan(x) or math.isinf(x)))


# --------------------------------------------------------------------------- Yahoo quoteSummary (cookie + crumb)
class _Yahoo:
    def __init__(self):
        self.lock = threading.Lock()
        self.crumb, self.t, self.op = None, 0.0, None
        self.cache: dict = {}

    def _session(self, force=False):
        with self.lock:
            if self.crumb and not force and time.time() - self.t < 3000:
                return self.op, self.crumb
            cj = http.cookiejar.CookieJar()
            op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
            h = {"User-Agent": "Mozilla/5.0"}
            try:
                op.open(urllib.request.Request("https://fc.yahoo.com", headers=h), timeout=10)
            except Exception:  # noqa: BLE001  (devuelve 404 pero deja la cookie)
                pass
            crumb = op.open(urllib.request.Request("https://query2.finance.yahoo.com/v1/test/getcrumb", headers=h),
                            timeout=10).read().decode().strip()
            self.op, self.crumb, self.t = op, crumb, time.time()
            return op, crumb

    def summary(self, sym, modules, ttl=6 * 3600):
        key = (sym, modules)
        hit = self.cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
        last = None
        for force in (False, True):
            try:
                op, crumb = self._session(force)
                url = (f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}"
                       f"?modules={modules}&crumb={urllib.parse.quote(crumb)}")
                js = json.loads(op.open(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=12).read())
                res = js["quoteSummary"]["result"][0]
                self.cache[key] = (time.time(), res)
                return res
            except Exception as e:  # noqa: BLE001
                last = e
        if hit:
            return hit[1]
        raise last


YF = _Yahoo()
MODULES = ("financialData,defaultKeyStatistics,summaryDetail,recommendationTrend,earningsTrend,"
           "assetProfile,calendarEvents,earningsHistory,price")


def _raw(d, k):
    v = (d or {}).get(k)
    if isinstance(v, dict):
        v = v.get("raw")
    return v if nz(v) else None


def fundamentals(sym):
    r = YF.summary(sym, MODULES)
    fd, ks, sd, ap, pr = (r.get(k, {}) for k in ("financialData", "defaultKeyStatistics", "summaryDetail", "assetProfile", "price"))
    f = {
        "name": pr.get("longName") or pr.get("shortName") or sym, "currency": pr.get("currency"),
        "sector": ap.get("sector"), "industry": ap.get("industry"), "employees": ap.get("fullTimeEmployees"),
        "country": ap.get("country"), "website": ap.get("website"),
        "summary": (ap.get("longBusinessSummary") or "")[:700],
        "price": _raw(fd, "currentPrice") or _raw(pr, "regularMarketPrice"),
        "market_cap": _raw(sd, "marketCap") or _raw(pr, "marketCap"),
        "pe": _raw(sd, "trailingPE"), "fpe": _raw(sd, "forwardPE") or _raw(ks, "forwardPE"),
        "ps": _raw(sd, "priceToSalesTrailing12Months") or _raw(ks, "priceToSalesTrailing12Months"),
        "pb": _raw(ks, "priceToBook"), "ev_ebitda": _raw(ks, "enterpriseToEbitda"),
        "peg": _raw(ks, "pegRatio"),
        "rev_growth": _raw(fd, "revenueGrowth"), "eps_growth": _raw(fd, "earningsGrowth"),
        "gross_margin": _raw(fd, "grossMargins"), "op_margin": _raw(fd, "operatingMargins"),
        "net_margin": _raw(fd, "profitMargins"), "roe": _raw(fd, "returnOnEquity"), "roa": _raw(fd, "returnOnAssets"),
        "debt_eq": _raw(fd, "debtToEquity"), "current_ratio": _raw(fd, "currentRatio"),
        "fcf": _raw(fd, "freeCashflow"), "cash": _raw(fd, "totalCash"), "debt": _raw(fd, "totalDebt"),
        "revenue": _raw(fd, "totalRevenue"), "ebitda": _raw(fd, "ebitda"),
        "target_mean": _raw(fd, "targetMeanPrice"), "target_high": _raw(fd, "targetHighPrice"),
        "target_low": _raw(fd, "targetLowPrice"), "rec_mean": _raw(fd, "recommendationMean"),
        "rec_key": fd.get("recommendationKey"), "analysts": _raw(fd, "numberOfAnalystOpinions"),
        "beta": _raw(sd, "beta") or _raw(ks, "beta"), "div_yield": _raw(sd, "dividendYield"),
        "short_float": _raw(ks, "shortPercentOfFloat"), "insiders": _raw(ks, "heldPercentInsiders"),
        "institutions": _raw(ks, "heldPercentInstitutions"),
        "high52": _raw(sd, "fiftyTwoWeekHigh"), "low52": _raw(sd, "fiftyTwoWeekLow"),
    }
    # estimaciones de BPA: crecimiento esperado y revisiones de los últimos 90 días
    for t in (r.get("earningsTrend", {}) or {}).get("trend", []):
        if t.get("period") == "0y":
            f["g_this_year"] = _raw(t, "growth")
            et = t.get("epsTrend", {})
            cur, ago = _raw(et, "current"), _raw(et, "90daysAgo")
            f["eps_rev_90d"] = (cur / ago - 1) if nz(cur) and nz(ago) and ago else None
        elif t.get("period") == "+1y":
            f["g_next_year"] = _raw(t, "growth")
            f["rev_g_next_year"] = _raw(t.get("revenueEstimate", {}), "growth")
    hist = (r.get("earningsHistory", {}) or {}).get("history", [])
    surp = [_raw(h, "surprisePercent") for h in hist if nz(_raw(h, "surprisePercent"))]
    f["beats"] = sum(1 for s in surp if s > 0)
    f["beats_n"] = len(surp)
    f["avg_surprise"] = float(np.mean(surp)) if surp else None
    ed = ((r.get("calendarEvents", {}) or {}).get("earnings", {}) or {}).get("earningsDate", [])
    f["next_earnings"] = ed[0].get("raw") if ed and isinstance(ed[0], dict) else None
    rt = (r.get("recommendationTrend", {}) or {}).get("trend", [])
    if rt:
        z = rt[0]
        f["recs"] = {k: z.get(k, 0) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")}
    f["fcf_yield"] = f["fcf"] / f["market_cap"] if nz(f["fcf"]) and nz(f["market_cap"]) and f["market_cap"] else None
    f["upside"] = f["target_mean"] / f["price"] - 1 if nz(f["target_mean"]) and nz(f["price"]) and f["price"] else None
    return f


# --------------------------------------------------------------------------- factores
def _factor(rows, name, value, fmt, score, reading, weight=1.0):
    if score is None:
        return
    rows.append({"name": name, "value": value, "fmt": fmt, "score": clip(score), "reading": reading, "w": weight})


def _avg(rows):
    w = sum(r["w"] for r in rows)
    return sum(r["score"] * r["w"] for r in rows) / w if w else 0.0


def technical(d, bench_c=None, sector_c=None):
    c, h, l = d["c"], d["h"], d["l"]
    n = len(c)
    px = c[-1]
    s50, s200 = I.sma(c, 50), I.sma(c, 200)
    rsi = I.rsi(c, 14)[-1]
    _, _, hist = I.macd(c)
    adx, pdi, ndi = I.adx(h, l, c, 14)
    atr = I.atr(h, l, c, 14)[-1]
    lr = np.diff(np.log(c))
    vol = float(np.std(lr[-252:], ddof=1) * math.sqrt(252))
    ret = lambda k: float(c[-1] / c[-1 - k] - 1) if n > k else None  # noqa: E731
    r1, r3, r6, r12 = ret(21), ret(63), ret(126), ret(252)
    hi = float(np.max(c[-252:]))
    dd = px / hi - 1
    rows = []
    if nz(s200[-1]):
        x = px / s200[-1] - 1
        _factor(rows, "Precio vs media 200 sesiones", x, "pct", np.tanh(x * 6),
                "Tendencia de fondo alcista" if x > 0 else "Tendencia de fondo bajista", 2)
    if nz(s50[-1]) and nz(s200[-1]):
        x = s50[-1] / s200[-1] - 1
        _factor(rows, "Media 50 vs media 200", x, "pct", np.tanh(x * 10),
                "Cruce dorado (50 > 200)" if x > 0 else "Cruce de la muerte (50 < 200)", 1.5)
    if nz(s50[-1]):
        x = px / s50[-1] - 1
        _factor(rows, "Precio vs media 50 sesiones", x, "pct", np.tanh(x * 8),
                "Por encima: impulso a medio plazo" if x > 0 else "Por debajo: debilidad a medio plazo", 1)
    if nz(rsi):
        sc = (rsi - 50) / 25 if 30 <= rsi <= 70 else (0.5 if rsi < 30 else -0.4)
        rd = ("Sobreventa: posible rebote" if rsi < 30 else "Sobrecompra: riesgo de corrección" if rsi > 70
              else "Fuerza compradora" if rsi > 55 else "Debilidad" if rsi < 45 else "Neutral")
        _factor(rows, "RSI (14)", rsi, "n1", sc, rd, 1)
    if nz(hist[-1]):
        x = hist[-1] / px * 100
        rising = nz(hist[-2]) and hist[-1] > hist[-2]
        _factor(rows, "Histograma MACD", x, "n3", np.tanh(x * 3) * 0.7 + (0.3 if rising else -0.3),
                ("Impulso alcista" if x > 0 else "Impulso bajista") + (" que se acelera" if rising == (x > 0) else " que se frena"), 1)
    if nz(adx[-1]):
        dirn = 1 if pdi[-1] > ndi[-1] else -1
        strength = clip((adx[-1] - 15) / 25, 0, 1)
        _factor(rows, "ADX / DMI", adx[-1], "n1", dirn * strength,
                f"{'Tendencia fuerte' if adx[-1] > 25 else 'Tendencia débil'} {'alcista' if dirn > 0 else 'bajista'}", 1)
    if r3 is not None:
        _factor(rows, "Momento 3 meses", r3, "pct", np.tanh(r3 * 4), "Subida reciente" if r3 > 0 else "Caída reciente", 1)
    if r12 is not None and r1 is not None:
        m = r12 - r1                                                  # momento 12-1 (factor académico clásico)
        _factor(rows, "Momento 12-1 meses", m, "pct", np.tanh(m * 2), "Ganador del último año" if m > 0 else "Perdedor del último año", 1.5)
    _factor(rows, "Distancia al máximo de 52 semanas", dd, "pct", np.tanh((dd + 0.12) * 5),
            "Cerca de máximos (fortaleza)" if dd > -0.08 else "Lejos de máximos" if dd > -0.3 else "Muy castigada (>30 % bajo máximos)", 1)
    if bench_c is not None and len(bench_c) > 126 and n > 126:
        rs = (c[-1] / c[-127]) / (bench_c[-1] / bench_c[-127]) - 1
        _factor(rows, "Fuerza relativa vs S&P 500 (6 m)", rs, "pct", np.tanh(rs * 3),
                "Lo hace mejor que el mercado" if rs > 0 else "Lo hace peor que el mercado", 1.5)
    if sector_c is not None and len(sector_c) > 126 and n > 126:
        rs = (c[-1] / c[-127]) / (sector_c[-1] / sector_c[-127]) - 1
        _factor(rows, "Fuerza relativa vs su sector (6 m)", rs, "pct", np.tanh(rs * 3),
                "Líder de su sector" if rs > 0 else "Rezagada en su sector", 1)
    _factor(rows, "Volatilidad anual", vol, "pct", np.tanh((0.35 - vol) * 3) * 0.6,
            "Baja" if vol < 0.25 else "Moderada" if vol < 0.45 else "Alta: movimientos bruscos", 0.5)
    tt = A.technical_summary({k: v[-1500:] for k, v in d.items()})["total"]
    _factor(rows, f"Resumen de indicadores ({tt['buy']} compra · {tt['neutral']} neutral · {tt['sell']} venta)",
            tt["score"], "n2", tt["score"], tt["label"], 1)
    return {"score": _avg(rows), "rows": rows, "vol": vol, "atr": float(atr) if nz(atr) else None,
            "r1": r1, "r3": r3, "r6": r6, "r12": r12, "dd52": dd, "rsi": float(rsi) if nz(rsi) else None,
            "sma50": float(s50[-1]) if nz(s50[-1]) else None, "sma200": float(s200[-1]) if nz(s200[-1]) else None}


def fundamental(f):
    rows = []
    g = f.get("g_next_year") if nz(f.get("g_next_year")) else f.get("eps_growth")
    if nz(f.get("fpe")) and f["fpe"] > 0:
        peg = f["fpe"] / (g * 100) if nz(g) and g > 0.02 else None
        if peg is not None:
            _factor(rows, "PEG (PER futuro / crecimiento)", peg, "n2", np.tanh((1.6 - peg) * 1.2),
                    "Barata para lo que crece" if peg < 1 else "Precio razonable" if peg < 2 else "Cara para su crecimiento", 2)
        _factor(rows, "PER futuro", f["fpe"], "n1", np.tanh((25 - f["fpe"]) / 15),
                "Bajo" if f["fpe"] < 15 else "Moderado" if f["fpe"] < 25 else "Alto" if f["fpe"] < 45 else "Muy alto", 1)
    elif nz(f.get("fpe")):
        _factor(rows, "PER futuro", f["fpe"], "n1", -0.6, "Pérdidas previstas", 1)
    if nz(f.get("rev_growth")):
        x = f["rev_growth"]
        _factor(rows, "Crecimiento de ventas (interanual)", x, "pct", np.tanh(x * 6),
                "Crecimiento fuerte" if x > 0.15 else "Crecimiento moderado" if x > 0.03 else "Ventas estancadas o cayendo", 1.5)
    if nz(f.get("g_next_year")):
        x = f["g_next_year"]
        _factor(rows, "Crecimiento de BPA esperado (próximo año)", x, "pct", np.tanh(x * 4),
                "Los analistas esperan más beneficios" if x > 0 else "Se esperan menos beneficios", 1.5)
    if nz(f.get("eps_rev_90d")):
        x = f["eps_rev_90d"]
        _factor(rows, "Revisión de estimaciones (90 días)", x, "pct", np.tanh(x * 15),
                "Los analistas suben estimaciones" if x > 0.005 else "Los analistas bajan estimaciones" if x < -0.005 else "Estimaciones estables", 1.5)
    if nz(f.get("net_margin")):
        x = f["net_margin"]
        _factor(rows, "Margen neto", x, "pct", np.tanh((x - 0.08) * 8),
                "Muy rentable" if x > 0.2 else "Rentable" if x > 0.08 else "Márgenes estrechos" if x > 0 else "En pérdidas", 1)
    if nz(f.get("roe")):
        x = f["roe"]
        _factor(rows, "ROE (rentabilidad sobre fondos propios)", x, "pct", np.tanh((x - 0.12) * 5),
                "Excelente" if x > 0.25 else "Buena" if x > 0.12 else "Baja", 1)
    if nz(f.get("debt_eq")):
        x = f["debt_eq"] / 100
        _factor(rows, "Deuda / fondos propios", x, "n2", np.tanh((1.0 - x) * 1.2),
                "Poco endeudada" if x < 0.5 else "Endeudamiento moderado" if x < 1.5 else "Muy endeudada", 1)
    if nz(f.get("fcf_yield")):
        x = f["fcf_yield"]
        _factor(rows, "Rentabilidad por flujo de caja libre", x, "pct", np.tanh((x - 0.02) * 25),
                "Genera mucha caja para su precio" if x > 0.05 else "Genera caja" if x > 0 else "Quema caja", 1)
    if nz(f.get("upside")):
        x = f["upside"]
        _factor(rows, f"Potencial según analistas ({f.get('analysts') or '?'} opiniones)", x, "pct", np.tanh(x * 4),
                f"Precio objetivo medio {f['target_mean']:.2f} (horquilla {f.get('target_low') or 0:.0f}–{f.get('target_high') or 0:.0f})".replace(".", ","), 1.5)
    if nz(f.get("rec_mean")):
        x = f["rec_mean"]
        _factor(rows, "Recomendación media (1 compra fuerte · 5 venta)", x, "n2", clip((3 - x) / 1.5),
                REC_ES.get(f.get("rec_key") or "none", f.get("rec_key") or ""), 1)
    if f.get("beats_n"):
        x = f["beats"] / f["beats_n"]
        _factor(rows, "Resultados por encima de lo esperado", x, "pct", (x - 0.5) * 2 * 0.8,
                f"Batió estimaciones {f['beats']} de {f['beats_n']} trimestres", 0.8)
    if nz(f.get("short_float")):
        x = f["short_float"]
        _factor(rows, "Posiciones cortas (% del capital flotante)", x, "pct", np.tanh((0.05 - x) * 15) * 0.7,
                "Pocos apuestan en contra" if x < 0.05 else "Muchos inversores apuestan a la baja", 0.7)
    return {"score": _avg(rows), "rows": rows}


_macro = {"t": 0.0, "v": None}


def macro():
    if _macro["v"] and time.time() - _macro["t"] < 900:
        return _macro["v"]
    rows = []

    def h(sym):
        d, m = D.history(sym, "1d", "2y")
        return d["c"] if m.get("source") != "demo" and len(d["c"]) > 130 else None

    spx, vix, tnx, dxy = h("^GSPC"), h("^VIX"), h("^TNX"), h("DX-Y.NYB")
    if spx is not None:
        s200 = I.sma(spx, 200)[-1]
        x = spx[-1] / s200 - 1
        _factor(rows, "S&P 500 vs su media de 200 sesiones", x, "pct", np.tanh(x * 8),
                "Mercado en tendencia alcista" if x > 0 else "Mercado en tendencia bajista", 2)
        r3 = spx[-1] / spx[-64] - 1
        _factor(rows, "S&P 500 últimos 3 meses", r3, "pct", np.tanh(r3 * 6), "Viento a favor" if r3 > 0 else "Viento en contra", 1)
    if vix is not None:
        x = vix[-1]
        _factor(rows, "VIX (miedo implícito)", x, "n2", np.tanh((19 - x) / 6),
                "Calma" if x < 15 else "Normal" if x < 20 else "Nervios" if x < 30 else "Pánico", 1.5)
    if tnx is not None:
        ch = tnx[-1] - tnx[-64]
        _factor(rows, "Bono USA 10 años (cambio 3 meses)", ch, "n2", np.tanh(-ch / 0.4),
                f"Tipo al {tnx[-1]:.2f} %: ".replace(".", ",") + ("bajando, favorece a la bolsa" if ch < 0 else "subiendo, presiona valoraciones"), 1.5)
    if dxy is not None:
        ch = dxy[-1] / dxy[-64] - 1
        _factor(rows, "Dólar (DXY, 3 meses)", ch, "pct", np.tanh(-ch * 15) * 0.7,
                "Dólar débil: favorece a multinacionales" if ch < 0 else "Dólar fuerte: resta beneficios exteriores", 0.8)
    try:
        fg = D.fear_greed()
        v = (fg.get("cnn") or fg.get("own") or {}).get("score")
        if nz(v):
            # contrarian suave: miedo extremo = oportunidad a medio plazo, euforia extrema = riesgo
            _factor(rows, "Miedo y euforia (CNN)", v, "n0", clip((50 - v) / 50) * 0.6,
                    "Miedo: históricamente buen momento para comprar con calma" if v < 35 else
                    "Euforia: cuidado con perseguir subidas" if v > 70 else "Sentimiento neutral", 1)
    except Exception:  # noqa: BLE001
        pass
    res = {"score": _avg(rows), "rows": rows}
    _macro.update(t=time.time(), v=res)
    return res


# --------------------------------------------------------------------------- rentabilidad esperada
def _regime_forward(c, months):
    """Rentabilidad futura histórica en situaciones parecidas a hoy (tendencia y RSI)."""
    k = int(round(months * 21))
    n = len(c)
    if n < k + 300:
        return None, None, 0
    s200, rsi = I.sma(c, 200), I.rsi(c, 14)
    fwd = c[k:] / c[:-k] - 1
    idx = np.arange(len(fwd))
    ok = ~np.isnan(s200[idx]) & ~np.isnan(rsi[idx])
    same_trend = (c[idx] > s200[idx]) == (c[-1] > s200[-1])
    near_rsi = np.abs(rsi[idx] - rsi[-1]) < 10
    m = ok & same_trend & near_rsi
    if m.sum() < 40:
        m = ok & same_trend
    if m.sum() < 40:
        return None, None, 0
    sel = fwd[m]
    return float(np.median(sel)), float((sel > 0).mean()), int(m.sum())


def estimate(c, f, months, vol):
    h = months / 12
    lr = np.diff(np.log(c))
    yrs = min(len(lr), 252 * 10)
    mu_hist = float(np.mean(lr[-yrs:]) * 252)                     # deriva log anual (≤10 años)
    mu_hist = 0.5 * mu_hist + 0.5 * MKT                            # contracción hacia el mercado
    models = {}
    models["hist"] = math.exp(mu_hist * h) - 1
    reg, p_reg, n_reg = _regime_forward(c, months)
    models["regime"] = reg
    up = f.get("upside") if f else None
    if nz(up):
        up = clip(up * 0.6, -0.6, 1.0)                              # los objetivos de analistas suelen pecar de optimistas
        models["analysts"] = ((1 + up) ** h - 1) if h <= 1 else (1 + up) * (1 + MKT) ** (h - 1) - 1
    else:
        models["analysts"] = None
    val = None
    if f and nz(f.get("fpe")) and f["fpe"] > 0:
        g = f.get("g_next_year") if nz(f.get("g_next_year")) else f.get("rev_growth")
        g = clip(g if nz(g) else 0.05, -0.2, 0.35)
        ann = 1 / f["fpe"] + 0.6 * g                               # rendimiento por beneficios + crecimiento
        ann -= max(0.0, (f["fpe"] - 30) / 300)                     # castigo por múltiplos muy altos (reversión)
        val = (1 + clip(ann, -0.3, 0.4)) ** h - 1
    models["value"] = val
    wts = dict(zip(("hist", "regime", "analysts", "value"), W_RET[months]))
    tot = sum(wts[k] for k, v in models.items() if v is not None)
    exp = sum(wts[k] * v for k, v in models.items() if v is not None) / tot
    s = vol * math.sqrt(h)
    mu_log = math.log1p(max(exp, -0.95)) - 0.5 * s * s * 0       # mediana ≈ esperado (aprox. conservadora)
    q = lambda z: math.exp(mu_log + z * s) - 1                     # noqa: E731
    p_gbm = A.norm_cdf(mu_log / s) if s > 0 else 0.5
    p_up = p_gbm if p_reg is None else 0.5 * p_gbm + 0.5 * p_reg
    return {"exp": exp, "p10": q(-1.2816), "p25": q(-0.6745), "p75": q(0.6745), "p90": q(1.2816), "p_up": p_up,
            "models": {k: {"value": v, "weight": wts[k] / tot if v is not None else 0} for k, v in models.items()},
            "regime_n": n_reg, "p_regime": p_reg, "p_gbm": p_gbm}


def verdict(score):
    if score >= 0.35:
        return "Compra fuerte", "strong_buy"
    if score >= 0.12:
        return "Comprar", "buy"
    if score > -0.12:
        return "Mantener / esperar", "hold"
    if score > -0.35:
        return "Vender / reducir", "sell"
    return "Venta fuerte", "strong_sell"


def horizon_view(months, tech, fund, mac, est, has_fund):
    wt, wf, wm = W_TFM[months]
    if not has_fund:                                               # ETFs, índices, cripto: sin fundamentales
        wt, wf, wm = wt + wf * 0.6, 0.0, wm + wf * 0.4
    base = wt * tech["score"] + wf * fund["score"] + wm * mac["score"]
    h = months / 12
    edge = (est["exp"] - ((1 + MKT) ** h - 1)) / max(0.05, (est["p90"] - est["p10"]) / 2.56)
    score = clip(0.7 * base + 0.3 * math.tanh(edge * 1.5))
    parts = [tech["score"] * (1 if wt else 0), fund["score"] if wf else None, mac["score"]]
    vals = [p for p in parts if p is not None]
    agree = sum(1 for p in vals if np.sign(p) == np.sign(score)) / len(vals)
    conf = clip(0.35 + 0.4 * agree + 0.25 * min(1, abs(score) / 0.4), 0, 1)
    label, key = verdict(score)
    return {"months": months, "score": score, "verdict": label, "key": key, "confidence": conf,
            "weights": {"tech": wt, "fund": wf, "macro": wm}, "edge": edge, **{k: est[k] for k in ("exp", "p10", "p25", "p75", "p90", "p_up")},
            "models": est["models"], "regime_n": est["regime_n"], "p_regime": est["p_regime"], "p_gbm": est["p_gbm"]}


def _reasons(tech, fund, mac, hv):
    allf = [("Técnico", r) for r in tech["rows"]] + [("Fundamental", r) for r in fund["rows"]] + [("Macro", r) for r in mac["rows"]]
    w = {"Técnico": hv["weights"]["tech"], "Fundamental": hv["weights"]["fund"], "Macro": hv["weights"]["macro"]}
    impact = sorted(allf, key=lambda x: -abs(x[1]["score"] * x[1]["w"] * w[x[0]]))
    pro = [f"{k}: {r['name']} — {r['reading']}" for k, r in impact if r["score"] > 0.15][:6]
    con = [f"{k}: {r['name']} — {r['reading']}" for k, r in impact if r["score"] < -0.15][:6]
    return pro, con


def analyze(sym, light=False):
    sym = sym.upper()
    d, meta = D.history(sym, "1d", "max")
    if len(d["c"]) < 260:
        raise ValueError(f"{sym}: historial insuficiente (se necesita al menos 1 año de cotizaciones)")
    if meta.get("source") == "demo":
        raise ValueError(f"{sym}: sin datos reales (símbolo no encontrado o sin conexión)")
    try:
        f = fundamentals(sym)
    except Exception:  # noqa: BLE001
        f = None
    has_fund = bool(f and (nz(f.get("fpe")) or nz(f.get("rev_growth"))))
    bench = D.history("^GSPC", "1d", "2y")[0]["c"]
    etf = SECTOR_ETF.get((f or {}).get("sector") or "")
    sector_c = D.history(etf, "1d", "2y")[0]["c"] if etf else None
    tech = technical(d, bench, sector_c)
    fund = fundamental(f) if has_fund else {"score": 0.0, "rows": []}
    mac = macro()
    c = d["c"]
    views = []
    for m in HORIZONS:
        est = estimate(c, f if has_fund else None, m, tech["vol"])
        views.append(horizon_view(m, tech, fund, mac, est, has_fund))
    px = float(c[-1])
    out = {"symbol": sym, "name": (f or {}).get("name") or meta.get("name", sym), "price": px,
           "pct": float(c[-1] / c[-2] - 1), "currency": (f or {}).get("currency") or meta.get("currency"),
           "source": meta.get("source"), "time": int(d["t"][-1]),
           "tech_score": tech["score"], "fund_score": fund["score"] if has_fund else None, "macro_score": mac["score"],
           "views": views, "has_fund": has_fund,
           "upside": (f or {}).get("upside"), "fpe": (f or {}).get("fpe"), "rec_key": (f or {}).get("rec_key"),
           "sector": SECTOR_ES.get((f or {}).get("sector") or "", (f or {}).get("sector")),
           "spark": [float(x) for x in c[-126:][::3]]}
    if light:
        return out
    for v in views:
        v["pro"], v["con"] = _reasons(tech, fund, mac, v)
    atr = tech["atr"] or px * 0.02
    out.update(technical=tech, fundamental=fund, macro=mac, profile=f,
               sector_etf=etf, plan={"stop_atr": px - 2.5 * atr, "atr": atr,
                                     "support": float(np.min(d["l"][-63:])), "resistance": float(np.max(d["h"][-252:]))},
               closes=[[int(t), float(x)] for t, x in zip(d["t"][-504:], c[-504:])],
               sma50=[None if not nz(x) else float(x) for x in I.sma(c, 50)[-504:]],
               sma200=[None if not nz(x) else float(x) for x in I.sma(c, 200)[-504:]])
    return out
