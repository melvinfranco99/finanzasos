/* Gráficos profesionales multipanel */
'use strict';

const DEFAULT_INDS = [
  { id: 'ema21', key: 'ema', params: { period: 21 } }, { id: 'sma50', key: 'sma', params: { period: 50 } },
  { id: 'sma200', key: 'sma', params: { period: 200 } }, { id: 'bb', key: 'bb', params: { period: 20, k: 2 } },
  { id: 'vol', key: 'volume', params: { ma: 20 } }, { id: 'rsi', key: 'rsi', params: { period: 14 } },
  { id: 'macd', key: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
];
const RANGES = { '1m': ['1d', '5d'], '5m': ['1d', '5d', '1mo'], '15m': ['5d', '1mo'], '30m': ['5d', '1mo'], '1h': ['1mo', '3mo', '6mo', '1y', '2y'], '4h': ['3mo', '6mo', '1y', '2y'], '1d': ['3mo', '6mo', '1y', '2y', '5y', '10y', 'max'], '1wk': ['2y', '5y', '10y', 'max'], '1mo': ['5y', '10y', 'max'] };
const RANGE_ES = { '1d': '1 día', '5d': '5 días', '1mo': '1 mes', '3mo': '3 meses', '6mo': '6 meses', '1y': '1 año', '2y': '2 años', '5y': '5 años', '10y': '10 años', max: 'Todo' };
const SMA200_COLOR = '#ef4444';

App.views.grafico = async (main) => {
  const st = App.state;
  st.inds = st.inds || DEFAULT_INDS.slice();
  st.ctype = st.ctype || 'candle';
  const registry = App.indReg || (App.indReg = await api('/api/indicators'));
  main.innerHTML = '';
  main.style.paddingBottom = '12px';
  App.onLeave(() => main.style.paddingBottom = '');
  const bar = symbolBar(() => { st.range = null; load(true); });
  bar.insertAdjacentHTML('beforeend', `
    <select id="rng" title="Rango histórico"></select>
    <div class="seg" id="ctype">${[['candle', 'Velas'], ['ha', 'Heikin-Ashi'], ['bar', 'Barras'], ['line', 'Línea'], ['area', 'Área']].map(([k, n]) => `<button data-k="${k}" class="${st.ctype === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <button class="btn" id="bInd">ƒx Indicadores <span class="badge gold" id="nInd">${st.inds.length}</span></button>
    <button class="btn ${st.log ? 'on' : ''}" id="bLog">Escala log</button>
    <button class="btn ${st.sr ? 'on' : ''}" id="bSR">Soportes/Resist.</button>
    <button class="btn" id="bLine" title="Haz clic en el gráfico para fijar una línea horizontal">＋ Línea H</button>
    <button class="btn" id="bClear">Borrar líneas</button>
    <span class="sp"></span><button class="btn" id="bFit">Ajustar</button>
    <button class="btn primary" id="bAn">Analizar ➜</button>
    <button class="btn" id="bBt">Backtest ➜</button>`);
  main.appendChild(bar);
  main.appendChild(el(`<div class="chart-wrap"><div id="chartbox"><div class="wm" id="wm"></div><div class="legend" id="legend"></div><div id="cv" style="position:absolute;inset:0"></div></div>
    <div class="side"><div class="card" id="qcard">${loading()}</div><div class="card" id="tcard">${loading()}</div><div class="card" id="pcard"></div></div></div>`));

  // Ajusta la altura del gráfico al hueco visible para que el eje de fechas quede siempre a la vista
  const wrap = main.querySelector('.chart-wrap');
  const fitH = () => { const top = wrap.getBoundingClientRect().top + main.scrollTop; wrap.style.height = Math.max(480, innerHeight - top - 22) + 'px'; };
  fitH(); addEventListener('resize', fitH); App.onLeave(() => removeEventListener('resize', fitH));
  let chart = null, mainSeries = null, data = null, lineMode = false, userLines = [], srLines = [], seriesByInd = {};
  const fillRanges = () => {
    const opts = RANGES[st.tf] || RANGES['1d'];
    if (!opts.includes(st.range)) st.range = st.tf === '1d' ? '2y' : st.tf === '1wk' ? '10y' : opts[opts.length - 1];
    $('#rng').innerHTML = opts.map(r => `<option value="${r}" ${r === st.range ? 'selected' : ''}>${RANGE_ES[r]}</option>`).join('');
  };
  fillRanges();
  $('#rng').onchange = e => { st.range = e.target.value; App.saveState(); load(true); };
  $$('#ctype button').forEach(b => b.onclick = () => { st.ctype = b.dataset.k; App.saveState(); $$('#ctype button').forEach(x => x.classList.toggle('on', x === b)); build(); });
  $('#bLog').onclick = e => { st.log = !st.log; App.saveState(); e.target.classList.toggle('on', st.log); mainSeries && mainSeries.priceScale().applyOptions({ mode: st.log ? 1 : 0 }); };
  $('#bSR').onclick = e => { st.sr = !st.sr; App.saveState(); e.target.classList.toggle('on', st.sr); drawSR(); };
  $('#bLine').onclick = e => { lineMode = !lineMode; e.target.classList.toggle('on', lineMode); };
  $('#bClear').onclick = () => { userLines.forEach(l => mainSeries.removePriceLine(l)); userLines = []; };
  $('#bFit').onclick = () => chart && chart.timeScale().fitContent();
  $('#bAn').onclick = () => App.go('analisis', st.symbol);
  $('#bBt').onclick = () => App.go('backtest', st.symbol);
  $('#bInd').onclick = () => togglePicker();

  function togglePicker() {
    const ex = $('.indpick'); if (ex) { ex.remove(); return; }
    const groups = {};
    Object.entries(registry).forEach(([k, v]) => (groups[v.group] = groups[v.group] || []).push([k, v]));
    const pk = el(`<div class="indpick"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:14px">Indicadores técnicos</b><span class="muted">(${Object.keys(registry).length} disponibles · puedes añadir el mismo varias veces con distintos parámetros)</span><span class="sp" style="flex:1"></span><button class="btn" id="pkClose">✕</button></div>
      <div class="grp">Activos</div><div class="chips" id="pkActive"></div>
      ${Object.entries(groups).map(([g, items]) => `<div class="grp">${g}</div>${items.map(([k, v]) => `<div class="indrow"><span class="nm">${esc(v.name)} <span class="muted">${v.pane === 'overlay' ? '· sobre precio' : '· panel'}</span></span>
        ${Object.entries(v.params).map(([p, d]) => `<input type="number" step="any" data-k="${k}" data-p="${p}" value="${d}" title="${p}">`).join('')}<button class="btn" data-add="${k}">Añadir</button></div>`).join('')}`).join('')}</div>`);
    $('#chartbox').appendChild(pk);
    const renderActive = () => {
      $('#pkActive', pk).innerHTML = st.inds.map((it, i) => `<span class="chip"><i style="background:${registry[it.key].outputs[0][2]}"></i>${esc(indLabel(it))}<b data-rm="${i}">✕</b></span>`).join('') || '<span class="muted">Ninguno</span>';
      $$('[data-rm]', pk).forEach(b => b.onclick = () => { st.inds.splice(+b.dataset.rm, 1); changed(); renderActive(); });
    };
    renderActive();
    $('#pkClose', pk).onclick = () => pk.remove();
    $$('[data-add]', pk).forEach(b => b.onclick = () => {
      const k = b.dataset.add, params = {};
      $$(`input[data-k="${k}"]`, pk).forEach(i => params[i.dataset.p] = +i.value);
      st.inds.push({ id: k + Date.now(), key: k, params }); changed(); renderActive();
    });
    function changed() { $('#nInd').textContent = st.inds.length; App.saveState(); load(true); }
  }
  function indLabel(it) { const p = Object.values(it.params || {}); return registry[it.key].outputs.length === 1 && registry[it.key].pane === 'overlay' ? `${registry[it.key].outputs[0][1]} ${p.join(',')}` : `${registry[it.key].name.split(' (')[0]} ${p.join(',')}`; }

  async function load(full) {
    if (full) { App._sum = null; $('#legend').innerHTML = '<span class="muted">Cargando…</span>'; fillRanges(); }
    try {
      const url = `/api/chart?symbol=${encodeURIComponent(st.symbol)}&tf=${st.tf}&range=${st.range}&ind=${encodeURIComponent(JSON.stringify(st.inds.map(i => ({ id: i.id, key: i.key, params: i.params }))))}`;
      const d = await api(url);
      const firstLoad = !data || full;
      data = d;
      if (firstLoad) build(); else update();
      quoteCard();
      if (full) sideCards();
    } catch (e) { $('#legend').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  function candlesFrom(d) {
    let { t, o, h, l, c } = d;
    if (st.ctype === 'ha') {
      const ho = [], hc = [], hh = [], hl = [];
      for (let i = 0; i < t.length; i++) {
        hc[i] = (o[i] + h[i] + l[i] + c[i]) / 4; ho[i] = i ? (ho[i - 1] + hc[i - 1]) / 2 : (o[i] + c[i]) / 2;
        hh[i] = Math.max(h[i], ho[i], hc[i]); hl[i] = Math.min(l[i], ho[i], hc[i]);
      }
      o = ho; c = hc; h = hh; l = hl;
    }
    if (st.ctype === 'line' || st.ctype === 'area') return t.map((x, i) => ({ time: x, value: c[i] }));
    return t.map((x, i) => ({ time: x, open: o[i], high: h[i], low: l[i], close: c[i] }));
  }
  function precisionFor(p) { const a = Math.abs(p); return a < 0.01 ? 8 : a < 1 ? 5 : a < 20 ? 4 : 2; }

  function indData(d, it, outKey, type, color) {
    const arr = it.outputs[outKey]; if (!arr) return [];
    const res = [];
    for (let i = 0; i < d.t.length; i++) {
      const v = arr[i];
      if (v == null) { res.push({ time: d.t[i] }); continue; }
      const p = { time: d.t[i], value: v };
      if (it.key === 'volume' && outKey === 'v') p.color = it.outputs.up[i] ? '#16c78466' : '#ea394366';
      else if (type === 'hist' && (it.key === 'macd' || it.key === 'ao' || it.key === 'cmf')) {
        const prev = i ? arr[i - 1] : v; p.color = v >= 0 ? (v >= prev ? '#16c784' : '#16c78477') : (v <= prev ? '#ea3943' : '#ea394377');
      } else if (it.key === 'supertrend') p.color = it.outputs.dir[i] > 0 ? '#16c784' : '#ea3943';
      res.push(p);
    }
    return res;
  }

  function build() {
    if (!data) return;
    if (chart) { chart.remove(); chart = null; }
    const d = data, prec = precisionFor(d.c[d.c.length - 1]);
    const intra = isIntraday(st.tf);
    chart = LightweightCharts.createChart($('#cv'), chartTheme({ localization: { locale: 'es-ES', timeFormatter: t => crossFmt(t, intra) } }));
    App.onLeave(() => { try { chart && chart.remove(); } catch (e) {} });
    const L = LightweightCharts, pf = { type: 'price', precision: prec, minMove: 1 / 10 ** prec };
    if (st.ctype === 'line') mainSeries = chart.addSeries(L.LineSeries, { color: '#f5b700', lineWidth: 2, priceFormat: pf });
    else if (st.ctype === 'area') mainSeries = chart.addSeries(L.AreaSeries, { lineColor: '#f5b700', topColor: '#f5b70055', bottomColor: '#f5b70003', lineWidth: 2, priceFormat: pf });
    else if (st.ctype === 'bar') mainSeries = chart.addSeries(L.BarSeries, { upColor: '#16c784', downColor: '#ea3943', priceFormat: pf });
    else mainSeries = chart.addSeries(L.CandlestickSeries, { upColor: '#16c784', downColor: '#ea3943', borderUpColor: '#16c784', borderDownColor: '#ea3943', wickUpColor: '#16c784aa', wickDownColor: '#ea3943aa', priceFormat: pf });
    mainSeries.setData(candlesFrom(d));
    mainSeries.priceScale().applyOptions({ mode: st.log ? 1 : 0, scaleMargins: { top: 0.08, bottom: 0.06 } });
    seriesByInd = {};
    let pane = 0;
    const paneOf = {};
    d.indicators.forEach(it => {
      const spec = registry[it.key]; if (!spec || it.error) return;
      const p = spec.pane === 'overlay' ? 0 : (paneOf[it.id] = ++pane);
      const conf = st.inds.find(x => x.id === it.id);
      seriesByInd[it.id] = spec.outputs.map(([k, name, color, type], j) => {
        const c = (it.key === 'sma' && conf?.params?.period >= 200) ? SMA200_COLOR : color;
        const base = { color: c, priceLineVisible: false, lastValueVisible: p > 0, crosshairMarkerVisible: false, title: p > 0 && j === 0 ? '' : '' };
        let s;
        if (type === 'hist') s = chart.addSeries(L.HistogramSeries, Object.assign(base, it.key === 'volume' ? { priceFormat: { type: 'volume' } } : { priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } }), p);
        else if (type === 'dots') s = chart.addSeries(L.LineSeries, Object.assign(base, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6, priceFormat: pf }), p);
        else s = chart.addSeries(L.LineSeries, Object.assign(base, { lineWidth: it.key === 'bb' || it.key === 'keltner' || it.key === 'donchian' ? 1 : 2, lineStyle: (k === 'mid') ? 2 : 0, priceFormat: p === 0 ? pf : { type: 'price', precision: it.key === 'obv' || it.key === 'adl' ? 0 : 2, minMove: 0.01 } }), p);
        s.setData(indData(d, it, k, type, c));
        if (j === 0 && spec.levels) spec.levels.forEach(lv => s.createPriceLine({ price: lv, color: '#475569', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
        return { s, k, type, name, color: c, key: it.key };
      });
    });
    const panes = chart.panes();
    const total = $('#cv').clientHeight || 600, sub = panes.length - 1;
    const subH = sub ? Math.max(70, Math.min(130, total * 0.42 / sub)) : 0;
    panes.forEach((p, i) => i > 0 && p.setHeight(subH));
    // Leyenda
    $('#wm').textContent = st.symbol;
    const legend = (param) => {
      const i = param && param.time != null ? d.t.indexOf(param.time) : d.t.length - 1;
      if (i < 0) return;
      const chg = i > 0 ? (d.c[i] / d.c[i - 1] - 1) * 100 : 0;
      const ind = d.indicators.filter(x => !x.error).map(it => {
        const spec = registry[it.key];
        return `<span style="margin-right:10px">${spec.outputs.map(([k, n, c]) => it.outputs[k] && it.outputs[k][i] != null ? `<span style="color:${c}">${n} ${fmtP(it.outputs[k][i])}</span>` : '').join(' ')}</span>`;
      }).join('');
      $('#legend').innerHTML = `<div><span class="sym">${esc(d.meta.name)}</span> <span class="muted">${esc(st.symbol)} · ${st.tf.toUpperCase()} · ${esc(d.meta.exchange || '')} · ${esc(d.meta.currency || '')}</span> ${d.meta.source === 'demo' ? '<span class="badge down">DEMO sin conexión</span>' : `<span class="badge up">● ${d.meta.source}</span>`}</div>
        <div>A <b>${fmtP(d.o[i])}</b> Máx <b class="up">${fmtP(d.h[i])}</b> Mín <b class="down">${fmtP(d.l[i])}</b> C <b>${fmtP(d.c[i])}</b> <span class="${cls(chg)}">${fmtPct(chg)}</span> Vol <b>${fmtBig(d.v[i])}</b> <span class="muted">${fmtDate(d.t[i], isIntraday(st.tf))}</span></div>
        <div class="ind">${ind}</div>`;
    };
    chart.subscribeCrosshairMove(legend); legend();
    chart.subscribeClick(param => {
      if (!lineMode || !param.point) return;
      const price = mainSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
      userLines.push(mainSeries.createPriceLine({ price, color: '#f5b700', lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: 'Nivel' }));
      lineMode = false; $('#bLine').classList.remove('on');
    });
    const n = d.t.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 180), to: n + 6 });
    drawSR();
  }

  function update() {
    if (!chart) return build();
    const d = data;
    mainSeries.setData(candlesFrom(d));
    d.indicators.forEach(it => (seriesByInd[it.id] || []).forEach(x => x.s.setData(indData(d, it, x.k, x.type, x.color))));
  }

  async function drawSR() {
    srLines.forEach(l => { try { mainSeries.removePriceLine(l); } catch (e) {} }); srLines = [];
    if (!st.sr || !mainSeries) return;
    const r = App._sum || await api(`/api/summary?symbol=${encodeURIComponent(st.symbol)}&tf=${st.tf}`);
    r.levels.forEach(lv => srLines.push(mainSeries.createPriceLine({ price: lv.price, color: lv.type === 'Soporte' ? '#16c784aa' : '#ea3943aa', lineWidth: 1, lineStyle: 1, title: `${lv.type[0]}${lv.touches}` })));
  }

  function quoteCard() {
    const d = data, x = d.last;
    const hi = Math.max(...d.h.slice(-252)), lo = Math.min(...d.l.slice(-252));
    $('#qcard').innerHTML = `<h3>${esc(st.symbol)} <span class="badge">${esc(d.meta.type || '')}</span></h3>
      <div class="muted" style="margin-top:-6px">${esc(d.meta.name)}</div>
      <div class="big ${cls(x.pct)}" style="margin-top:4px">${fmtP(x.price)} <span style="font-size:13px" class="muted">${esc(d.meta.currency || '')}</span></div>
      <div class="${cls(x.pct)} mono">${arrow(x.pct)} ${fmtP(x.change)} (${fmtPct(x.pct)})</div>
      <table style="margin-top:8px"><tr><td class="muted">Máx. vela</td><td class="num">${fmtP(x.high)}</td><td class="muted">Mín. vela</td><td class="num">${fmtP(x.low)}</td></tr>
      <tr><td class="muted">Máx. periodo</td><td class="num">${fmtP(hi)}</td><td class="muted">Mín. periodo</td><td class="num">${fmtP(lo)}</td></tr>
      <tr><td class="muted">Volumen</td><td class="num">${fmtBig(x.volume)}</td><td class="muted">Velas</td><td class="num">${d.t.length}</td></tr></table>
      <div style="margin-top:8px"><div class="bar" style="height:6px"><i style="left:${(x.price - lo) / (hi - lo || 1) * 100}%;width:3px;background:var(--gold)"></i></div><div class="note">Posición en el rango del periodo</div></div>`;
  }

  async function sideCards() {
    $('#tcard').innerHTML = loading(); $('#pcard').innerHTML = '';
    try {
      const r = App._sum = await api(`/api/summary?symbol=${encodeURIComponent(st.symbol)}&tf=${st.tf}`);
      const t = r.summary.total;
      $('#tcard').innerHTML = `<h3>Resumen técnico <span class="badge">${st.tf.toUpperCase()}</span></h3>${gauge(t.score, { mode: 'signal', label: t.label, sub: `<span class="up">${t.buy} compra</span> · ${t.neutral} neutral · <span class="down">${t.sell} venta</span>` })}
        <div class="grid g2" style="margin-top:8px"><div class="kpi"><div class="k">Medias móviles</div><div class="v" style="font-size:14px">${r.summary.tally_ma.label}</div></div><div class="kpi"><div class="k">Osciladores</div><div class="v" style="font-size:14px">${r.summary.tally_osc.label}</div></div></div>
        <div style="margin-top:12px">${gauge(r.sentiment.score, { label: 'Sentimiento: ' + r.sentiment.rating })}</div>`;
      const pv = r.pivots['Clásico'], fb = r.pivots['Fibonacci'], cm = r.pivots['Camarilla'];
      $('#pcard').innerHTML = `<h3>Puntos pivote</h3><table><tr><th></th><th class="num">Clásico</th><th class="num">Fibonacci</th><th class="num">Camarilla</th></tr>
        ${['R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3'].map(k => `<tr><td class="${k[0] === 'R' ? 'down' : k[0] === 'S' ? 'up' : 'gold'}"><b>${k}</b></td><td class="num">${fmtP(pv[k])}</td><td class="num">${fmtP(fb[k])}</td><td class="num">${fmtP(cm[k])}</td></tr>`).join('')}</table>
        <h3 style="margin-top:14px">Soportes y resistencias</h3><table>${r.levels.map(l => `<tr><td class="${l.type === 'Soporte' ? 'up' : 'down'}">${l.type}</td><td class="num">${fmtP(l.price)}</td><td class="num muted">${l.touches} toques</td></tr>`).join('')}</table>`;
      if (st.sr) drawSR();
    } catch (e) { $('#tcard').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  App._sum = null;
  await load(true);
  const ms = ['1m', '5m', '15m'].includes(st.tf) ? 5000 : ['30m', '1h', '4h'].includes(st.tf) ? 15000 : 30000;
  App.every(ms, () => data && load(false));
};
