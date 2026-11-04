/* Análisis cuantitativo y probabilidades */
'use strict';

App.views.analisis = async (main) => {
  main.innerHTML = `<div class="view-title"><h1>Análisis y probabilidades</h1><span class="sub">Estadística, riesgo, modelos probabilísticos y simulación Monte Carlo</span></div>`;
  const bar = symbolBar(() => run(), { tfs: ['15m', '1h', '4h', '1d', '1wk', '1mo'] });
  main.appendChild(bar);
  const box = el('<div></div>'); main.appendChild(box);
  if (!['15m', '1h', '4h', '1d', '1wk', '1mo'].includes(App.state.tf)) { App.state.tf = '1d'; $$('.tf button', bar).forEach(b => b.classList.toggle('on', b.dataset.tf === '1d')); }

  async function run() {
    box.innerHTML = loading('Calculando modelos estadísticos…');
    let r;
    try { r = await api(`/api/analysis?symbol=${encodeURIComponent(App.state.symbol)}&tf=${App.state.tf}`); }
    catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
    const s = r.stats, p = r.prob, mc = r.mc, t = r.summary.total;
    const k = (l, v, c = '') => `<div class="kpi"><div class="k">${l}</div><div class="v ${c}">${v}</div></div>`;
    box.innerHTML = `
    <div class="card" style="margin-bottom:12px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <div><div class="muted">${esc(r.meta.exchange || '')} · ${esc(r.meta.currency || '')} ${r.meta.source === 'demo' ? '<span class="badge down">DEMO</span>' : ''}</div><div style="font-size:20px;font-weight:800">${esc(r.meta.name)}</div></div>
      <div class="big ${cls(r.pct)}">${fmtP(r.price)}</div><div class="${cls(r.pct)} mono" style="font-size:15px">${arrow(r.pct)} ${fmtPct(r.pct)}</div>
      <span style="flex:1"></span><div class="muted mono">${s.n} velas · ${fmtDate(s.first)} → ${fmtDate(s.last)}</div>
      <button class="btn" onclick="App.go('grafico','${esc(App.state.symbol)}')">Ver gráfico</button><button class="btn primary" onclick="App.go('backtest','${esc(App.state.symbol)}')">Backtest</button></div>
    <div class="grid g3">
      <div class="card"><h3>Señal técnica global</h3>${gauge(t.score, { mode: 'signal', label: t.label, sub: `<span class="up">${t.buy} compra</span> · ${t.neutral} neutral · <span class="down">${t.sell} venta</span>` })}</div>
      <div class="card"><h3>Miedo / euforia del activo</h3>${gauge(r.sentiment.score, { label: r.sentiment.rating })}
        <div class="bars" style="margin-top:8px">${r.sentiment.components.map(c => `<div class="row"><span>${esc(c.name)} <span class="muted mono">${esc(c.value)}</span></span><div class="bar"><i style="width:${c.score}%;background:${fgColor(c.score)}"></i></div><b class="mono" style="color:${fgColor(c.score)};text-align:right">${Math.round(c.score)}</b></div>`).join('')}</div></div>
      <div class="card"><h3>Monte Carlo <span class="badge">${mc.horizon} velas · 2.000 escenarios</span></h3>
        <div class="grid g2">${k('Prob. de subida', fmtN(mc.p_up * 100, 1) + ' %', mc.p_up >= .5 ? 'up' : 'down')}${k('Mediana final', fmtP(mc.final_q[2]))}${k('Pesimista (P5)', fmtP(mc.final_q[0]), 'down')}${k('Optimista (P95)', fmtP(mc.final_q[4]), 'up')}</div>
        <div id="mcch" style="height:200px;margin-top:8px"></div></div>
    </div>

    <div class="card" style="margin-top:12px"><h3>Probabilidad de subida / bajada por horizonte <span class="badge gold">4 modelos combinados</span></h3>
      <div class="scroll" style="max-height:none"><table><tr><th>Horizonte</th><th style="width:26%">Probabilidad combinada</th><th class="num">↑ Sube</th><th class="num">↓ Baja</th><th class="num">Histórica</th><th class="num">Normal (GBM)</th><th class="num">Régimen actual</th><th class="num">Logística</th><th class="num">Ret. mediano</th><th class="num">P(+5 %)</th><th class="num">P(−5 %)</th><th class="num">Rango 90 % estimado</th></tr>
      ${p.horizons.map(h => `<tr><td><b>${h.label}</b> <span class="muted">(${h.bars})</span></td>
        <td><div class="bar" style="height:14px;background:#ea394355"><i style="width:${h.p_up * 100}%;background:linear-gradient(90deg,#0f8f5e,#16c784)"></i></div></td>
        <td class="num up"><b>${fmtN(h.p_up * 100, 1)} %</b></td><td class="num down"><b>${fmtN(h.p_down * 100, 1)} %</b></td>
        <td class="num">${fmtN(h.empirical * 100, 1)} %</td><td class="num">${fmtN(h.gbm * 100, 1)} %</td>
        <td class="num">${h.conditional == null ? '—' : fmtN(h.conditional * 100, 1) + ' %'} <span class="muted">${h.cond_n ? 'n=' + h.cond_n : ''}</span></td>
        <td class="num">${h.logistic == null ? '—' : fmtN(h.logistic * 100, 1) + ' %'}</td>
        <td class="num ${cls(h.median_ret)}">${fmtR(h.median_ret)}</td><td class="num">${fmtN(h.p_up5 * 100, 1)} %</td><td class="num">${fmtN(h.p_down5 * 100, 1)} %</td>
        <td class="num">${fmtP(h.range90[0])} – ${fmtP(h.range90[1])}</td></tr>`).join('')}</table></div>
      <div class="grid g2" style="margin-top:10px">
        <div><div class="formula"><i>P</i>(<i>S<sub>t+h</sub></i> &gt; <i>S<sub>t</sub></i>) <span class="op">=</span> Φ<span class="frac"><span><i>μ</i> · <i>h</i></span><span><i>σ</i> <span class="sqrt"><i>h</i></span></span></span> &nbsp;&nbsp; <span class="muted" style="font-size:12px">μ = ${fmtN(p.mu * 100, 4)} % · σ = ${fmtN(p.sigma * 100, 3)} % por vela</span></div>
        <div class="desc"><b>Histórica</b>: % de veces que el precio subió en ese horizonte en todo el historial. <b>Normal</b>: modelo log-normal (Black-Scholes) con deriva y volatilidad del último año. <b>Régimen actual</b>: solo momentos con RSI similar (±7,5) y mismo lado de la media de 50. <b>Logística</b>: regresión logística entrenada con RSI, MACD, %B, ROC, distancia a media y volatilidad.</div></div>
        <div class="note" style="margin:0">⚠ Las probabilidades son estimaciones estadísticas basadas en el pasado; los mercados no son estacionarios. Una probabilidad cercana al 50 % significa que no hay ventaja estadística apreciable.</div></div></div>

    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Rentabilidad y riesgo</h3><div class="kpis">
        ${k('Rent. total', fmtR(s.total_ret), cls(s.total_ret))}${k('Rent. anualizada', fmtR(s.ann_ret), cls(s.ann_ret))}${k('Volatilidad anual', fmtR(s.ann_vol).replace('+', ''))}
        ${k('Sharpe', fmtN(s.sharpe))}${k('Sortino', fmtN(s.sortino))}${k('Calmar', fmtN(s.calmar))}
        ${k('Máx. drawdown', fmtR(s.max_dd), 'down')}${k('Velas positivas', fmtN(s.pos_bars * 100, 1) + ' %')}${k('Mejor vela', fmtR(s.best), 'up')}
        ${k('Peor vela', fmtR(s.worst), 'down')}${k('Asimetría', fmtN(s.skew, 3))}${k('Curtosis exceso', fmtN(s.kurt, 2))}
        ${s.beta != null ? k('Beta vs S&P 500', fmtN(s.beta, 3)) + k('Correlación S&P', fmtN(s.corr, 3)) + k('Alfa anual', fmtR(s.alpha), cls(s.alpha)) : ''}
        ${k('Máx. 52 sem', fmtP(s.hi52))}${k('Mín. 52 sem', fmtP(s.lo52))}</div></div>
      <div class="card"><h3>Valor en riesgo (VaR) por vela</h3><div class="kpis">
        ${k('VaR 95 % histórico', fmtR(s.var95), 'down')}${k('VaR 99 % histórico', fmtR(s.var99), 'down')}${k('VaR 95 % paramétrico', fmtR(s.pvar95), 'down')}
        ${k('CVaR 95 % (ES)', fmtR(s.cvar95), 'down')}${k('CVaR 99 % (ES)', fmtR(s.cvar99), 'down')}</div>
        <div class="formula">VaR<sub>α</sub> <span class="op">=</span> <i>μ</i> <span class="op">−</span> <i>z</i><sub>α</sub> · <i>σ</i> &nbsp;&nbsp;&nbsp; CVaR<sub>α</sub> <span class="op">=</span> E[<i>r</i> | <i>r</i> ≤ VaR<sub>α</sub>]</div>
        <div class="desc">Con un 95 % de confianza, la pérdida en una vela no debería superar el VaR 95 %. El CVaR (Expected Shortfall) es la pérdida media en el 5 % de los peores casos.</div>
        <h3 style="margin-top:12px">Distribución de rentabilidades vs normal</h3><div id="histo"></div></div>
    </div>

    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Caídas desde máximos (drawdown)</h3><div id="ddch" style="height:230px"></div></div>
      <div class="card"><h3>Medias móviles y osciladores</h3><div class="grid g2"><div class="scroll" style="max-height:290px"><table><tr><th>Media</th><th class="num">Valor</th><th>Señal</th></tr>${r.summary.ma.map(x => sigRow(x)).join('')}</table></div><div class="scroll" style="max-height:290px"><table><tr><th>Oscilador</th><th class="num">Valor</th><th>Señal</th></tr>${r.summary.osc.map(x => sigRow(x)).join('')}</table></div></div></div>
    </div>
    ${r.season ? `<div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Estacionalidad mensual <span class="badge">rent. media · % años positivos</span></h3><div id="seasm"></div></div>
      <div class="card"><h3>Día de la semana</h3><div id="seasw"></div></div>
      <div class="card spanall"><h3>Rentabilidad mensual por año</h3><div class="scroll">${seasonTable(r.season.matrix)}</div></div></div>` : ''}
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h3>Puntos pivote (vela anterior)</h3><table><tr><th></th>${Object.keys(r.pivots).map(k => `<th class="num">${k}</th>`).join('')}</tr>${['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].map(k => `<tr><td class="${k[0] === 'R' ? 'down' : k[0] === 'S' ? 'up' : 'gold'}"><b>${k}</b></td>${Object.values(r.pivots).map(v => `<td class="num">${fmtP(v[k])}</td>`).join('')}</tr>`).join('')}</table></div>
      <div class="card"><h3>Soportes y resistencias detectados</h3><table><tr><th>Tipo</th><th class="num">Precio</th><th class="num">Distancia</th><th class="num">Toques</th></tr>${r.levels.map(l => `<tr><td class="${l.type === 'Soporte' ? 'up' : 'down'}">${l.type}</td><td class="num">${fmtP(l.price)}</td><td class="num">${fmtPct((l.price / r.price - 1) * 100)}</td><td class="num">${l.touches}</td></tr>`).join('')}</table></div>
    </div>`;
    // Monte Carlo
    const ch = LightweightCharts.createChart($('#mcch'), chartTheme({ rightPriceScale: { borderColor: '#1d2a3d' } }));
    App.onLeave(() => ch.remove());
    const hist = ch.addSeries(LightweightCharts.LineSeries, { color: '#e6edf6', lineWidth: 2, priceLineVisible: false });
    hist.setData(r.closes.map(([t, v]) => ({ time: t, value: v })));
    const band = (key, color, w = 1, style = 0) => { const sr = ch.addSeries(LightweightCharts.LineSeries, { color, lineWidth: w, lineStyle: style, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }); sr.setData([{ time: r.closes[r.closes.length - 1][0], value: r.price }, ...mc.times.map((t, i) => ({ time: t, value: mc.bands[key][i] }))]); };
    band('p95', '#16c784', 1, 2); band('p75', '#84cc16'); band('p50', '#f5b700', 2); band('p25', '#f97316'); band('p5', '#ea3943', 1, 2);
    ch.timeScale().fitContent();
    // Drawdown
    const dch = LightweightCharts.createChart($('#ddch'), chartTheme());
    App.onLeave(() => dch.remove());
    const dd = dch.addSeries(LightweightCharts.AreaSeries, { lineColor: '#ea3943', topColor: '#ea394305', bottomColor: '#ea394366', lineWidth: 1, invertFilledArea: true, priceFormat: { type: 'percent' } });
    const seen = new Set(); dd.setData(s.dd_series.filter(p => !seen.has(p[0]) && seen.add(p[0])).map(([t, v]) => ({ time: t, value: v * 100 })));
    dch.timeScale().fitContent();
    // Histograma
    const e = s.hist.edges, mid = s.hist.counts.map((c, i) => (e[i] + e[i + 1]) / 2);
    $('#histo').innerHTML = svgChart([{ type: 'bar', data: mid.map((x, i) => [x, s.hist.counts[i]]), color: x => '#3b82f6', name: 'Frecuencia real' }, { type: 'line', data: mid.map((x, i) => [x, s.hist.normal[i]]), color: '#f5b700', name: 'Distribución normal' }], { h: 200, y0: 0, xfmt: v => fmtN(v, 1) + '%', yfmt: v => fmtN(v, 0) });
    if (r.season) {
      const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      $('#seasm').innerHTML = svgChart([{ type: 'bar', data: r.season.month.map(m => [m.m, m.avg * 100]), color: v => v >= 0 ? '#16c784' : '#ea3943' }], { h: 200, xticks: 11, xfmt: v => M[Math.round(v) - 1] || '', yfmt: v => fmtN(v, 1) + '%' }) +
        `<table class="hm"><tr>${r.season.month.map(m => `<td style="background:${heatColor((m.pos - .5) * 8)}">${M[m.m - 1]}<br>${fmtN(m.pos * 100, 0)}%</td>`).join('')}</tr></table>`;
      const W = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const wd = r.season.wday.filter(w => w.avg !== 0);
      $('#seasw').innerHTML = svgChart([{ type: 'bar', data: wd.map(w => [w.d, w.avg * 100]), color: v => v >= 0 ? '#16c784' : '#ea3943' }], { h: 200, xticks: Math.max(1, wd.length - 1), xfmt: v => W[Math.round(v)] || '', yfmt: v => fmtN(v, 3) + '%' }) +
        `<table><tr><th>Día</th><th class="num">Rent. media</th><th class="num">% positivos</th></tr>${wd.map(w => `<tr><td>${W[w.d]}</td><td class="num ${cls(w.avg)}">${fmtR(w.avg, 3)}</td><td class="num">${fmtN(w.pos * 100, 1)} %</td></tr>`).join('')}</table>`;
    }
  }
  function sigRow(x) { const c = x.signal === 'Compra' ? 'up' : x.signal === 'Venta' ? 'down' : ''; return `<tr><td>${esc(x.name)}</td><td class="num">${fmtP(x.value)}</td><td><span class="badge ${c}">${x.signal}</span></td></tr>`; }
  run();
};

function seasonTable(matrix) {
  const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const years = Object.keys(matrix).sort().reverse().slice(0, 30);
  return `<table class="hm"><tr><th>Año</th>${M.map(m => `<th style="text-align:center">${m}</th>`).join('')}<th style="text-align:center">Año</th></tr>${years.map(y => {
    const row = matrix[y]; const tot = row.reduce((a, v) => v == null ? a : a * (1 + v), 1) - 1;
    return `<tr><th>${y}</th>${row.map(v => v == null ? '<td></td>' : `<td style="background:${heatColor(v * 100, 6)}">${fmtN(v * 100, 1)}</td>`).join('')}<td style="background:${heatColor(tot * 100, 25)};font-weight:700">${fmtN(tot * 100, 1)}</td></tr>`;
  }).join('')}</table>`;
}
