/* Biblioteca de fórmulas financieras */
'use strict';

const FORMULAS = {
  'Rentabilidad': [
    ['Rentabilidad simple', `<i>R</i> = ${fr('<i>P</i><sub>1</sub> − <i>P</i><sub>0</sub> + <i>D</i>', '<i>P</i><sub>0</sub>')}`, 'Incluye la variación de precio y los dividendos cobrados.'],
    ['Rentabilidad logarítmica', `<i>r</i> = ln ${fr('<i>P<sub>t</sub></i>', '<i>P</i><sub><i>t</i>−1</sub>')}`, 'Aditiva en el tiempo; base de los modelos estadísticos.'],
    ['CAGR', `<i>CAGR</i> = (${fr('<i>V<sub>f</sub></i>', '<i>V<sub>i</sub></i>')})<sup>1/<i>n</i></sup> − 1`, 'Tasa anual compuesta equivalente.'],
    ['Rentabilidad ponderada por dinero (TIR)', `0 = ${SUM('<i>t</i>=0', '<i>n</i>')} ${fr('<i>FC<sub>t</sub></i>', '(1+<i>TIR</i>)<sup><i>t</i></sup>')}`, 'Tiene en cuenta aportaciones y retiradas.'],
    ['Interés compuesto', `<i>VF</i> = <i>VP</i> (1 + ${fr('<i>r</i>', '<i>m</i>')})<sup><i>m·n</i></sup> &nbsp; continuo: <i>VF</i> = <i>VP</i>·e<sup><i>rn</i></sup>`, 'm = capitalizaciones por año.'],
    ['Ecuación de Fisher', `(1 + <i>r<sub>nom</sub></i>) = (1 + <i>r<sub>real</sub></i>)(1 + <i>π</i>)`, 'Relación entre tipo nominal, real e inflación.'],
  ],
  'Riesgo y rendimiento ajustado': [
    ['Volatilidad anualizada', `<i>σ<sub>a</sub></i> = <i>σ</i> · ${sq('<i>N</i>')} &nbsp; (N = 252 días, 52 semanas, 12 meses)`, 'Desviación típica de las rentabilidades escalada al año.'],
    ['Ratio de Sharpe', `<i>S</i> = ${fr('<i>R<sub>p</sub></i> − <i>R<sub>f</sub></i>', '<i>σ<sub>p</sub></i>')}`, '> 1 bueno, > 2 muy bueno, > 3 excelente.'],
    ['Ratio de Sortino', `<i>So</i> = ${fr('<i>R<sub>p</sub></i> − <i>R<sub>f</sub></i>', '<i>σ<sub>bajista</sub></i>')}`, 'Solo penaliza la volatilidad negativa.'],
    ['Ratio de Calmar', `<i>Calmar</i> = ${fr('<i>CAGR</i>', '|<i>Máx. drawdown</i>|')}`, 'Rentabilidad por unidad de caída máxima.'],
    ['Máximo drawdown', `<i>MDD</i> = min<sub><i>t</i></sub> ( ${fr('<i>V<sub>t</sub></i>', 'max<sub><i>s</i>≤<i>t</i></sub> <i>V<sub>s</sub></i>')} − 1 )`, 'Peor caída desde un máximo previo.'],
    ['Beta (CAPM)', `<i>β</i> = ${fr('Cov(<i>R<sub>i</sub></i>, <i>R<sub>m</sub></i>)', 'Var(<i>R<sub>m</sub></i>)')} &nbsp;&nbsp; <i>E</i>[<i>R<sub>i</sub></i>] = <i>R<sub>f</sub></i> + <i>β</i>(<i>E</i>[<i>R<sub>m</sub></i>] − <i>R<sub>f</sub></i>)`, 'Sensibilidad al mercado y rentabilidad exigida.'],
    ['Alfa de Jensen', `<i>α</i> = <i>R<sub>p</sub></i> − [<i>R<sub>f</sub></i> + <i>β</i>(<i>R<sub>m</sub></i> − <i>R<sub>f</sub></i>)]`, 'Rentabilidad extra no explicada por el riesgo de mercado.'],
    ['VaR paramétrico', `<i>VaR<sub>α</sub></i> = <i>μ</i> − <i>z<sub>α</sub></i> · <i>σ</i> &nbsp; (<i>z</i><sub>95%</sub> = 1,645; <i>z</i><sub>99%</sub> = 2,326)`, 'Pérdida máxima esperada con un nivel de confianza.'],
    ['Expected Shortfall (CVaR)', `<i>ES<sub>α</sub></i> = <i>E</i>[<i>R</i> | <i>R</i> ≤ <i>VaR<sub>α</sub></i>]`, 'Pérdida media en el peor (1−α) de los casos.'],
    ['Varianza de cartera (2 activos)', `<i>σ<sub>p</sub></i>² = <i>w</i>₁²<i>σ</i>₁² + <i>w</i>₂²<i>σ</i>₂² + 2<i>w</i>₁<i>w</i>₂<i>ρ</i>₁₂<i>σ</i>₁<i>σ</i>₂`, 'Base de la diversificación de Markowitz.'],
    ['Criterio de Kelly', `<i>f</i>* = ${fr('<i>bp</i> − <i>q</i>', '<i>b</i>')}`, 'Fracción óptima de capital por apuesta.'],
  ],
  'Valoración': [
    ['Descuento de flujos (DCF)', `<i>V</i> = ${SUM('<i>t</i>=1', '<i>n</i>')} ${fr('<i>FCF<sub>t</sub></i>', '(1+<i>WACC</i>)<sup><i>t</i></sup>')} + ${fr('<i>VT</i>', '(1+<i>WACC</i>)<sup><i>n</i></sup>')}`, 'Valor intrínseco a partir de flujos futuros.'],
    ['WACC', `<i>WACC</i> = ${fr('<i>E</i>', '<i>V</i>')}<i>K<sub>e</sub></i> + ${fr('<i>D</i>', '<i>V</i>')}<i>K<sub>d</sub></i>(1 − <i>T</i>)`, 'Coste medio ponderado del capital.'],
    ['Modelo de Gordon', `<i>P</i><sub>0</sub> = ${fr('<i>D</i><sub>1</sub>', '<i>k</i> − <i>g</i>')}`, 'Valor de una acción con dividendos crecientes a tasa constante.'],
    ['PER y PEG', `<i>PER</i> = ${fr('<i>Precio</i>', '<i>BPA</i>')} &nbsp; <i>PEG</i> = ${fr('<i>PER</i>', '<i>g</i>')}`, 'PEG < 1 puede indicar infravaloración.'],
    ['EV / EBITDA', `<i>EV</i> = <i>Capitalización</i> + <i>Deuda neta</i> &nbsp; ${fr('<i>EV</i>', '<i>EBITDA</i>')}`, 'Múltiplo independiente de la estructura de capital.'],
    ['ROE (DuPont)', `<i>ROE</i> = ${fr('<i>BN</i>', '<i>Ventas</i>')} × ${fr('<i>Ventas</i>', '<i>Activo</i>')} × ${fr('<i>Activo</i>', '<i>Patrimonio</i>')}`, 'Margen × rotación × apalancamiento.'],
    ['Número de Graham', `<i>V</i> = ${sq('22,5 × <i>BPA</i> × <i>VCA</i>')}`, 'Precio máximo razonable según Benjamin Graham.'],
  ],
  'Renta fija': [
    ['Precio de un bono', `<i>P</i> = ${SUM('<i>t</i>=1', '<i>n</i>')} ${fr('<i>C</i>', '(1+<i>y</i>)<sup><i>t</i></sup>')} + ${fr('<i>N</i>', '(1+<i>y</i>)<sup><i>n</i></sup>')}`, 'Valor actual de cupones y nominal.'],
    ['Duración de Macaulay', `<i>D</i> = ${fr('1', '<i>P</i>')} ${SUM('<i>t</i>=1', '<i>n</i>')} ${fr('<i>t</i> · <i>FC<sub>t</sub></i>', '(1+<i>y</i>)<sup><i>t</i></sup>')}`, 'Vida media ponderada de los flujos.'],
    ['Duración modificada', `<i>D<sub>mod</sub></i> = ${fr('<i>D</i>', '1 + <i>y</i>/<i>m</i>')} &nbsp;&nbsp; ${fr('Δ<i>P</i>', '<i>P</i>')} ≈ −<i>D<sub>mod</sub></i> Δ<i>y</i> + ½ <i>C</i> (Δ<i>y</i>)²`, 'Sensibilidad del precio a los tipos (con convexidad).'],
    ['Rentabilidad corriente', `<i>RC</i> = ${fr('<i>Cupón anual</i>', '<i>Precio</i>')}`, 'Ingreso anual sobre precio pagado.'],
  ],
  'Derivados': [
    ['Black-Scholes (call)', `<i>C</i> = <i>S N</i>(<i>d</i>₁) − <i>K</i>e<sup>−<i>rT</i></sup><i>N</i>(<i>d</i>₂)`, 'Precio teórico de una opción europea.'],
    ['Paridad put-call', `<i>C</i> − <i>P</i> = <i>S</i> − <i>K</i>e<sup>−<i>rT</i></sup>`, 'Relación de no arbitraje entre call y put.'],
    ['Precio de un futuro', `<i>F</i> = <i>S</i> e<sup>(<i>r</i> − <i>q</i>)<i>T</i></sup>`, 'Coste de mantenimiento (cost of carry).'],
    ['Delta', `Δ = ${fr('∂<i>V</i>', '∂<i>S</i>')} = <i>N</i>(<i>d</i>₁)`, 'Variación de la prima por unidad del subyacente.'],
  ],
  'Indicadores técnicos': [
    ['Media móvil exponencial', `<i>EMA<sub>t</sub></i> = <i>α</i>·<i>P<sub>t</sub></i> + (1 − <i>α</i>)·<i>EMA</i><sub><i>t</i>−1</sub>, &nbsp; <i>α</i> = ${fr('2', '<i>n</i> + 1')}`, 'Más peso a los precios recientes.'],
    ['RSI', `<i>RSI</i> = 100 − ${fr('100', '1 + <i>RS</i>')}, &nbsp; <i>RS</i> = ${fr('Media subidas (Wilder)', 'Media bajadas (Wilder)')}`, '> 70 sobrecompra, < 30 sobreventa.'],
    ['MACD', `<i>MACD</i> = <i>EMA</i><sub>12</sub> − <i>EMA</i><sub>26</sub>, &nbsp; <i>Señal</i> = <i>EMA</i><sub>9</sub>(<i>MACD</i>), &nbsp; <i>Hist</i> = <i>MACD</i> − <i>Señal</i>`, 'Cruces indican cambios de momento.'],
    ['Bandas de Bollinger', `<i>BB</i> = <i>SMA<sub>n</sub></i> ± <i>k</i>·<i>σ<sub>n</sub></i>, &nbsp; %<i>B</i> = ${fr('<i>P</i> − <i>BB<sub>inf</sub></i>', '<i>BB<sub>sup</sub></i> − <i>BB<sub>inf</sub></i>')}`, 'Volatilidad dinámica alrededor de la media.'],
    ['Estocástico', `%<i>K</i> = 100 · ${fr('<i>C</i> − <i>L<sub>n</sub></i>', '<i>H<sub>n</sub></i> − <i>L<sub>n</sub></i>')}, &nbsp; %<i>D</i> = <i>SMA</i><sub>3</sub>(%<i>K</i>)`, 'Posición del cierre en el rango reciente.'],
    ['ATR', `<i>TR</i> = max(<i>H</i>−<i>L</i>, |<i>H</i>−<i>C</i><sub><i>t</i>−1</sub>|, |<i>L</i>−<i>C</i><sub><i>t</i>−1</sub>|), &nbsp; <i>ATR</i> = <i>RMA<sub>n</sub></i>(<i>TR</i>)`, 'Volatilidad absoluta; útil para stops.'],
    ['ADX', `<i>DX</i> = 100 · ${fr('|+<i>DI</i> − −<i>DI</i>|', '+<i>DI</i> + −<i>DI</i>')}, &nbsp; <i>ADX</i> = <i>RMA<sub>n</sub></i>(<i>DX</i>)`, '> 25 indica tendencia fuerte.'],
    ['OBV', `<i>OBV<sub>t</sub></i> = <i>OBV</i><sub><i>t</i>−1</sub> + sign(<i>C<sub>t</sub></i> − <i>C</i><sub><i>t</i>−1</sub>) · <i>V<sub>t</sub></i>`, 'El volumen precede al precio.'],
    ['VWAP', `<i>VWAP</i> = ${fr(SUM('', '') + ' <i>P<sub>típico</sub></i> · <i>V</i>', SUM('', '') + ' <i>V</i>')}`, 'Precio medio ponderado por volumen de la sesión.'],
    ['CCI', `<i>CCI</i> = ${fr('<i>TP</i> − <i>SMA<sub>n</sub></i>(<i>TP</i>)', '0,015 · <i>DesvMedia</i>')}`, '±100 delimita zonas extremas.'],
    ['MFI', `<i>MFI</i> = 100 − ${fr('100', '1 + <i>Flujo positivo</i> / <i>Flujo negativo</i>')}`, 'RSI ponderado por volumen.'],
    ['Ichimoku', `<i>Tenkan</i> = ${fr('<i>H</i><sub>9</sub> + <i>L</i><sub>9</sub>', '2')}, <i>Kijun</i> = ${fr('<i>H</i><sub>26</sub> + <i>L</i><sub>26</sub>', '2')}, <i>Senkou A</i> = ${fr('<i>Tenkan</i> + <i>Kijun</i>', '2')}`, 'Sistema completo de tendencia y soporte.'],
  ],
  'Backtesting': [
    ['Factor de beneficio', `<i>PF</i> = ${fr(SUM('', '') + ' Ganancias', '|' + SUM('', '') + ' Pérdidas|')}`, '> 1,5 robusto; < 1 pierde dinero.'],
    ['Esperanza matemática', `<i>E</i> = <i>p</i> · <i>G̅</i> − (1 − <i>p</i>) · |<i>P̅</i>|`, 'Ganancia media esperada por operación.'],
    ['System Quality Number', `<i>SQN</i> = ${sq('<i>N</i>')} · ${fr('<i>R̅</i>', '<i>σ<sub>R</sub></i>')}`, '> 2 bueno, > 3 excelente (Van Tharp).'],
    ['Acierto mínimo rentable', `<i>p<sub>min</sub></i> = ${fr('1', '1 + <i>R</i>:<i>B</i>')}`, 'Con R:B 1:2 basta acertar un 33,3 %.'],
  ],
};

App.views.formulas = (main) => {
  main.innerHTML = `<div class="view-title"><h1>Biblioteca de fórmulas</h1><span class="sub">${Object.values(FORMULAS).flat().length} fórmulas esenciales de economía y finanzas</span></div>
    <div class="calc-nav">${Object.keys(FORMULAS).map(k => `<a class="btn" href="javascript:void(0)" data-s="${k}">${k}</a>`).join('')}</div>
    ${Object.entries(FORMULAS).map(([sec, list]) => `<div class="card" style="margin-bottom:12px" id="sec-${sec.replace(/\W/g, '')}"><h3>${sec}</h3><div class="grid g2">${list.map(([n, f, d]) => `<div><b>${n}</b><div class="formula">${f}</div><div class="desc">${d}</div></div>`).join('')}</div></div>`).join('')}`;
  $$('[data-s]', main).forEach(a => a.onclick = () => document.getElementById('sec-' + a.dataset.s.replace(/\W/g, '')).scrollIntoView({ behavior: 'smooth' }));
};

/* ================= GUÍA ================= */
App.views.guia = (main) => { main.innerHTML = '<iframe id="guiaframe" src="/guia" title="Guía de FinanzasOS"></iframe>'; };
