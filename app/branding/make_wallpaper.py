#!/usr/bin/env python3
"""Genera el fondo de pantalla de FinanzasOS (SVG). Uso: make_wallpaper.py salida.svg [ancho alto]"""
import math
import random
import sys

out = sys.argv[1] if len(sys.argv) > 1 else "wallpaper.svg"
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1920
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1080
rnd = random.Random(42)

# Serie de precios sintética con tendencia alcista
n = 120
p = 100.0
candles = []
for i in range(n):
    drift = 0.0028 + 0.012 * math.sin(i / 14)
    o = p
    c = o * (1 + drift + rnd.gauss(0, 0.018))
    h = max(o, c) * (1 + abs(rnd.gauss(0, 0.008)))
    l = min(o, c) * (1 - abs(rnd.gauss(0, 0.008)))
    v = abs(rnd.gauss(1, 0.45)) + abs(c - o) / o * 25
    candles.append((o, h, l, c, v))
    p = c

x0, x1 = W * 0.30, W * 0.985
y0, y1 = H * 0.30, H * 0.80
lo = min(c[2] for c in candles)
hi = max(c[1] for c in candles)
X = lambda i: x0 + (i + 0.5) * (x1 - x0) / n  # noqa: E731
Y = lambda v: y1 - (v - lo) / (hi - lo) * (y1 - y0)  # noqa: E731
cw = (x1 - x0) / n * 0.62

closes = [c[3] for c in candles]


def sma(k):
    return [sum(closes[max(0, i - k + 1):i + 1]) / len(closes[max(0, i - k + 1):i + 1]) for i in range(n)]


def sd(k, m):
    out = []
    for i in range(n):
        w = closes[max(0, i - k + 1):i + 1]
        out.append(math.sqrt(sum((x - m[i]) ** 2 for x in w) / len(w)))
    return out


m20 = sma(20)
s20 = sd(20, m20)
m50 = sma(50)
up = [m20[i] + 2 * s20[i] for i in range(n)]
dn = [m20[i] - 2 * s20[i] for i in range(n)]

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
       """<defs>
<radialGradient id="bg1" cx="78%" cy="30%" r="75%"><stop offset="0" stop-color="#14213a"/><stop offset=".55" stop-color="#0a1120"/><stop offset="1" stop-color="#05080e"/></radialGradient>
<radialGradient id="glow" cx="85%" cy="88%" r="40%"><stop offset="0" stop-color="#f5b700" stop-opacity=".16"/><stop offset="1" stop-color="#f5b700" stop-opacity="0"/></radialGradient>
<radialGradient id="glow2" cx="20%" cy="85%" r="35%"><stop offset="0" stop-color="#16c784" stop-opacity=".08"/><stop offset="1" stop-color="#16c784" stop-opacity="0"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d99d00" stop-opacity=".2"/><stop offset="1" stop-color="#ffe17a"/></linearGradient>
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".10"/><stop offset="1" stop-color="#3b82f6" stop-opacity=".02"/></linearGradient>
<linearGradient id="fadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05080e" stop-opacity="1"/><stop offset=".35" stop-color="#05080e" stop-opacity="0"/></linearGradient>
<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#1b2a42" stroke-width="1" opacity=".55"/></pattern>
</defs>""",
       f'<rect width="{W}" height="{H}" fill="url(#bg1)"/>',
       f'<rect width="{W}" height="{H}" fill="url(#grid)"/>',
       f'<rect width="{W}" height="{H}" fill="url(#glow)"/><rect width="{W}" height="{H}" fill="url(#glow2)"/>']

# Bandas de Bollinger
pts_up = " ".join(f"{X(i):.1f},{Y(up[i]):.1f}" for i in range(n))
pts_dn = " ".join(f"{X(i):.1f},{Y(dn[i]):.1f}" for i in reversed(range(n)))
svg.append(f'<polygon points="{pts_up} {pts_dn}" fill="url(#band)"/>')
svg.append(f'<polyline points="{pts_up}" fill="none" stroke="#3b82f6" stroke-opacity=".45" stroke-width="1.4"/>')
svg.append(f'<polyline points="{" ".join(f"{X(i):.1f},{Y(dn[i]):.1f}" for i in range(n))}" fill="none" stroke="#3b82f6" stroke-opacity=".45" stroke-width="1.4"/>')

# Velas
for i, (o, h, l, c, v) in enumerate(candles):
    col = "#16c784" if c >= o else "#ea3943"
    op = 0.35 + 0.6 * (i / n)
    svg.append(f'<line x1="{X(i):.1f}" y1="{Y(h):.1f}" x2="{X(i):.1f}" y2="{Y(l):.1f}" stroke="{col}" stroke-opacity="{op:.2f}" stroke-width="1.3"/>')
    top, bot = Y(max(o, c)), Y(min(o, c))
    svg.append(f'<rect x="{X(i) - cw / 2:.1f}" y="{top:.1f}" width="{cw:.1f}" height="{max(1.5, bot - top):.1f}" rx="1" fill="{col}" fill-opacity="{op:.2f}"/>')

# Medias
svg.append(f'<polyline points="{" ".join(f"{X(i):.1f},{Y(m20[i]):.1f}" for i in range(n))}" fill="none" stroke="#22d3ee" stroke-opacity=".7" stroke-width="2"/>')
svg.append(f'<polyline points="{" ".join(f"{X(i):.1f},{Y(m50[i]):.1f}" for i in range(n))}" fill="none" stroke="url(#gold)" stroke-width="3.5" stroke-linecap="round"/>')

# Volumen
vmax = max(c[4] for c in candles)
vb = H * 0.885
for i, (o, h, l, c, v) in enumerate(candles):
    hh = v / vmax * H * 0.07
    svg.append(f'<rect x="{X(i) - cw / 2:.1f}" y="{vb - hh:.1f}" width="{cw:.1f}" height="{hh:.1f}" fill="{"#16c784" if c >= o else "#ea3943"}" fill-opacity=".22"/>')

# Oscilador RSI estilizado
rsi_y = H * 0.93
pts = []
for i in range(n):
    val = 50 + 28 * math.sin(i / 6.5) * math.cos(i / 23)
    pts.append(f"{X(i):.1f},{rsi_y - (val - 50) * 0.45:.1f}")
svg.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#a78bfa" stroke-opacity=".5" stroke-width="1.6"/>')

svg.append(f'<rect width="{W}" height="{H}" fill="url(#fadeL)"/>')

# Fórmulas flotantes
F = [("σ√T", 0.25, 0.62, 34, .08), ("E[Rᵢ] = R_f + β(R_m − R_f)", 0.36, 0.20, 24, .14),
     ("Sharpe = (R_p − R_f) / σ_p", 0.66, 0.24, 22, .13), ("VaR₉₅ = μ − 1,645σ", 0.80, 0.13, 22, .12),
     ("C = S·N(d₁) − K·e^(−rT)·N(d₂)", 0.47, 0.11, 22, .11), ("RSI = 100 − 100/(1+RS)", 0.83, 0.20, 20, .12),
     ("VAN = Σ FCₜ/(1+k)ᵗ", 0.33, 0.92, 22, .12), ("CAGR = (V_f/V_i)^(1/n) − 1", 0.58, 0.965, 20, .11),
     ("MACD = EMA₁₂ − EMA₂₆", 0.40, 0.27, 18, .10), ("f* = p − q/b", 0.92, 0.28, 20, .10)]
import re
for txt, fx, fy, size, opv in F:
    txt = re.sub(r"_(\w+)", r'<tspan baseline-shift="sub" font-size="68%">\1</tspan>', txt)
    txt = re.sub(r"\^\((.*?)\)", r'<tspan baseline-shift="super" font-size="68%">\1</tspan>', txt)
    svg.append(f'<text x="{W * fx:.0f}" y="{H * fy:.0f}" font-family="DejaVu Serif, serif" font-style="italic" font-size="{size}" fill="#e6edf6" fill-opacity="{opv}">{txt}</text>')

# Marca
lx, ly = W - 430, H - 108
svg.append(f'''<g transform="translate({lx},{ly})">
<rect x="0" y="0" width="64" height="64" rx="14" fill="#0f1622" stroke="#263650" stroke-width="2"/>
<g stroke="#16c784" stroke-width="2"><line x1="16" y1="18" x2="16" y2="44"/><rect x="12.5" y="24" width="7" height="13" fill="#16c784"/></g>
<g stroke="#ea3943" stroke-width="2"><line x1="30" y1="22" x2="30" y2="48"/><rect x="26.5" y="28" width="7" height="12" fill="#ea3943"/></g>
<polyline points="8,46 22,36 34,40 56,14" fill="none" stroke="#f5b700" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<text x="82" y="40" font-family="Inter, DejaVu Sans, sans-serif" font-weight="800" font-size="40" fill="#e6edf6">Finanzas<tspan fill="#f5b700">OS</tspan></text>
<text x="84" y="62" font-family="JetBrains Mono, DejaVu Sans Mono, monospace" font-size="13" letter-spacing="3" fill="#64748b">ECONOMÍA · MERCADOS · TRADING</text>
</g>''')
svg.append("</svg>")
open(out, "w").write("\n".join(svg))
print(out)
