"""Motor de backtesting y optimizador.

Modelo de ejecución (realista y conservador):
  * Las señales se evalúan al CIERRE de cada vela y se ejecutan en la APERTURA de la siguiente.
  * Stop-loss / take-profit / trailing se comprueban dentro de la vela con máximo y mínimo.
    Si en la misma vela se tocan SL y TP, se asume que se tocó primero el SL.
  * Si la vela abre más allá del stop (gap), se ejecuta al precio de apertura.
  * Sin intereses, sin impuestos, sin dividendos. Comisión y deslizamiento opcionales (por defecto 0).
"""
from __future__ import annotations

import itertools
import math
import time

import numpy as np

from . import indicators as I

# --------------------------------------------------------------------------- Reglas
OPS = {
    "crosses_above": "cruza al alza", "crosses_below": "cruza a la baja",
    "gt": "mayor que", "lt": "menor que", "rising": "sube", "falling": "baja",
}


class Ctx:
    def __init__(self, d, bpy):
        self.d = d
        self.bpy = bpy
        self.cache = {}

    def operand(self, op):
        kind = op.get("kind", "value")
        n = len(self.d["c"])
        if kind == "value":
            return np.full(n, float(op.get("value", 0)))
        if kind == "price":
            arr = self.d[op.get("field", "c")].astype(float)
        else:
            key = (op["key"], tuple(sorted((op.get("params") or {}).items())))
            if key not in self.cache:
                self.cache[key] = I.compute(op["key"], self.d, op.get("params"), self.bpy)
            outs = self.cache[key]
            arr = outs[op.get("out") or next(iter(outs))]
        sh = int(op.get("shift", 0) or 0)
        if sh > 0:
            arr = np.concatenate([np.full(sh, np.nan), arr[:-sh]])
        mult = op.get("mult")
        if mult not in (None, "", 1):
            arr = arr * float(mult)
        return arr


def eval_rule(ctx, r):
    a = ctx.operand(r["left"])
    b = ctx.operand(r.get("right") or {"kind": "value", "value": 0})
    pa = np.concatenate([[np.nan], a[:-1]])
    pb = np.concatenate([[np.nan], b[:-1]])
    op = r["op"]
    with np.errstate(invalid="ignore"):
        if op == "crosses_above":
            res = (a > b) & (pa <= pb)
        elif op == "crosses_below":
            res = (a < b) & (pa >= pb)
        elif op == "gt":
            res = a > b
        elif op == "lt":
            res = a < b
        elif op == "rising":
            res = a > pa
        elif op == "falling":
            res = a < pa
        else:
            raise ValueError(op)
    return np.nan_to_num(res, nan=0).astype(bool)


def eval_rules(ctx, rules, logic):
    n = len(ctx.d["c"])
    if not rules:
        return np.zeros(n, bool)
    arrs = [eval_rule(ctx, r) for r in rules]
    return np.logical_and.reduce(arrs) if logic == "and" else np.logical_or.reduce(arrs)


# --------------------------------------------------------------------------- Estrategias predefinidas
def P(field="c"):
    return {"kind": "price", "field": field}


def V(x):
    return {"kind": "value", "value": x}


def IND(key, out="v", shift=0, **params):
    return {"kind": "ind", "key": key, "out": out, "params": params, "shift": shift}


def R(left, op, right):
    return {"left": left, "op": op, "right": right}


PRESETS = {
    "ma_cross": {
        "name": "Cruce de medias móviles", "params": {"fast": 20, "slow": 50, "kind": "ema"},
        "opt": {"fast": [5, 10, 15, 20, 30], "slow": [40, 50, 100, 150, 200]},
        "desc": "Compra cuando la media rápida cruza al alza la lenta; vende al cruce contrario.",
    },
    "rsi": {
        "name": "RSI sobrecompra / sobreventa", "params": {"period": 14, "low": 30, "high": 70},
        "opt": {"period": [7, 10, 14, 21], "low": [20, 25, 30, 35], "high": [65, 70, 75, 80]},
        "desc": "Compra cuando el RSI sale de sobreventa; vende cuando sale de sobrecompra.",
    },
    "macd": {
        "name": "Cruce MACD / señal", "params": {"fast": 12, "slow": 26, "signal": 9},
        "opt": {"fast": [8, 12, 16], "slow": [21, 26, 34], "signal": [5, 9, 12]},
        "desc": "Compra cuando el MACD cruza al alza su línea de señal; vende al cruce contrario.",
    },
    "bollinger": {
        "name": "Reversión a la media (Bollinger)", "params": {"period": 20, "k": 2.0},
        "opt": {"period": [10, 20, 30, 50], "k": [1.5, 2.0, 2.5, 3.0]},
        "desc": "Compra al recuperar la banda inferior; cierra al alcanzar la media central.",
    },
    "donchian": {
        "name": "Ruptura de canal (Tortugas/Donchian)", "params": {"entry": 20, "exit": 10},
        "opt": {"entry": [10, 20, 40, 55], "exit": [5, 10, 20]},
        "desc": "Compra al romper el máximo de N velas; sale al perder el mínimo de M velas.",
    },
    "supertrend": {
        "name": "Seguimiento de tendencia SuperTrend", "params": {"period": 10, "mult": 3.0},
        "opt": {"period": [7, 10, 14, 20], "mult": [1.5, 2.0, 3.0, 4.0]},
        "desc": "Entra cuando el precio supera el SuperTrend y sale cuando lo pierde.",
    },
    "stoch": {
        "name": "Estocástico", "params": {"k": 14, "low": 20, "high": 80},
        "opt": {"k": [5, 9, 14, 21], "low": [10, 20, 30], "high": [70, 80, 90]},
        "desc": "Compra cuando %K cruza al alza el nivel de sobreventa; vende en sobrecompra.",
    },
    "trend_rsi": {
        "name": "Tendencia SMA200 + retroceso RSI", "params": {"trend": 200, "period": 14, "low": 40, "high": 70},
        "opt": {"trend": [100, 150, 200], "low": [30, 35, 40, 45], "high": [60, 70, 80]},
        "desc": "Solo compra por encima de la media de tendencia cuando el RSI rebota desde un retroceso.",
    },
    "buy_hold": {"name": "Comprar y mantener", "params": {}, "opt": {},
                 "desc": "Referencia: compra al inicio y mantiene hasta el final."},
}


def preset_rules(name, p):
    """Devuelve dict de reglas {entry, exit, short_entry, short_exit, logic...}."""
    p = {**PRESETS.get(name, {}).get("params", {}), **(p or {})}      # parámetros que falten → valores por defecto
    if name == "ma_cross":
        k = p.get("kind", "ema")
        f, s = IND(k, period=int(p["fast"])), IND(k, period=int(p["slow"]))
        return dict(entry=[R(f, "crosses_above", s)], exit=[R(f, "crosses_below", s)],
                    short_entry=[R(f, "crosses_below", s)], short_exit=[R(f, "crosses_above", s)])
    if name == "rsi":
        r = IND("rsi", period=int(p["period"]))
        return dict(entry=[R(r, "crosses_above", V(p["low"]))], exit=[R(r, "crosses_above", V(p["high"]))],
                    short_entry=[R(r, "crosses_below", V(p["high"]))], short_exit=[R(r, "crosses_below", V(p["low"]))])
    if name == "macd":
        pr = dict(fast=int(p["fast"]), slow=int(p["slow"]), signal=int(p["signal"]))
        m, s = IND("macd", "m", **pr), IND("macd", "s", **pr)
        return dict(entry=[R(m, "crosses_above", s)], exit=[R(m, "crosses_below", s)],
                    short_entry=[R(m, "crosses_below", s)], short_exit=[R(m, "crosses_above", s)])
    if name == "bollinger":
        pr = dict(period=int(p["period"]), k=float(p["k"]))
        lo, mid, up = IND("bb", "lo", **pr), IND("bb", "mid", **pr), IND("bb", "up", **pr)
        return dict(entry=[R(P(), "crosses_above", lo)], exit=[R(P(), "crosses_above", mid)],
                    short_entry=[R(P(), "crosses_below", up)], short_exit=[R(P(), "crosses_below", mid)])
    if name == "donchian":
        up = IND("donchian", "up", shift=1, period=int(p["entry"]))
        lo = IND("donchian", "lo", shift=1, period=int(p["exit"]))
        lo_e = IND("donchian", "lo", shift=1, period=int(p["entry"]))
        up_x = IND("donchian", "up", shift=1, period=int(p["exit"]))
        return dict(entry=[R(P(), "gt", up)], exit=[R(P(), "lt", lo)],
                    short_entry=[R(P(), "lt", lo_e)], short_exit=[R(P(), "gt", up_x)])
    if name == "supertrend":
        st = IND("supertrend", period=int(p["period"]), mult=float(p["mult"]))
        return dict(entry=[R(P(), "crosses_above", st)], exit=[R(P(), "crosses_below", st)],
                    short_entry=[R(P(), "crosses_below", st)], short_exit=[R(P(), "crosses_above", st)])
    if name == "stoch":
        k = IND("stoch", "k", k=int(p["k"]))
        return dict(entry=[R(k, "crosses_above", V(p["low"]))], exit=[R(k, "crosses_below", V(p["high"]))],
                    short_entry=[R(k, "crosses_below", V(p["high"]))], short_exit=[R(k, "crosses_above", V(p["low"]))])
    if name == "trend_rsi":
        t = IND("sma", period=int(p["trend"]))
        r = IND("rsi", period=int(p["period"]))
        return dict(entry=[R(P(), "gt", t), R(r, "crosses_above", V(p["low"]))], entry_logic="and",
                    exit=[R(r, "crosses_above", V(p["high"])), R(P(), "crosses_below", t)], exit_logic="or",
                    short_entry=[R(P(), "lt", t), R(r, "crosses_below", V(100 - p["low"]))],
                    short_exit=[R(r, "crosses_below", V(100 - p["high"])), R(P(), "crosses_above", t)])
    if name == "buy_hold":
        return dict(buy_hold=True)
    raise KeyError(name)


# --------------------------------------------------------------------------- Motor
def run(d, strat, cfg, bpy=252, ctx=None, i0=None, i1=None, light=False):
    """Ejecuta un backtest. strat = dict de reglas. cfg = parámetros de capital/gestión."""
    ctx = ctx or Ctx(d, bpy)
    o, h, l, c, t = d["o"], d["h"], d["l"], d["c"], d["t"]
    n = len(c)
    i0 = 0 if i0 is None else i0
    i1 = n if i1 is None else i1
    capital = float(cfg.get("capital", 10000))
    size = float(cfg.get("size_pct", 100)) / 100
    fee = float(cfg.get("commission_pct", 0)) / 100
    fixed_fee = float(cfg.get("commission_fixed", 0))
    slip = float(cfg.get("slippage_pct", 0)) / 100
    sl_pct = float(cfg.get("sl_pct") or 0) / 100
    tp_pct = float(cfg.get("tp_pct") or 0) / 100
    trail_pct = float(cfg.get("trail_pct") or 0) / 100
    sl_atr = float(cfg.get("sl_atr") or 0)
    tp_atr = float(cfg.get("tp_atr") or 0)
    max_bars = int(cfg.get("max_bars") or 0)
    direction = cfg.get("direction", "long")
    atr = I.atr(h, l, c, 14) if (sl_atr or tp_atr) else None

    bh = strat.get("buy_hold")
    if bh:
        el = np.zeros(n, bool)
        el[i0] = True
        xl = es = xs = np.zeros(n, bool)
    else:
        el = eval_rules(ctx, strat.get("entry", []), strat.get("entry_logic", "and"))
        xl = eval_rules(ctx, strat.get("exit", []), strat.get("exit_logic", "or"))
        es = eval_rules(ctx, strat.get("short_entry", []), strat.get("entry_logic", "and"))
        xs = eval_rules(ctx, strat.get("short_exit", []), strat.get("exit_logic", "or"))
        if direction == "long":
            es = xs = np.zeros(n, bool)
        elif direction == "short":
            el = xl = np.zeros(n, bool)

    cash = capital
    side = 0
    qty = entry_px = sl = tp = peak = 0.0
    entry_i = 0
    pending = None
    trades = []
    equity = np.full(n, np.nan)
    in_mkt = 0

    def open_pos(i, sd, px, reason):
        nonlocal cash, side, qty, entry_px, sl, tp, peak, entry_i
        px = px * (1 + slip * sd)
        eq = cash
        q = eq * size / px
        if q <= 0:
            return
        cost = q * px * fee + fixed_fee
        cash -= sd * q * px + cost
        side, qty, entry_px, entry_i, peak = sd, q, px, i, px
        a = atr[i - 1] if atr is not None and i > 0 else np.nan
        sl = tp = 0.0
        if sl_pct:
            sl = px * (1 - sd * sl_pct)
        if sl_atr and not np.isnan(a):
            s2 = px - sd * sl_atr * a
            sl = s2 if not sl else (max(sl, s2) if sd > 0 else min(sl, s2))
        if tp_pct:
            tp = px * (1 + sd * tp_pct)
        if tp_atr and not np.isnan(a):
            tp = px + sd * tp_atr * a
        trades.append({"side": "Largo" if sd > 0 else "Corto", "entry_t": int(t[i]), "entry_px": px,
                       "qty": q, "entry_fee": cost, "entry_reason": reason})

    def close_pos(i, px, reason):
        nonlocal cash, side, qty
        px = px * (1 - slip * side)
        cost = qty * px * fee + fixed_fee
        cash += side * qty * px - cost
        tr = trades[-1]
        gross = side * qty * (px - tr["entry_px"])
        pnl = gross - cost - tr["entry_fee"]
        tr.update(exit_t=int(t[i]), exit_px=px, exit_reason=reason, pnl=pnl,
                  ret=pnl / (tr["entry_px"] * qty), bars=i - entry_i,
                  fees=cost + tr["entry_fee"])
        side, qty = 0, 0.0

    for i in range(i0, i1):
        # 1) Ejecutar órdenes pendientes en la apertura
        if pending is not None:
            act, reason = pending
            pending = None
            if act in ("exit", "reverse") and side != 0:
                close_pos(i, o[i], reason)
            if act in ("long", "short") or act == "reverse":
                want = 1 if (act == "long" or (act == "reverse" and reason.endswith("largo"))) else -1
                if side == 0:
                    open_pos(i, want, o[i], reason)
        # 2) Stops dentro de la vela
        if side != 0:
            exit_px = None
            why = ""
            trail = 0.0
            if trail_pct:
                trail = peak * (1 - side * trail_pct)
            stop = sl
            if trail:
                stop = trail if not stop else (max(stop, trail) if side > 0 else min(stop, trail))
            if side > 0:
                if stop and o[i] <= stop and i > entry_i:
                    exit_px, why = o[i], "Stop (gap)"
                elif stop and l[i] <= stop:
                    exit_px, why = stop, "Trailing stop" if trail and stop == trail else "Stop-loss"
                elif tp and h[i] >= tp:
                    exit_px, why = (o[i] if o[i] > tp and i > entry_i else tp), "Take-profit"
            else:
                if stop and o[i] >= stop and i > entry_i:
                    exit_px, why = o[i], "Stop (gap)"
                elif stop and h[i] >= stop:
                    exit_px, why = stop, "Trailing stop" if trail and stop == trail else "Stop-loss"
                elif tp and l[i] <= tp:
                    exit_px, why = (o[i] if o[i] < tp and i > entry_i else tp), "Take-profit"
            if exit_px is None and max_bars and i - entry_i >= max_bars:
                exit_px, why = c[i], "Tiempo máximo"
            if exit_px is not None:
                close_pos(i, exit_px, why)
            elif side != 0:
                peak = max(peak, h[i]) if side > 0 else min(peak, l[i])
        # 3) Valoración al cierre
        equity[i] = cash + side * qty * c[i]
        if side != 0:
            in_mkt += 1
        # 4) Señales al cierre -> orden en la siguiente apertura
        if i < i1 - 1:
            if side > 0 and xl[i]:
                pending = ("reverse", "Señal de giro a corto") if (es[i] and direction == "both") else ("exit", "Señal de salida")
            elif side < 0 and xs[i]:
                pending = ("reverse", "Señal de giro a largo") if (el[i] and direction == "both") else ("exit", "Señal de salida")
            elif side == 0:
                if el[i]:
                    pending = ("long", "Señal de entrada largo")
                elif es[i]:
                    pending = ("short", "Señal de entrada corto")
    if side != 0:
        close_pos(i1 - 1, c[i1 - 1], "Cierre fin de periodo")
        equity[i1 - 1] = cash
    eq = equity[i0:i1]
    return _metrics(d, eq, trades, capital, bpy, i0, i1, in_mkt, light)


def _metrics(d, eq, trades, capital, bpy, i0, i1, in_mkt, light):
    t = d["t"][i0:i1]
    c = d["c"][i0:i1]
    n = len(eq)
    final = float(eq[-1])
    total = final / capital - 1
    years = max((t[-1] - t[0]) / (365.25 * 86400), 1e-9)
    cagr = (final / capital) ** (1 / years) - 1 if final > 0 else -1
    r = np.diff(eq) / eq[:-1]
    vol = float(np.std(r, ddof=1) * math.sqrt(bpy)) if len(r) > 2 else 0
    mean_r = float(np.mean(r)) * bpy if len(r) else 0
    neg = r[r < 0]
    dvol = float(np.sqrt(np.mean(neg ** 2)) * math.sqrt(bpy)) if len(neg) else 0
    peak = np.maximum.accumulate(eq)
    dd = eq / peak - 1
    mdd = float(dd.min())
    # duración máxima del drawdown
    dur = mdd_dur = 0
    for x in dd:
        dur = dur + 1 if x < 0 else 0
        mdd_dur = max(mdd_dur, dur)
    pnls = np.array([tr["pnl"] for tr in trades]) if trades else np.array([])
    rets = np.array([tr["ret"] for tr in trades]) if trades else np.array([])
    wins, losses = pnls[pnls > 0], pnls[pnls <= 0]
    pf = float(wins.sum() / -losses.sum()) if len(losses) and losses.sum() < 0 else (float("inf") if len(wins) else 0)
    win_rate = len(wins) / len(pnls) if len(pnls) else 0
    avg_w = float(wins.mean()) if len(wins) else 0
    avg_l = float(losses.mean()) if len(losses) else 0
    payoff = avg_w / -avg_l if avg_l < 0 else None
    kelly = (win_rate - (1 - win_rate) / payoff) if payoff else None
    sqn = float(np.sqrt(len(rets)) * rets.mean() / rets.std(ddof=1)) if len(rets) > 2 and rets.std() > 0 else None
    streak = mx_l = 0
    for p in pnls:
        streak = streak + 1 if p <= 0 else 0
        mx_l = max(mx_l, streak)
    bh = c[-1] / c[0] - 1
    m = {
        "capital": capital, "final": final, "profit": final - capital, "total_ret": total, "cagr": cagr,
        "vol": vol, "sharpe": mean_r / vol if vol else 0, "sortino": mean_r / dvol if dvol else 0,
        "max_dd": mdd, "max_dd_bars": mdd_dur, "calmar": cagr / abs(mdd) if mdd else 0,
        "trades": len(pnls), "win_rate": win_rate, "profit_factor": pf if pf != float("inf") else 999,
        "avg_win": avg_w, "avg_loss": avg_l, "payoff": payoff, "expectancy": float(pnls.mean()) if len(pnls) else 0,
        "expectancy_pct": float(rets.mean()) if len(rets) else 0,
        "best": float(rets.max()) if len(rets) else 0, "worst": float(rets.min()) if len(rets) else 0,
        "avg_bars": float(np.mean([tr["bars"] for tr in trades])) if trades else 0,
        "exposure": in_mkt / max(n, 1), "max_consec_losses": mx_l, "sqn": sqn, "kelly": kelly,
        "bh_ret": float(bh), "bh_final": capital * (1 + bh),
        "bh_cagr": float((1 + bh) ** (1 / years) - 1) if bh > -1 else -1,
        "bh_max_dd": float((c / np.maximum.accumulate(c) - 1).min()), "years": years,
        "fees": float(sum(tr.get("fees", 0) for tr in trades)),
    }
    if light:
        return {"metrics": m}
    step = max(1, n // 1500)
    out = {
        "metrics": m,
        "equity": [[int(t[i]), round(float(eq[i]), 2)] for i in range(0, n, step)] + [[int(t[-1]), round(final, 2)]],
        "bh_equity": [[int(t[i]), round(float(capital * c[i] / c[0]), 2)] for i in range(0, n, step)],
        "drawdown": [[int(t[i]), round(float(dd[i] * 100), 3)] for i in range(0, n, step)],
        "trades": trades, "monthly": _monthly(t, eq), "conclusions": conclusions(m),
        "pnl_hist": np.histogram(rets * 100, bins=min(30, max(5, len(rets) // 2)))[0].tolist() if len(rets) > 1 else [],
        "pnl_edges": np.histogram(rets * 100, bins=min(30, max(5, len(rets) // 2)))[1].tolist() if len(rets) > 1 else [],
    }
    return out


def _monthly(t, eq):
    res = {}
    last = {}
    for ts, e in zip(t, eq):
        g = time.gmtime(int(ts))
        last[(g.tm_year, g.tm_mon)] = e
    keys = sorted(last)
    prev = eq[0]
    for k in keys:
        res.setdefault(k[0], [None] * 12)[k[1] - 1] = float(last[k] / prev - 1)
        prev = last[k]
    out = {}
    for y, row in res.items():
        tot = 1.0
        for x in row:
            if x is not None:
                tot *= 1 + x
        out[y] = {"months": row, "year": tot - 1}
    return out


def conclusions(m):
    """Conclusiones en lenguaje natural (sin intereses ni impuestos)."""
    c = []
    eur = lambda x: f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")  # noqa: E731
    pct = lambda x: f"{x*100:+.2f} %".replace(".", ",")  # noqa: E731
    verdict = "neutral"
    if m["total_ret"] > 0:
        c.append(("ok", f"La estrategia es RENTABLE: {eur(m['capital'])} → {eur(m['final'])} "
                        f"({pct(m['total_ret'])}, {pct(m['cagr'])} anual compuesto) en {m['years']:.1f} años."))
    else:
        c.append(("bad", f"La estrategia PIERDE dinero: {eur(m['capital'])} → {eur(m['final'])} ({pct(m['total_ret'])})."))
    diff = m["total_ret"] - m["bh_ret"]
    if diff > 0:
        c.append(("ok", f"Supera a «comprar y mantener» en {abs(diff)*100:.2f} puntos porcentuales (B&H: {pct(m['bh_ret'])}).".replace(".", ",", 1)))
    else:
        c.append(("warn", f"Rinde {abs(diff)*100:.2f} puntos porcentuales menos que «comprar y mantener» (B&H: {pct(m['bh_ret'])}). ".replace(".", ",", 1) +
                          "Solo compensa si reduce el riesgo de forma significativa."))
    if m["max_dd"] > m["bh_max_dd"] * 0.7 and m["bh_max_dd"] < 0:
        c.append(("ok", f"Reduce la caída máxima: {pct(m['max_dd'])} frente a {pct(m['bh_max_dd'])} del activo."))
    else:
        c.append(("warn", f"Caída máxima (drawdown) de {pct(m['max_dd'])}; el activo tuvo {pct(m['bh_max_dd'])}."))
    s = m["sharpe"]
    lvl = "excelente" if s > 2 else "muy bueno" if s > 1.5 else "bueno" if s > 1 else "aceptable" if s > 0.5 else "pobre"
    c.append(("ok" if s > 1 else "warn" if s > 0.5 else "bad",
              f"Ratio de Sharpe {s:.2f} ({lvl}); Sortino {m['sortino']:.2f}; Calmar {m['calmar']:.2f}."))
    if m["trades"]:
        pf = m["profit_factor"]
        c.append(("ok" if pf > 1.5 else "warn" if pf > 1 else "bad",
                  f"{m['trades']} operaciones, {m['win_rate']*100:.1f} % ganadoras, factor de beneficio {pf:.2f}, "
                  f"esperanza {eur(m['expectancy'])} por operación ({pct(m['expectancy_pct'])})."))
    if m["trades"] < 30 and m["trades"] > 0:
        c.append(("warn", f"Solo {m['trades']} operaciones: muestra estadísticamente pequeña (se recomiendan ≥ 30)."))
    if m["max_consec_losses"] >= 5:
        c.append(("warn", f"Racha máxima de {m['max_consec_losses']} pérdidas seguidas: prepárate psicológicamente."))
    if m.get("kelly") is not None and m["kelly"] > 0:
        c.append(("info", f"Criterio de Kelly sugiere arriesgar ≈ {m['kelly']*100:.1f} % (usar ½ Kelly es más prudente)."))
    c.append(("info", f"Tiempo invertido en mercado: {m['exposure']*100:.1f} % del periodo."))
    score = (m["total_ret"] > 0) + (diff > 0) + (s > 1) + (m["profit_factor"] > 1.3) + (m["trades"] >= 30)
    verdict = ("Estrategia ROBUSTA y prometedora" if score >= 4 else
               "Estrategia con potencial, pero con reservas" if score >= 2 else
               "Estrategia NO recomendable con estos parámetros")
    c.insert(0, ("verdict", verdict))
    c.append(("info", "Resultados sin intereses, impuestos ni dividendos. Rentabilidades pasadas no garantizan futuras."))
    return c


# --------------------------------------------------------------------------- Optimizador
def optimize(d, preset, base_params, grid, cfg, bpy, objective="sharpe", split=0.7,
             sl_grid=None, tp_grid=None, max_combos=3000, min_trades=3):
    keys = list(grid)
    values = [grid[k] for k in keys]
    combos = list(itertools.product(*values)) if keys else [()]
    sl_grid = sl_grid or [cfg.get("sl_pct") or 0]
    tp_grid = tp_grid or [cfg.get("tp_pct") or 0]
    total = len(combos) * len(sl_grid) * len(tp_grid)
    if total > max_combos:
        raise ValueError(f"Demasiadas combinaciones ({total}); máximo {max_combos}. Reduce los rangos.")
    n = len(d["c"])
    cut = int(n * split)
    ctx = Ctx(d, bpy)
    rows = []
    t0 = time.time()
    for combo in combos:
        p = dict(base_params)
        p.update(dict(zip(keys, combo)))
        if preset == "ma_cross" and float(p["fast"]) >= float(p["slow"]):
            continue
        if preset == "rsi" and float(p["low"]) >= float(p["high"]):
            continue
        strat = preset_rules(preset, p)
        for slv in sl_grid:
            for tpv in tp_grid:
                c2 = dict(cfg, sl_pct=slv, tp_pct=tpv)
                ins = run(d, strat, c2, bpy, ctx, 0, cut, light=True)["metrics"]
                rows.append({"params": {**{k: p[k] for k in keys}, "sl_pct": slv, "tp_pct": tpv}, "is": ins})
    key = {"sharpe": "sharpe", "return": "total_ret", "profit_factor": "profit_factor",
           "calmar": "calmar", "sortino": "sortino", "drawdown": "max_dd", "expectancy": "expectancy"}[objective]
    valid = [r for r in rows if r["is"]["trades"] >= min_trades] or rows
    valid.sort(key=lambda r: r["is"][key], reverse=True)
    top = valid[:25]
    for r in top:  # validación fuera de muestra
        p = dict(base_params)
        p.update({k: v for k, v in r["params"].items() if k not in ("sl_pct", "tp_pct")})
        c2 = dict(cfg, sl_pct=r["params"]["sl_pct"], tp_pct=r["params"]["tp_pct"])
        r["oos"] = run(d, preset_rules(preset, p), c2, bpy, ctx, cut, n, light=True)["metrics"]
        r["full"] = run(d, preset_rules(preset, p), c2, bpy, ctx, 0, n, light=True)["metrics"]
    heat = None
    if len(keys) >= 2:
        k1, k2 = keys[0], keys[1]
        best = {}
        for r in rows:
            a, b = r["params"][k1], r["params"][k2]
            val = r["is"][key]
            if (a, b) not in best or val > best[(a, b)]:
                best[(a, b)] = val
        heat = {"x": k1, "y": k2, "xs": grid[k1], "ys": grid[k2],
                "z": [[best.get((a, b)) for a in grid[k1]] for b in grid[k2]], "metric": key}
    b = top[0] if top else None
    concl = []
    if b:
        ins, oos = b["is"], b["oos"]
        concl.append(("verdict", "Mejor combinación encontrada: " +
                      ", ".join(f"{k}={v}" for k, v in b["params"].items())))
        concl.append(("ok" if ins["total_ret"] > 0 else "bad",
                      f"Dentro de muestra ({int(split*100)} % inicial): {ins['total_ret']*100:+.2f} %, Sharpe {ins['sharpe']:.2f}, "
                      f"DD {ins['max_dd']*100:.2f} %, {ins['trades']} operaciones."))
        robust = oos["total_ret"] > 0 and oos["sharpe"] > 0.3
        concl.append(("ok" if robust else "bad",
                      f"Fuera de muestra ({100-int(split*100)} % final, datos NO usados para optimizar): "
                      f"{oos['total_ret']*100:+.2f} %, Sharpe {oos['sharpe']:.2f}, DD {oos['max_dd']*100:.2f} % "
                      f"(B&H en ese tramo: {oos['bh_ret']*100:+.2f} %)."))
        degr = (oos["sharpe"] / ins["sharpe"]) if ins["sharpe"] else 0
        concl.append(("ok" if degr > 0.5 else "warn",
                      f"Conservación del Sharpe fuera de muestra: {degr*100:.0f} %. "
                      + ("Robustez aceptable." if degr > 0.5 else "Posible SOBREOPTIMIZACIÓN (curve fitting).")))
        good_oos = sum(1 for r in top if r["oos"]["total_ret"] > 0)
        concl.append(("info", f"{good_oos} de las {len(top)} mejores combinaciones siguen siendo rentables fuera de muestra."))
    return {"rows": top, "tested": len(rows), "seconds": time.time() - t0, "heatmap": heat,
            "split_time": int(d["t"][cut]) if cut < n else None, "conclusions": concl, "objective": key}
