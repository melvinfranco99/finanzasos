"""Servidor local de FinanzasOS (http://127.0.0.1:8765)."""
from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from flask import Flask, Response, jsonify, request, send_from_directory

from . import analysis as A
from . import backtest as B
from . import data as D
from . import favorites as F
from . import indicators as I

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(HERE, "static"), static_url_path="/static")
pool = ThreadPoolExecutor(max_workers=8)


def clean(o):
    """Convierte numpy/NaN a JSON válido."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(x) for x in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def ok(obj):
    return Response(json.dumps(clean(obj), ensure_ascii=False, separators=(",", ":")),
                    mimetype="application/json")


def err(msg, code=400):
    return Response(json.dumps({"error": msg}, ensure_ascii=False), status=code, mimetype="application/json")


@app.after_request
def no_cache(resp):
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# --------------------------------------------------------------------------- Mercado
@app.route("/api/watchlists")
def watchlists():
    return ok({"lists": D.WATCHLISTS, "timeframes": list(D.TIMEFRAMES), "ticker": D.TICKER_SYMBOLS})


@app.route("/api/quotes")
def quotes():
    syms = [s for s in request.args.get("symbols", "").split(",") if s][:80]
    group = request.args.get("group")
    if group and group in D.WATCHLISTS:
        syms = [s for s, _ in D.WATCHLISTS[group]]
    return ok(D.quotes(syms))


@app.route("/api/ticker")
def ticker():
    return ok({"quotes": D.quotes(D.TICKER_SYMBOLS), "time": int(time.time())})


@app.route("/api/feargreed")
def feargreed():
    return ok(D.fear_greed())


@app.route("/api/news")
def news():
    return ok(D.news())


@app.route("/api/indicators")
def indicator_list():
    return ok({k: {"name": v["name"], "group": v["group"], "pane": v["pane"], "params": v["params"],
                   "outputs": v["outputs"], "levels": v.get("levels", [])} for k, v in I.REGISTRY.items()})


@app.route("/api/chart")
def chart():
    sym = request.args.get("symbol", "^GSPC")
    tf = request.args.get("tf", "1d")
    rng = request.args.get("range") or None
    ind_req = json.loads(request.args.get("ind", "[]"))
    d, meta = D.history(sym, tf, rng)
    if len(d["c"]) < 2:
        return err("Sin datos para " + sym, 404)
    bpy = D.bars_per_year(tf, sym)
    inds = []
    for it in ind_req:
        key = it.get("key")
        if key not in I.REGISTRY:
            continue
        try:
            outs = I.compute(key, d, it.get("params"), bpy)
            inds.append({"id": it.get("id", key), "key": key, "outputs": outs})
        except Exception as e:  # noqa: BLE001
            inds.append({"id": it.get("id", key), "key": key, "error": str(e)})
    c = d["c"]
    prev = c[-2]
    return ok({
        "meta": meta, "t": d["t"], "o": d["o"], "h": d["h"], "l": d["l"], "c": c, "v": d["v"],
        "indicators": inds,
        "last": {"price": c[-1], "change": c[-1] - prev, "pct": (c[-1] / prev - 1) * 100,
                 "high": d["h"][-1], "low": d["l"][-1], "volume": d["v"][-1]},
    })


@app.route("/api/analysis")
def analysis():
    sym = request.args.get("symbol", "^GSPC")
    tf = request.args.get("tf", "1d")
    d, meta = D.history(sym, tf, request.args.get("range") or ("max" if tf in ("1d", "1wk", "1mo") else None))
    if len(d["c"]) < 60:
        return err("Historial insuficiente para analizar " + sym)
    bpy = D.bars_per_year(tf, sym)
    bench = None
    if tf == "1d" and sym != "^GSPC":
        try:
            bench = D.history("^GSPC", "1d", "max")[0]
            bench = {"t": bench["t"] // 86400, "c": bench["c"]}
        except Exception:  # noqa: BLE001
            bench = None
    dd = dict(d)
    stats_d = {"t": d["t"] // 86400 if bench else d["t"], "c": d["c"]}
    stats = A.statistics(stats_d, bpy, bench)
    if bench:
        stats["first"], stats["last"] = int(d["t"][0]), int(d["t"][-1])
        stats["dd_series"] = [[int(x[0]) * 86400, x[1]] for x in stats["dd_series"]]
    recent = {k: v[-1500:] for k, v in dd.items()}
    piv = I.pivots(d["h"][-2], d["l"][-2], d["c"][-2])
    return ok({
        "meta": meta, "price": d["c"][-1], "pct": (d["c"][-1] / d["c"][-2] - 1) * 100,
        "summary": A.technical_summary(recent),
        "sentiment": A.asset_sentiment(recent),
        "prob": A.probabilities(d, tf, bpy),
        "mc": A.monte_carlo(d, bpy),
        "stats": stats,
        "season": A.seasonality(d) if tf == "1d" else None,
        "pivots": piv, "levels": A.levels({k: v[-400:] for k, v in dd.items()}),
        "closes": [[int(t), float(c)] for t, c in zip(d["t"][-300:], d["c"][-300:])],
    })


@app.route("/api/summary")
def summary():
    """Resumen técnico ligero para el panel lateral del gráfico."""
    sym = request.args.get("symbol", "^GSPC")
    tf = request.args.get("tf", "1d")
    d, meta = D.history(sym, tf, request.args.get("range") or None)
    if len(d["c"]) < 60:
        return err("Historial insuficiente")
    recent = {k: v[-1500:] for k, v in d.items()}
    return ok({"summary": A.technical_summary(recent), "sentiment": A.asset_sentiment(recent),
               "pivots": I.pivots(d["h"][-2], d["l"][-2], d["c"][-2]), "levels": A.levels({k: v[-400:] for k, v in d.items()})})


@app.route("/api/correlations")
def correlations():
    syms = request.args.get("symbols", "^GSPC,^NDX,^IBEX,GC=F,CL=F,EURUSD=X,^TNX,BTC-USD").split(",")[:14]
    res = dict(zip(syms, pool.map(lambda s: D.history(s, "1d", "1y")[0], syms)))
    series = {s: {"t": v["t"] // 86400, "c": v["c"]} for s, v in res.items() if len(v["c"]) > 20}
    return ok(A.correlations(series))


# --------------------------------------------------------------------------- Backtesting
@app.route("/api/presets")
def presets():
    return ok({"presets": B.PRESETS, "ops": B.OPS})


def _bt_data(body):
    sym = body.get("symbol", "^GSPC")
    tf = body.get("tf", "1d")
    d, meta = D.history_range(sym, tf, body.get("start") or None, body.get("end") or None, body.get("range") or None)
    if len(d["c"]) < 30:
        raise ValueError("Datos insuficientes en ese rango (se necesitan ≥ 30 velas). Prueba un rango mayor "
                         "o una temporalidad diaria (Yahoo limita el intradía: 1m→7 días, 5-30m→60 días, 1h→2 años).")
    return d, meta, D.bars_per_year(tf, sym)


@app.route("/api/backtest", methods=["POST"])
def backtest():
    body = request.get_json(force=True)
    try:
        d, meta, bpy = _bt_data(body)
        if body.get("mode") == "custom":
            strat = {"entry": body.get("entry", []), "exit": body.get("exit", []),
                     "short_entry": body.get("short_entry", []), "short_exit": body.get("short_exit", []),
                     "entry_logic": body.get("entry_logic", "and"), "exit_logic": body.get("exit_logic", "or")}
        else:
            strat = B.preset_rules(body.get("preset", "ma_cross"), body.get("params", {}))
        res = B.run(d, strat, body.get("cfg", {}), bpy)
        res["meta"] = meta
        res["candles"] = {"t": d["t"], "o": d["o"], "h": d["h"], "l": d["l"], "c": d["c"]}
        return ok(res)
    except Exception as e:  # noqa: BLE001
        return err(str(e))


@app.route("/api/optimize", methods=["POST"])
def optimize():
    body = request.get_json(force=True)
    try:
        d, meta, bpy = _bt_data(body)
        res = B.optimize(d, body.get("preset", "ma_cross"), body.get("params", {}), body.get("grid", {}),
                         body.get("cfg", {}), bpy, body.get("objective", "sharpe"),
                         float(body.get("split", 0.7)), body.get("sl_grid"), body.get("tp_grid"),
                         min_trades=int(body.get("min_trades", 3)))
        res["meta"] = meta
        return ok(res)
    except Exception as e:  # noqa: BLE001
        return err(str(e))


@app.route("/api/search")
def search():
    return ok({"results": D.search(request.args.get("q", ""))})


@app.route("/guia")
def guia():
    """Guía práctica (el mismo archivo que se publica como web)."""
    path = os.path.join(os.path.dirname(HERE), "guia", "guia.html")
    with open(path, encoding="utf-8") as f:
        body = f.read()
    head = ('<!doctype html><html lang="es" data-theme="dark"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '<link rel="icon" href="/static/logo.svg"></head><body>')
    return Response(head + body + "</body></html>", mimetype="text/html")


BASKETS = {
    "Índices": ["^GSPC", "^NDX", "^DJI", "^RUT", "^IBEX", "^GDAXI", "^STOXX50E", "^FTSE", "^N225"],
    "Big Tech": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "NFLX"],
    "IBEX": ["SAN.MC", "BBVA.MC", "ITX.MC", "IBE.MC", "TEF.MC", "REP.MC", "CABK.MC", "AMS.MC", "FER.MC", "ACS.MC"],
    "Cripto top": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT"],
    "Materias primas": ["GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F", "ZW=F", "ZC=F"],
    "Divisas": ["EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "AUDUSD=X", "EURGBP=X", "USDCAD=X"],
    "ETFs": ["SPY", "QQQ", "IWM", "EEM", "VGK", "GLD", "TLT", "VNQ", "XLE"],
}


@app.route("/api/baskets")
def baskets():
    return ok({"baskets": BASKETS})


@app.route("/api/backtest_multi", methods=["POST"])
def backtest_multi():
    """Misma estrategia y parámetros sobre varios activos; devuelve una fila de métricas por activo."""
    body = request.get_json(force=True)
    syms = [s.strip().upper() for s in body.get("symbols", []) if s.strip()][:40]
    if not syms:
        return err("Añade al menos un activo.")

    def one(sym):
        try:
            b = dict(body, symbol=sym)
            d, meta, bpy = _bt_data(b)
            if b.get("mode") == "custom":
                strat = {"entry": b.get("entry", []), "exit": b.get("exit", []),
                         "short_entry": b.get("short_entry", []), "short_exit": b.get("short_exit", []),
                         "entry_logic": b.get("entry_logic", "and"), "exit_logic": b.get("exit_logic", "or")}
            else:
                strat = B.preset_rules(b.get("preset", "ma_cross"), b.get("params", {}))
            if meta.get("source") == "demo":
                raise ValueError("Sin datos reales: símbolo no encontrado o sin conexión")
            m = B.run(d, strat, b.get("cfg", {}), bpy)["metrics"]
            keep = ("total_ret", "cagr", "sharpe", "sortino", "max_dd", "calmar", "profit_factor", "win_rate",
                    "trades", "bh_ret", "bh_cagr", "bh_max_dd", "expectancy_pct", "exposure", "final")
            row = {k: m.get(k) for k in keep}
            row.update(symbol=sym, name=meta.get("name", sym), source=meta.get("source", ""), bars=len(d["c"]),
                       start=int(d["t"][0]), end=int(d["t"][-1]))
            return row
        except Exception as e:  # noqa: BLE001
            return {"symbol": sym, "error": str(e)}

    rows = list(pool.map(one, syms))
    good = [r for r in rows if "error" not in r]
    summ = {"n": len(good), "errors": len(rows) - len(good)}
    if good:
        summ.update(
            profitable=sum(1 for r in good if (r["total_ret"] or 0) > 0),
            beat_bh=sum(1 for r in good if (r["total_ret"] or 0) > (r["bh_ret"] or 0)),
            med_sharpe=float(np.median([r["sharpe"] or 0 for r in good])),
            med_ret=float(np.median([r["total_ret"] or 0 for r in good])),
            med_dd=float(np.median([r["max_dd"] or 0 for r in good])))
    return ok({"rows": rows, "summary": summ})


@app.route("/api/favoritas")
def favoritas():
    syms = [x.strip().upper() for x in (request.args.get("symbols") or ",".join(F.DEFAULT)).split(",") if x.strip()][:30]

    def one(sym):
        try:
            return F.analyze(sym, light=True)
        except Exception as e:  # noqa: BLE001
            return {"symbol": sym, "error": str(e)}

    rows = list(pool.map(one, syms))
    return ok({"rows": rows, "macro": F.macro(), "horizons": F.HORIZONS, "default": F.DEFAULT})


@app.route("/api/favorita")
def favorita():
    try:
        return ok(F.analyze(request.args.get("symbol", "NVDA")))
    except Exception as e:  # noqa: BLE001
        return err(str(e))


@app.route("/api/health")
def health():
    return ok({"ok": True, "time": int(time.time())})


def main():
    host = os.environ.get("FINANZAS_HOST", "127.0.0.1")
    port = int(os.environ.get("FINANZAS_PORT", "8765"))
    import threading
    threading.Thread(target=D.binance_universe, daemon=True).start()   # catálogo completo de Binance
    try:
        from waitress import serve  # type: ignore
        serve(app, host=host, port=port, threads=12)
    except ImportError:
        app.run(host=host, port=port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
