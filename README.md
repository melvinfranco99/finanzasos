# FinanzasOS

Distribución Linux basada en **Debian 13 "trixie"** pensada para economía, finanzas, inversión y trading.
Arranca en modo *live* desde un USB (Ventoy o Rufus) y también se puede instalar en el disco con Calamares.

📖 **Guía paso a paso (de cero a experto):** https://melvinfranco99.github.io/finanzasos/

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ FinanzasOS  MERCADOS EN VIVO      │  Terminal FinanzasOS (Chromium --app)     │
│ mié 04 nov 2026        00:17:41   │  ┌────────┬─────────────────────────────┐ │
│ ●NY ○LDN ○MAD ○FRA ○TKY ○HK      │  │ Panel  │ velas + EMA/SMA/BB + vol    │ │
│ S&P 500      7.568,92 ▲ +0,36%    │  │ Gráfico│ RSI ───────────────────     │ │
│ IBEX 35     18.807,20 ▼ -0,79%    │  │ Análisis MACD ▂▃▅▇▅▃▂▁▂▃          │ │
│ EUR/USD        1,1193 ▲ +0,02%    │  │ Backtest│ medidor técnico / pivotes  │ │
│ Bitcoin     77.861,37 ▲ +1,29%    │  └────────┴─────────────────────────────┘ │
│ Miedo/Euforia ██████░░░░░░░ 19    │                                           │
└──────────────────────────────────────────────────────────────────────────────┘
  ticker conky (arriba a la izq.)         fondo de pantalla financiero propio
```

## Qué incluye

| Módulo | Contenido |
|---|---|
| **Ticker de escritorio** (arriba a la izquierda) | Reloj, sesiones de bolsa abiertas/cerradas, 15 activos clave con variación en color (índices, divisas, oro, Brent, bono 10A, VIX, BTC, ETH), medidores de miedo/euforia de bolsa (CNN), cripto y un índice propio, CPU y RAM. |
| **Panel de control** | Tarjetas con mini-gráficas, medidores Fear & Greed con sus 7 componentes, sesiones mundiales, mapa de calor de grandes valores, mayores subidas/bajadas, matriz de correlaciones y titulares. |
| **Mercados en vivo** | 8 clases de activos (índices, acciones USA y Europa, ETFs, divisas, materias primas, bonos/tipos, cripto) con refresco cada 10 s y destello al cambiar el precio. Admite cualquier símbolo de Yahoo Finance o par de Binance. |
| **Gráficos profesionales** | Temporalidades 1m, 5m, 15m, 30m, 1H, 4H, 1D, 1S y 1M; velas, Heikin-Ashi, barras, línea y área; escala logarítmica; paneles múltiples; **40 indicadores** configurables (SMA, EMA, WMA, HMA, DEMA, TEMA, VWMA, VWAP, Bollinger, Keltner, Donchian, Ichimoku, Parabolic SAR, SuperTrend, regresión lineal, volumen, RSI, MACD, estocástico, Stoch RSI, CCI, Williams %R, ROC, Momentum, TRIX, Awesome, Ultimate, MFI, OBV, CMF, A/D, ATR, volatilidad histórica, ancho y %B de Bollinger, ADX/DMI, Aroon, Z-Score, oscilador de volumen); resumen técnico de compra/venta, pivotes (clásico, Fibonacci, Camarilla), soportes y resistencias automáticos y líneas dibujables. |
| **Análisis y probabilidades** | Probabilidad de subida o bajada en varios horizontes por temporalidad, combinando 4 modelos: frecuencia histórica, log-normal (GBM), régimen actual (RSI y media) y regresión logística. Incluye Monte Carlo (2.000 escenarios con bandas P5-P95), VaR/CVaR, Sharpe, Sortino, Calmar, beta y alfa frente al S&P 500, asimetría, curtosis, distribución frente a la normal, drawdown, estacionalidad mensual y semanal, y matriz año×mes. |
| **Miedo y euforia** | CNN Fear & Greed (con sus 7 componentes), Crypto Fear & Greed, un índice propio recalculado con datos de Yahoo, histórico de 1 año y un medidor por activo. |
| **Un programa por escritorio** | Al arrancar (o al activar el modo en Arch) cada vista se abre en su escritorio: 1 panel · 2 gráficos · 3 mis favoritas · 4 análisis + mercados · 5 sentimiento + noticias · 6 backtest · 7 optimizador · 8 calculadoras + fórmulas. `finanzas --escritorios` las reabre; `FINANZAS_LAYOUT` cambia el reparto. |
| **Mis favoritas** | Tus empresas (de inicio NVIDIA, Amazon, Apple, Shopify, Estée Lauder, Wynn, Celsius y Netflix) con veredicto **comprar / mantener / vender a 1, 3, 6, 12 y 24 meses**, rentabilidad estimada con rango P10–P90 y probabilidad de subir. Lo justifica con 13 factores técnicos, 13 fundamentales (Yahoo: PEG, márgenes, deuda, flujo de caja, analistas, revisiones…) y 6 macro (S&P 500, VIX, bono 10A, dólar, miedo/euforia), más un plan orientativo (stop, objetivo, R:B). |
| **Buscador universal** | Busca por nombre en todo Yahoo Finance (acciones de cualquier bolsa, ETFs, fondos, índices, divisas, futuros) y en los ~3.000 pares spot de Binance. Disponible en la barra superior, los gráficos, el backtest y el optimizador. |
| **Backtesting** | Activo, temporalidad, rango de fechas, capital, tamaño de posición, largos y/o cortos, stop-loss y take-profit en % o en ATR, trailing stop, tiempo máximo en posición, comisión y deslizamiento (por defecto 0). Trae 8 estrategias predefinidas y un **constructor de reglas** con cualquier indicador, cruces, comparaciones y lógica Y/O. Muestra 27 métricas, curva de capital frente a comprar y mantener, drawdown, operaciones sobre el gráfico, tabla mensual, distribución de resultados, registro de operaciones y **conclusiones en lenguaje natural** (sin intereses ni impuestos). **Comparación multi-activo**: la misma estrategia sobre hasta 40 activos (o cestas: Índices, Big Tech, IBEX, Cripto top, Materias primas, Divisas, ETFs) con tabla ordenable y veredicto de robustez. |
| **Guía paso a paso** | Del USB a nivel experto, con ejercicios, intérprete de métricas y calculadoras de práctica. Dentro de la suite (menú «Guía paso a paso», `finanzas guia`) y en `app/guia/guia.html`. |
| **Optimizador** | Búsqueda exhaustiva de parámetros, SL y TP según el objetivo que elijas (Sharpe, rentabilidad, factor de beneficio, Calmar, Sortino, drawdown o esperanza). Valida **fuera de muestra** para detectar sobreajuste y muestra un mapa de calor de parámetros. Cualquier fila se envía al backtest con un clic. |
| **Calculadoras (22)** | Interés compuesto, hipoteca con sistema francés, VAN/TIR/payback, CAGR, tamaño de posición y R:B, Black-Scholes con griegas, bonos (precio, TIR, duración, convexidad), FIRE, inflación, DCF, Kelly, dividendos y Gordon, punto muerto, conversor de divisas en vivo, Fibonacci, pivotes, regla del 72, rentas, precio medio DCA, recuperación tras pérdidas, apalancamiento y liquidación, y ratios de valoración. Cada una muestra su fórmula, una gráfica y una tabla. |
| **Fórmulas** | 48 fórmulas de rentabilidad, riesgo, valoración, renta fija, derivados, indicadores y backtesting. |
| **Software extra en la ISO** | LibreOffice Calc, Gnumeric, GnuCash, HomeBank, Qalculate!, Galculator, Python con pandas, scipy y matplotlib, Chromium e instalador Calamares. |

**Fuentes de datos** (gratuitas, sin clave): Yahoo Finance, Binance (cripto en tiempo real), CNN y alternative.me (miedo/euforia), y RSS de CNBC, Investing, Expansión y Cointelegraph. Si no hay conexión, todo sigue funcionando con **datos de demostración** sintéticos, marcados como `DEMO`.

> ⚠️ Yahoo Finance da datos en tiempo real o con 15-20 min de retraso según la bolsa (los índices USA y el forex suelen ir casi en tiempo real; algunas bolsas europeas llevan retraso). Binance es tiempo real. Es una herramienta educativa: no es asesoramiento financiero.

## Estructura

```
51_distro_linux_finanzas/
├── app/                         ← la suite (se instala en /opt/finanzas en la ISO)
│   ├── finanzas/                  backend Python (Flask + numpy)
│   │   ├── data.py                fuentes de datos, caché, modo demo, Fear & Greed
│   │   ├── indicators.py          40 indicadores técnicos (numpy puro)
│   │   ├── analysis.py            probabilidades, Monte Carlo, VaR, estadística
│   │   ├── backtest.py            motor de backtesting + optimizador
│   │   ├── server.py              API REST local en 127.0.0.1:8765
│   │   └── static/                interfaz web (HTML/CSS/JS + TradingView Lightweight Charts)
│   ├── conky/                     ticker de escritorio (ticker.py + finanzas.conkyrc)
│   ├── branding/                  generador del fondo de pantalla (SVG → PNG)
│   └── bin/finanzas, finanzas-mode
├── live/                        ← configuración de live-build (Debian 13)
│   ├── auto/config                opciones de la ISO (idioma es_ES, teclado es, usuario trader)
│   └── config/
│       ├── package-lists/         paquetes (XFCE, temas, Python, LibreOffice, GnuCash, firmware…)
│       ├── hooks/live/            personalización (fondos, iconos, alternativas…)
│       └── includes.chroot_after_packages/  menú, panel, tema, autoarranque, lanzadores
├── build.sh                     ← construye la ISO con Docker/Podman
├── run-dev.sh                   ← ejecuta la suite en tu sistema sin ISO
└── install-arch.sh              ← modo Finanzas para tu Arch (bspwm + polybar)
```

## 1. Construir la ISO

Puedes hacerlo desde tu Arch, porque la construcción ocurre dentro de un contenedor Debian:

```bash
sudo pacman -S docker && sudo systemctl start docker   # si no lo tienes
cd 51_distro_linux_finanzas
./build.sh                       # 20-60 min la primera vez (descarga ~2-3 GB)
# → dist/finanzasos-amd64.hybrid.iso  (+ .sha256)
```

Si estás en Debian o Ubuntu, también puedes usar live-build directamente: `sudo apt install live-build && cd live && sudo lb config && sudo lb build`.
Para empezar de cero: `./build.sh clean`. La caché de paquetes (`live/cache`, unos 2 GB) hace que las reconstrucciones posteriores tarden mucho menos; bórrala con el mismo comando si necesitas espacio.

## 2. Pasarla al USB

La ISO es **iso-hybrid** y arranca en BIOS y en UEFI.

**Ventoy (recomendado):** copia `finanzasos-amd64.hybrid.iso` al USB de Ventoy como un archivo más, arranca desde el USB y elige FinanzasOS en el menú. Puedes tenerla junto a otras ISOs.

**Rufus (Windows):** selecciona la ISO y, cuando Rufus pregunte, elige **«Escribir en modo imagen DD»**. El modo ISO también suele funcionar, pero DD es el más fiable para imágenes híbridas de Debian. Ojo: Rufus borra el USB.

**Desde Linux:** `sudo dd if=dist/finanzasos-amd64.hybrid.iso of=/dev/sdX bs=4M status=progress oflag=sync` (comprueba bien `sdX` con `lsblk`).

**Arrancar:** reinicia y abre el menú de arranque (F12, F11, F8, Esc o F2 según el fabricante).
- Si no arranca con **Secure Boot** activo, desactívalo en la BIOS/UEFI. En Ventoy también puedes usar su opción de inscribir la clave.
- Menú de arranque (arranca solo a los 5 s): **sistema en vivo**, **copiar a la RAM** (va más rápido y puedes retirar el USB una vez arrancado; necesitas ≥ 6 GB de RAM) y **modo seguro** (`nomodeset`, si la pantalla se queda en negro).
- La sesión entra sola con el usuario `trader`, que en live puede usar sudo sin contraseña.
- Para que el ticker y los gráficos tengan datos en vivo, conéctate a la Wi-Fi desde el icono de red del panel.
- Todo lo que hagas en live se pierde al apagar. Para conservarlo, instálala con el icono **«Instalar Debian»** (Calamares).

**Probar sin USB (máquina virtual):**
```bash
qemu-system-x86_64 -enable-kvm -m 4096 -smp 4 -cdrom dist/finanzasos-amd64.hybrid.iso -vga virtio
```

## 3. Usar la suite en tu Arch sin la ISO

```bash
sudo pacman -S python-flask python-numpy conky librsvg
./run-dev.sh                 # abre la terminal FinanzasOS
./run-dev.sh grafico BTCUSDT # directamente en una vista y un símbolo
```

### Modo Finanzas en tu barra (junto a normal / incógnito / paranoico)

`./install-arch.sh` ya se ejecutó. Tu `~/.config/bspwm/bin/EnvMode` tiene ahora un **4º icono (gráfico de línea)**:

| Acción | Resultado |
|---|---|
| Clic izquierdo en 󰄨 | Activa el modo Finanzas: **cambia el fondo de pantalla** al financiero (renderizado a tu resolución), arranca el ticker en vivo arriba a la izquierda, levanta el servidor de datos y abre la terminal. El icono pasa a dorado. |
| Clic derecho en 󰄨 | Abre otra ventana de la terminal sin desactivar el modo. |
| Clic en 󰍹 (normal) | Restaura **tu fondo anterior** (`~/.fehbg`), cierra el ticker, la terminal y el servidor. |

Puede convivir con el modo privado. En el modo paranoico (sin red) funciona con datos de demostración.
La copia de seguridad del original está en `~/.config/bspwm/bin/EnvMode.bak-finanzas`.

## Licencias y créditos

- Gráficos: [TradingView Lightweight Charts™](https://www.tradingview.com/) (Apache 2.0).
- Datos: Yahoo Finance, Binance, CNN Business y alternative.me (uso personal y educativo).
- El resto del código es de este proyecto.
