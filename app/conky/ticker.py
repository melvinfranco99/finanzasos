#!/usr/bin/env python3
"""Genera el texto (con marcado de conky) del panel de datos en tiempo real.
Lo ejecuta conky cada pocos segundos con ${execpi}. Lee la API local de FinanzasOS
(que cachea las fuentes); si no está levantada, consulta directamente."""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

API = os.environ.get("FINANZAS_API", "http://127.0.0.1:8765")
CACHE = os.path.join(os.environ.get("XDG_RUNTIME_DIR", "/tmp"), "finanzas-ticker.json")
GOLD, UP, DOWN, MUTED, TXT = "f5b700", "16c784", "ea3943", "64748b", "e6edf6"


def get(path, timeout=6):
    with urllib.request.urlopen(API + path, timeout=timeout) as r:
        return json.loads(r.read())


def load():
    try:
        q = get("/api/ticker")["quotes"]
    except Exception:  # noqa: BLE001 - servidor caído: consulta directa
        try:
            here = os.path.dirname(os.path.realpath(__file__))
            for p in (os.path.join(here, ".."), "/opt/finanzas"):
                sys.path.insert(0, p)
            from finanzas import data as D  # type: ignore
            q = D.quotes(D.TICKER_SYMBOLS)
        except Exception:  # noqa: BLE001
            q = []
    fg = {}
    try:
        st = os.stat(CACHE)
        if time.time() - st.st_mtime < 600:
            fg = json.load(open(CACHE))
    except OSError:
        pass
    if not fg:
        try:
            fg = get("/api/feargreed", timeout=15)
            json.dump({k: {"score": v.get("score"), "rating": v.get("rating")} for k, v in fg.items() if isinstance(v, dict)},
                      open(CACHE, "w"))
            fg = json.load(open(CACHE))
        except Exception:  # noqa: BLE001
            fg = {}
    return q, fg


def fmt(x):
    if x is None:
        return "—"
    a = abs(x)
    d = 2 if a >= 10 else 4 if a >= 1 else 5
    s = f"{x:,.{d}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fg_color(s):
    return DOWN if s < 25 else "f97316" if s < 45 else "eab308" if s <= 55 else "84cc16" if s <= 75 else UP


def bar(score, n=18):
    k = int(round(score / 100 * n))
    return f"${{color {fg_color(score)}}}{'█' * k}${{color 1d2a3d}}{'█' * (n - k)}"


def sessions():
    now = datetime.now(ZoneInfo("UTC"))
    M = [("NY", "America/New_York", 930, 1600), ("LDN", "Europe/London", 800, 1630),
         ("MAD", "Europe/Madrid", 900, 1730), ("FRA", "Europe/Berlin", 900, 1730),
         ("TKY", "Asia/Tokyo", 900, 1530), ("HK", "Asia/Hong_Kong", 930, 1600)]
    out = []
    for code, tz, o, c in M:
        t = now.astimezone(ZoneInfo(tz))
        hm = t.hour * 100 + t.minute
        op = t.weekday() < 5 and o <= hm < c
        out.append(f"${{color {UP if op else MUTED}}}{'●' if op else '○'}{code}")
    return " ".join(out)


def main():
    q, fg = load()
    now = datetime.now()
    L = []
    L.append(f"${{font JetBrains Mono:size=8}}{sessions()}${{alignr}}${{color {MUTED}}}act. {now:%H:%M:%S}")
    L.append(f"${{color 263650}}${{hr 1}}")
    if not q:
        L.append(f"${{font JetBrains Mono:size=9}}${{color {DOWN}}}Sin conexión con los mercados")
    for x in q:
        pct = x.get("pct") or 0
        col = UP if pct > 0 else DOWN if pct < 0 else MUTED
        arrow = "▲" if pct > 0 else "▼" if pct < 0 else "■"
        name = x.get("name", x["symbol"]).replace(" (Binance)", "").replace(" Volatilidad", "")[:14]
        demo = "*" if x.get("source") == "demo" else ""
        L.append(f"${{font JetBrains Mono:size=9}}${{color {TXT}}}{name:<14}${{alignr}}{fmt(x.get('price'))}{demo}  "
                 f"${{color {col}}}{arrow}" + f"{pct:+6.2f}%".replace(".", ","))
    L.append(f"${{color 263650}}${{hr 1}}")
    for key, label in (("cnn", "Miedo/Euforia Bolsa"), ("own", "Índice propio FOS"), ("crypto", "Miedo/Euforia Cripto")):
        v = fg.get(key)
        if v and v.get("score") is not None:
            s = float(v["score"])
            L.append(f"${{font JetBrains Mono:size=8}}${{color {MUTED}}}{label}${{alignr}}${{color {fg_color(s)}}}{s:3.0f} {v.get('rating', '')}")
            L.append(f"${{font JetBrains Mono:size=7}}{bar(s, 44)}")
    if any(x.get("source") == "demo" for x in q):
        L.append(f"${{font JetBrains Mono:size=7}}${{color {MUTED}}}* datos de demostración (sin red)")
    print("\n".join(L))


if __name__ == "__main__":
    main()
