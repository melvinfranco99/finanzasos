"""Capa de datos de FinanzasOS.

Fuentes (todas públicas y sin clave API):
  * Yahoo Finance (chart API v8)  -> acciones, índices, ETFs, divisas, materias primas, bonos, cripto
  * Binance (api/v3/klines)        -> cripto en tiempo real (símbolos tipo BTCUSDT)
  * CNN Fear & Greed               -> índice de miedo/euforia del mercado USA
  * alternative.me                 -> índice de miedo/euforia cripto
  * RSS (Yahoo / otras)            -> titulares

Si no hay conexión, se generan datos sintéticos deterministas (modo DEMO) para que
todas las herramientas sigan funcionando en el modo live sin red.
"""
from __future__ import annotations

import hashlib
import json
import math
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import numpy as np

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")

_cache: dict = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=12)


# --------------------------------------------------------------------------- HTTP
def http_get(url: str, ttl: float = 30, headers: dict | None = None, timeout: float = 10):
    """GET con caché en memoria. Devuelve bytes o lanza excepción."""
    now = time.time()
    with _lock:
        hit = _cache.get(url)
        if hit and now - hit[0] < ttl:
            return hit[1]
    h = {"User-Agent": UA, "Accept": "*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    with _lock:
        _cache[url] = (now, body)
        if len(_cache) > 2000:
            for k in sorted(_cache, key=lambda k: _cache[k][0])[:500]:
                _cache.pop(k, None)
    return body


def http_json(url, ttl=30, headers=None, timeout=10):
    return json.loads(http_get(url, ttl, headers, timeout))


YAHOO_HDR = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def yahoo_json(path, ttl):
    """Yahoo con reintento en el host alternativo si hay limitación (429) o error."""
    last = None
    for host in ("query1", "query2"):
        try:
            return http_json(f"https://{host}.finance.yahoo.com{path}", ttl=ttl, headers=YAHOO_HDR)
        except Exception as e:  # noqa: BLE001
            last = e
    raise last


# --------------------------------------------------------------------------- Universo
WATCHLISTS = {
    "Índices": [
        ("^GSPC", "S&P 500"), ("^NDX", "Nasdaq 100"), ("^DJI", "Dow Jones"),
        ("^RUT", "Russell 2000"), ("^IBEX", "IBEX 35"), ("^GDAXI", "DAX 40"),
        ("^STOXX50E", "Euro Stoxx 50"), ("^FTSE", "FTSE 100"), ("^FCHI", "CAC 40"),
        ("FTSEMIB.MI", "FTSE MIB"), ("^N225", "Nikkei 225"), ("^HSI", "Hang Seng"),
        ("000001.SS", "Shanghai Comp."), ("^BVSP", "Bovespa"), ("^MXX", "IPC México"),
        ("^VIX", "VIX Volatilidad"),
    ],
    "Acciones USA": [
        ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("NVDA", "NVIDIA"), ("AMZN", "Amazon"),
        ("GOOGL", "Alphabet"), ("META", "Meta"), ("TSLA", "Tesla"), ("BRK-B", "Berkshire B"),
        ("JPM", "JPMorgan"), ("V", "Visa"), ("JNJ", "Johnson & Johnson"), ("XOM", "Exxon"),
        ("AVGO", "Broadcom"), ("LLY", "Eli Lilly"), ("WMT", "Walmart"), ("KO", "Coca-Cola"),
    ],
    "Acciones Europa": [
        ("SAN.MC", "Santander"), ("BBVA.MC", "BBVA"), ("ITX.MC", "Inditex"),
        ("IBE.MC", "Iberdrola"), ("TEF.MC", "Telefónica"), ("REP.MC", "Repsol"),
        ("ASML.AS", "ASML"), ("SAP.DE", "SAP"), ("MC.PA", "LVMH"), ("NESN.SW", "Nestlé"),
        ("NOVO-B.CO", "Novo Nordisk"), ("SIE.DE", "Siemens"),
    ],
    "ETFs y Fondos": [
        ("SPY", "SPDR S&P 500"), ("QQQ", "Invesco QQQ"), ("VTI", "Vanguard Total Mkt"),
        ("VWCE.DE", "Vanguard FTSE All-World"), ("IWDA.AS", "iShares MSCI World"),
        ("EEM", "MSCI Emergentes"), ("GLD", "SPDR Oro"), ("TLT", "Bonos USA 20+"),
        ("HYG", "High Yield"), ("VNQ", "REITs USA"), ("XLE", "Energía"), ("XLK", "Tecnología"),
    ],
    "Divisas": [
        ("EURUSD=X", "EUR/USD"), ("GBPUSD=X", "GBP/USD"), ("USDJPY=X", "USD/JPY"),
        ("USDCHF=X", "USD/CHF"), ("AUDUSD=X", "AUD/USD"), ("USDCAD=X", "USD/CAD"),
        ("EURGBP=X", "EUR/GBP"), ("EURJPY=X", "EUR/JPY"), ("USDMXN=X", "USD/MXN"),
        ("USDCNY=X", "USD/CNY"), ("DX-Y.NYB", "Índice Dólar DXY"),
    ],
    "Materias primas": [
        ("GC=F", "Oro"), ("SI=F", "Plata"), ("PL=F", "Platino"), ("HG=F", "Cobre"),
        ("CL=F", "Petróleo WTI"), ("BZ=F", "Petróleo Brent"), ("NG=F", "Gas natural"),
        ("ZW=F", "Trigo"), ("ZC=F", "Maíz"), ("ZS=F", "Soja"), ("KC=F", "Café"), ("CC=F", "Cacao"),
    ],
    "Bonos y tipos": [
        ("^IRX", "T-Bill 13 sem."), ("^FVX", "Bono USA 5A"), ("^TNX", "Bono USA 10A"),
        ("^TYX", "Bono USA 30A"), ("ZN=F", "Futuro T-Note 10A"), ("ZB=F", "Futuro T-Bond"),
        ("IEF", "ETF Bonos 7-10A"), ("SHY", "ETF Bonos 1-3A"),
    ],
    "Criptomonedas": [
        ("BTCUSDT", "Bitcoin (Binance)"), ("ETHUSDT", "Ethereum (Binance)"),
        ("SOLUSDT", "Solana (Binance)"), ("BNBUSDT", "BNB (Binance)"),
        ("XRPUSDT", "XRP (Binance)"), ("ADAUSDT", "Cardano (Binance)"),
        ("DOGEUSDT", "Dogecoin (Binance)"), ("AVAXUSDT", "Avalanche (Binance)"),
        ("LINKUSDT", "Chainlink (Binance)"), ("DOTUSDT", "Polkadot (Binance)"),
    ],
}

NAMES = {s: n for lst in WATCHLISTS.values() for s, n in lst}

TICKER_SYMBOLS = ["^GSPC", "^NDX", "^DJI", "^IBEX", "^GDAXI", "^STOXX50E", "^N225",
                  "EURUSD=X", "USDJPY=X", "GC=F", "BZ=F", "^TNX", "^VIX", "BTCUSDT", "ETHUSDT"]

# Temporalidades: intervalo de la API, rango por defecto, segundos por vela
TIMEFRAMES = {
    "1m": ("1m", "5d", 60), "5m": ("5m", "1mo", 300), "15m": ("15m", "1mo", 900),
    "30m": ("30m", "1mo", 1800), "1h": ("60m", "6mo", 3600), "4h": ("60m", "2y", 14400),
    "1d": ("1d", "5y", 86400), "1wk": ("1wk", "max", 604800), "1mo": ("1mo", "max", 2592000),
}
# Rangos máximos que permite Yahoo por intervalo
YAHOO_MAX = {"1m": "5d", "5m": "1mo", "15m": "1mo", "30m": "1mo", "60m": "2y"}
RANGE_DAYS = {"1d": 1, "5d": 5, "1mo": 31, "3mo": 92, "6mo": 183, "ytd": 366, "1y": 366,
              "2y": 731, "5y": 1827, "10y": 3653, "max": 36500}
BINANCE_TF = {"1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h",
              "1d": "1d", "1wk": "1w", "1mo": "1M"}


BINANCE_QUOTES = ("USDT", "USDC", "FDUSD", "TUSD", "BUSD", "EUR", "BTC", "ETH", "BNB", "TRY", "BRL",
                  "JPY", "GBP", "AUD", "MXN", "ARS", "PLN", "RON", "UAH", "ZAR", "IDR", "COP", "CZK", "DAI", "USD1")
_bn = {"t": 0.0, "set": set(), "list": []}

def binance_universe():
    """Todos los pares spot de Binance con su volumen 24 h (caché 1 h). Lista de dicts ordenada por volumen."""
    if time.time() - _bn["t"] < 3600 and _bn["list"]:
        return _bn["list"]
    try:
        rows = http_json("https://api.binance.com/api/v3/ticker/24hr?type=MINI", ttl=3600, timeout=15)
        out = []
        for r in rows:
            sym = r["symbol"]
            q = next((q for q in BINANCE_QUOTES if sym.endswith(q) and len(sym) > len(q)), None)
            if not q or float(r.get("quoteVolume") or 0) <= 0:
                continue
            out.append({"symbol": sym, "base": sym[: -len(q)], "quote": q, "qv": float(r["quoteVolume"]),
                        "price": float(r.get("lastPrice") or 0)})
        out.sort(key=lambda x: -x["qv"])
        _bn.update(t=time.time(), list=out, set={x["symbol"] for x in out})
    except Exception:  # noqa: BLE001
        _bn["t"] = time.time() - 3300          # reintenta en 5 min
    return _bn["list"]


def is_binance(sym: str) -> bool:
    s = sym.upper()
    if not s.isalnum() or len(s) < 5:
        return False
    if _bn["set"]:
        return s in _bn["set"]
    return any(s.endswith(q) and len(s) > len(q) + 1 for q in ("USDT", "USDC", "FDUSD", "BTC"))


CRYPTO_NAMES = {"bitcoin": "BTC", "ethereum": "ETH", "ether": "ETH", "solana": "SOL", "ripple": "XRP", "cardano": "ADA",
                "dogecoin": "DOGE", "polkadot": "DOT", "chainlink": "LINK", "litecoin": "LTC", "avalanche": "AVAX",
                "polygon": "POL", "tron": "TRX", "shiba": "SHIB", "binance": "BNB", "toncoin": "TON", "stellar": "XLM",
                "cosmos": "ATOM", "uniswap": "UNI", "aave": "AAVE", "near": "NEAR", "aptos": "APT", "arbitrum": "ARB",
                "optimism": "OP", "sui": "SUI", "pepe": "PEPE", "monero": "XMR", "filecoin": "FIL", "render": "RENDER",
                "injective": "INJ", "kaspa": "KAS", "hedera": "HBAR", "algorand": "ALGO", "tezos": "XTZ"}
TYPE_ES = {"EQUITY": "Acción", "ETF": "ETF", "MUTUALFUND": "Fondo", "INDEX": "Índice", "CURRENCY": "Divisa",
           "CRYPTOCURRENCY": "Cripto", "FUTURE": "Futuro", "OPTION": "Opción", "MONEYMARKET": "Monetario"}


def search(q: str, limit: int = 25):
    """Busca en las listas propias, en todos los pares de Binance y en todo Yahoo Finance."""
    q = q.strip()
    if not q:
        return []
    ql, qu = q.lower(), q.upper().replace("/", "").replace("-", "").replace(" ", "")
    out, seen = [], set()

    def add(sym, name, typ, exch, source):
        if sym.upper() not in seen:
            seen.add(sym.upper())
            out.append({"symbol": sym, "name": name, "type": typ, "exch": exch, "source": source})

    for cls, items in WATCHLISTS.items():                       # 1) listas propias (nombres en español)
        for sym, name in items:
            if ql in name.lower() or sym.upper().startswith(q.upper()):
                add(sym, name, cls, "Lista FinanzasOS", "binance" if is_binance(sym) else "yahoo")
    bases = {CRYPTO_NAMES[k] for k in CRYPTO_NAMES if k.startswith(ql) and len(ql) >= 3}
    yres = []
    try:                                                         # 2) Yahoo (acciones, ETFs, fondos, índices, FX, futuros)
        js = yahoo_json(f"/v1/finance/search?q={urllib.parse.quote(q)}&quotesCount=20&newsCount=0"
                        f"&enableFuzzyQuery=true&lang=es-ES&region=ES", ttl=600)
        yres = js.get("quotes", [])
        for r in yres:
            if r.get("quoteType") == "CRYPTOCURRENCY" and "-" in r.get("symbol", ""):
                bases.add(r["symbol"].split("-")[0])
    except Exception:  # noqa: BLE001
        pass
    uni = binance_universe()                                     # 3) Binance: pares de esas monedas o que empiecen así
    prio = {q: i for i, q in enumerate(("USDT", "USDC", "EUR", "FDUSD", "BTC", "ETH", "BNB"))}
    hits = [x for x in uni if x["base"] in bases or x["symbol"].startswith(qu) or x["base"] == qu]
    hits.sort(key=lambda x: (x["symbol"] != qu, x["base"] not in bases and x["base"] != qu,
                             prio.get(x["quote"], 99), -x["qv"]))
    for x in hits[:10]:
        add(x["symbol"], f'{x["base"]} / {x["quote"]}', "Cripto", "Binance · tiempo real", "binance")
    for r in yres:
        sym = r.get("symbol")
        if not sym:
            continue
        add(sym, r.get("longname") or r.get("shortname") or sym, TYPE_ES.get(r.get("quoteType"), r.get("quoteType", "")),
            r.get("exchDisp") or r.get("exchange", ""), "yahoo")
    return out[:limit]


def bars_per_year(tf: str, symbol: str = "") -> float:
    crypto = is_binance(symbol) or symbol.upper().endswith("-USD")
    days = 365 if crypto else 252
    hours = 24 if crypto else 6.5
    return {"1m": days * hours * 60, "5m": days * hours * 12, "15m": days * hours * 4,
            "30m": days * hours * 2, "1h": days * hours, "4h": days * hours / 4,
            "1d": days, "1wk": 52, "1mo": 12}.get(tf, days)


# --------------------------------------------------------------------------- Velas
def _clean(t, o, h, l, c, v):
    arr = np.array([t, o, h, l, c, v], dtype=float)
    ok = ~np.isnan(arr[1:5]).any(axis=0)
    arr = arr[:, ok]
    arr[5] = np.nan_to_num(arr[5])
    # Ordenar y quitar duplicados
    _, idx = np.unique(arr[0], return_index=True)
    arr = arr[:, idx]
    return {"t": arr[0].astype(np.int64), "o": arr[1], "h": arr[2], "l": arr[3],
            "c": arr[4], "v": arr[5]}


def _resample(d, seconds):
    """Agrupa velas (p.ej. 1h -> 4h)."""
    if len(d["t"]) == 0:
        return d
    key = d["t"] // seconds
    out = {k: [] for k in "tohlcv"}
    start = 0
    n = len(key)
    for i in range(1, n + 1):
        if i == n or key[i] != key[start]:
            sl = slice(start, i)
            out["t"].append(d["t"][start])
            out["o"].append(d["o"][start])
            out["h"].append(d["h"][sl].max())
            out["l"].append(d["l"][sl].min())
            out["c"].append(d["c"][i - 1])
            out["v"].append(d["v"][sl].sum())
            start = i
    return {k: np.array(v, dtype=np.int64 if k == "t" else float) for k, v in out.items()}


def _yahoo_history(symbol, tf, rng):
    interval, default_rng, _ = TIMEFRAMES[tf]
    rng = rng or default_rng
    mx = YAHOO_MAX.get(interval)
    if mx and RANGE_DAYS.get(rng, 0) > RANGE_DAYS[mx]:
        rng = mx
    ttl = 15 if tf in ("1m", "5m") else 60 if tf in ("15m", "30m", "1h", "4h") else 300
    if interval in ("1d", "1wk", "1mo"):
        # Con range=max Yahoo reduce la resolución; con period1/period2 respeta el intervalo.
        now = int(time.time())
        p1 = -1325635200 if rng == "max" else now - RANGE_DAYS.get(rng, 366) * 86400
        span = f"period1={p1}&period2={now + 86400}"
    else:
        span = f"range={rng}"
    js = yahoo_json(f"/v8/finance/chart/{urllib.parse.quote(symbol)}"
                    f"?interval={interval}&{span}&includePrePost=false&events=div%2Csplits", ttl)
    res = js["chart"]["result"][0]
    q = res["indicators"]["quote"][0]
    t = res.get("timestamp") or []
    if not t:
        raise ValueError("sin datos")
    d = _clean(t, q["open"], q["high"], q["low"], q["close"], q["volume"])
    if tf == "4h":
        d = _resample(d, 14400)
    meta = res["meta"]
    return d, {"name": meta.get("longName") or meta.get("shortName") or NAMES.get(symbol, symbol),
               "currency": meta.get("currency", ""), "exchange": meta.get("fullExchangeName", ""),
               "type": meta.get("instrumentType", ""), "range": rng}


def _binance_history(symbol, tf, rng):
    interval = BINANCE_TF[tf]
    _, default_rng, sec = TIMEFRAMES[tf]
    rng = rng or default_rng
    days = RANGE_DAYS.get(rng, 365)
    need = min(int(days * 86400 / sec) + 1, 6000)
    rows = []
    end = None
    ttl = 10 if tf in ("1m", "5m") else 60
    while len(rows) < need:
        lim = min(1000, need - len(rows))
        url = (f"https://api.binance.com/api/v3/klines?symbol={symbol.upper()}"
               f"&interval={interval}&limit={lim}" + (f"&endTime={end}" if end else ""))
        batch = http_json(url, ttl=ttl)
        if not batch:
            break
        rows = batch + rows
        end = batch[0][0] - 1
        if len(batch) < lim:
            break
    if not rows:
        raise ValueError("sin datos")
    a = np.array([[r[0] / 1000, r[1], r[2], r[3], r[4], r[5]] for r in rows], dtype=float).T
    d = _clean(*a)
    su = symbol.upper()
    quote = next((q for q in BINANCE_QUOTES if su.endswith(q) and len(su) > len(q)), "USDT")
    return d, {"name": NAMES.get(su, f"{su[:-len(quote)]} / {quote}"), "currency": quote,
               "exchange": "Binance", "type": "CRYPTOCURRENCY", "range": rng}


def _demo_history(symbol, tf, rng):
    """Serie sintética (movimiento browniano geométrico con régimen) para modo sin red."""
    _, default_rng, sec = TIMEFRAMES[tf]
    rng = rng or default_rng
    n = min(int(RANGE_DAYS.get(rng, 365) * (86400 / sec) * (5 / 7 if sec >= 86400 else 0.27)) + 50, 3000)
    n = max(n, 300)
    seed = int(hashlib.md5(f"{symbol}{tf}".encode()).hexdigest()[:8], 16)
    rs = np.random.default_rng(seed)
    sig = 0.012 * math.sqrt(sec / 86400) if sec < 86400 else 0.012 * math.sqrt(sec / 86400)
    drift = 0.0003 * sec / 86400
    regime = np.repeat(rs.normal(0, 1, n // 60 + 2), 60)[:n] * sig * 0.15
    r = rs.standard_t(4, n) * sig / math.sqrt(2) + drift + regime
    c = 100 * np.exp(np.cumsum(r))
    o = np.concatenate([[c[0]], c[:-1]])
    spread = np.abs(rs.normal(0, sig * 0.6, n)) * c
    h = np.maximum(o, c) + spread
    l = np.minimum(o, c) - spread
    v = (rs.lognormal(13, 0.4, n) * (1 + 8 * np.abs(r) / sig * 0.1)).round()
    now = int(time.time()) // sec * sec
    t = now - sec * np.arange(n)[::-1]
    return ({"t": t.astype(np.int64), "o": o, "h": h, "l": l, "c": c, "v": v},
            {"name": NAMES.get(symbol, symbol) + " (DEMO)", "currency": "", "exchange": "Sintético",
             "type": "DEMO", "range": rng})


def history(symbol: str, tf: str = "1d", rng: str | None = None):
    """Devuelve (velas, meta). meta['source'] indica la fuente."""
    if tf not in TIMEFRAMES:
        tf = "1d"
    symbol = symbol.strip()
    try:
        if is_binance(symbol):
            d, m = _binance_history(symbol, tf, rng)
            m["source"] = "binance"
        else:
            d, m = _yahoo_history(symbol, tf, rng)
            m["source"] = "yahoo"
    except Exception as e:  # noqa: BLE001 - cualquier fallo de red => demo
        d, m = _demo_history(symbol, tf, rng)
        m["source"] = "demo"
        m["error"] = str(e)[:200]
    m.update(symbol=symbol, tf=tf)
    return d, m


def history_range(symbol, tf, start=None, end=None, rng=None):
    """Historial filtrado por fechas (YYYY-MM-DD)."""
    if (start or end) and not rng:
        days = (time.time() - _ts(start)) / 86400 if start else 365
        rng = next((k for k in ("1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max")
                    if RANGE_DAYS[k] >= days), "max")
    d, m = history(symbol, tf, rng)
    mask = np.ones(len(d["t"]), bool)
    if start:
        mask &= d["t"] >= _ts(start)
    if end:
        mask &= d["t"] <= _ts(end) + 86399
    return {k: v[mask] for k, v in d.items()}, m


def _ts(s):
    return int(time.mktime(time.strptime(s[:10], "%Y-%m-%d")))


# --------------------------------------------------------------------------- Cotizaciones
def _quote_one(sym):
    try:
        if is_binance(sym):
            js = http_json(f"https://api.binance.com/api/v3/ticker/24hr?symbol={sym.upper()}", ttl=5)
            kl = http_json(f"https://api.binance.com/api/v3/klines?symbol={sym.upper()}&interval=1h&limit=24", ttl=60)
            price = float(js["lastPrice"])
            prev = float(js["openPrice"])
            return {"symbol": sym, "name": NAMES.get(sym.upper(), sym), "price": price,
                    "prev": prev, "change": price - prev, "pct": float(js["priceChangePercent"]),
                    "high": float(js["highPrice"]), "low": float(js["lowPrice"]),
                    "volume": float(js["quoteVolume"]), "currency": "USDT",
                    "spark": [float(k[4]) for k in kl], "source": "binance", "time": int(time.time())}
        js = yahoo_json(f"/v8/finance/chart/{urllib.parse.quote(sym)}?interval=5m&range=1d", 20)
        res = js["chart"]["result"][0]
        meta = res["meta"]
        closes = [c for c in (res["indicators"]["quote"][0].get("close") or []) if c is not None]
        price = meta.get("regularMarketPrice") or (closes[-1] if closes else None)
        prev = meta.get("chartPreviousClose") or meta.get("previousClose") or price
        return {"symbol": sym, "name": NAMES.get(sym) or meta.get("shortName") or sym,
                "price": price, "prev": prev, "change": price - prev,
                "pct": (price / prev - 1) * 100 if prev else 0,
                "high": meta.get("regularMarketDayHigh"), "low": meta.get("regularMarketDayLow"),
                "volume": meta.get("regularMarketVolume"), "currency": meta.get("currency", ""),
                "spark": closes[-78:], "source": "yahoo", "time": meta.get("regularMarketTime")}
    except Exception:  # noqa: BLE001
        d, _ = _demo_history(sym, "1d", "1mo")
        c = d["c"]
        return {"symbol": sym, "name": NAMES.get(sym, sym) + " (DEMO)", "price": float(c[-1]),
                "prev": float(c[-2]), "change": float(c[-1] - c[-2]),
                "pct": float((c[-1] / c[-2] - 1) * 100), "high": float(d["h"][-1]),
                "low": float(d["l"][-1]), "volume": float(d["v"][-1]), "currency": "",
                "spark": [float(x) for x in c[-30:]], "source": "demo", "time": int(time.time())}


def quotes(symbols):
    return list(_pool.map(_quote_one, symbols))


# --------------------------------------------------------------------------- Miedo / Euforia
def _rating(score):
    if score < 25:
        return "Miedo extremo"
    if score < 45:
        return "Miedo"
    if score <= 55:
        return "Neutral"
    if score <= 75:
        return "Euforia"
    return "Euforia extrema"


RATING_ES = {"extreme fear": "Miedo extremo", "fear": "Miedo", "neutral": "Neutral",
             "greed": "Euforia", "extreme greed": "Euforia extrema"}


def _pct_rank(series, value):
    s = series[~np.isnan(series)]
    if len(s) < 10:
        return 50.0
    return float((s < value).mean() * 100)


def _own_market_fg():
    """Reconstrucción propia (metodología tipo CNN) con datos de Yahoo."""
    syms = ["^GSPC", "^VIX", "RSP", "SPY", "TLT", "HYG", "IEF"]
    data = dict(zip(syms, _pool.map(lambda s: history(s, "1d", "2y")[0]["c"], syms)))
    sp, vix = data["^GSPC"], data["^VIX"]
    comps = []

    def roll_mean(x, n):
        c = np.cumsum(np.insert(x, 0, 0))
        out = np.full(len(x), np.nan)
        out[n - 1:] = (c[n:] - c[:-n]) / n
        return out

    def chg(x, n):
        out = np.full(len(x), np.nan)
        out[n:] = x[n:] / x[:-n] - 1
        return out

    mom = sp / roll_mean(sp, 125) - 1
    comps.append(("Momento S&P 500 vs media 125d", _pct_rank(mom[-252:], mom[-1]), f"{mom[-1]*100:+.2f}%"))
    hi = np.maximum.accumulate(sp[-252:])
    strength = sp[-252:] / hi - 1
    comps.append(("Fuerza: distancia a máximo 52s", _pct_rank(strength, strength[-1]), f"{strength[-1]*100:+.2f}%"))
    n = min(len(data["RSP"]), len(data["SPY"]))
    breadth = chg(data["RSP"][-n:] / data["SPY"][-n:], 20)
    comps.append(("Amplitud: equiponderado vs S&P (20d)", _pct_rank(breadth[-252:], breadth[-1]), f"{breadth[-1]*100:+.2f}%"))
    vr = vix / roll_mean(vix, 50) - 1
    comps.append(("Volatilidad: VIX vs media 50d", 100 - _pct_rank(vr[-252:], vr[-1]), f"VIX {vix[-1]:.2f}"))
    n = min(len(data["SPY"]), len(data["TLT"]))
    sh = chg(data["SPY"][-n:], 20) - chg(data["TLT"][-n:], 20)
    comps.append(("Refugio: acciones − bonos (20d)", _pct_rank(sh[-252:], sh[-1]), f"{sh[-1]*100:+.2f}%"))
    n = min(len(data["HYG"]), len(data["IEF"]))
    jb = chg(data["HYG"][-n:] / data["IEF"][-n:], 20)
    comps.append(("Demanda bonos basura (HYG/IEF)", _pct_rank(jb[-252:], jb[-1]), f"{jb[-1]*100:+.2f}%"))
    from . import indicators as ind
    r = ind.rsi(sp, 14)[-1]
    comps.append(("RSI(14) S&P 500", float(r), f"{r:.1f}"))
    score = float(np.mean([c[1] for c in comps]))
    return {"score": score, "rating": _rating(score),
            "components": [{"name": a, "score": b, "rating": _rating(b), "value": v} for a, b, v in comps]}


def fear_greed():
    out = {}
    try:
        js = http_json("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", ttl=600,
                       headers={"Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"})
        fg = js["fear_and_greed"]
        names = {"market_momentum_sp500": "Momento del mercado (S&P 500)",
                 "stock_price_strength": "Fuerza de precios (máx/mín 52s)",
                 "stock_price_breadth": "Amplitud de mercado (McClellan)",
                 "put_call_options": "Opciones Put/Call",
                 "market_volatility_vix": "Volatilidad (VIX)",
                 "safe_haven_demand": "Demanda de activos refugio",
                 "junk_bond_demand": "Demanda de bonos basura"}
        out["cnn"] = {
            "score": fg["score"], "rating": RATING_ES.get(fg["rating"], fg["rating"]),
            "prev_close": fg.get("previous_close"), "week": fg.get("previous_1_week"),
            "month": fg.get("previous_1_month"), "year": fg.get("previous_1_year"),
            "components": [{"name": v, "score": js[k]["score"],
                            "rating": RATING_ES.get(js[k]["rating"], js[k]["rating"])}
                           for k, v in names.items() if k in js],
            "history": [[int(p["x"] / 1000), p["y"]] for p in js["fear_and_greed_historical"]["data"]],
        }
    except Exception as e:  # noqa: BLE001
        out["cnn_error"] = str(e)[:120]
    try:
        js = http_json("https://api.alternative.me/fng/?limit=365", ttl=900)
        d = js["data"]
        out["crypto"] = {"score": float(d[0]["value"]),
                         "rating": RATING_ES.get(d[0]["value_classification"].lower(), d[0]["value_classification"]),
                         "prev_close": float(d[1]["value"]), "week": float(d[7]["value"]),
                         "month": float(d[30]["value"]),
                         "history": [[int(p["timestamp"]), float(p["value"])] for p in reversed(d)]}
    except Exception as e:  # noqa: BLE001
        out["crypto_error"] = str(e)[:120]
    try:
        out["own"] = _own_market_fg()
    except Exception as e:  # noqa: BLE001
        out["own_error"] = str(e)[:120]
    return out


# --------------------------------------------------------------------------- Noticias
FEEDS = [
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    ("CNBC Markets", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258"),
    ("Investing.com", "https://www.investing.com/rss/news_25.rss"),
    ("Expansión Mercados", "https://e00-expansion.uecdn.es/rss/mercados.xml"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
]


def _feed(src_url):
    src, url = src_url
    try:
        root = ET.fromstring(http_get(url, ttl=600, timeout=8))
        items = []
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            if title:
                items.append({"source": src, "title": title, "link": (it.findtext("link") or "").strip(),
                              "date": (it.findtext("pubDate") or "").strip()})
            if len(items) >= 12:
                break
        return items
    except Exception:  # noqa: BLE001
        return []


def news():
    out = []
    for items in _pool.map(_feed, FEEDS):
        out.extend(items)
    return out
