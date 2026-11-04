/* Backtesting y optimizador */
'use strict';

const BT_TFS = ['5m', '15m', '30m', '1h', '4h', '1d', '1wk'];
const PARAM_ES = { fast: 'Rápida', slow: 'Lenta', kind: 'Tipo media', period: 'Periodo', low: 'Nivel bajo', high: 'Nivel alto', signal: 'Señal', k: 'Desv. (k)', entry: 'Velas entrada', exit: 'Velas salida', mult: 'Multiplicador', trend: 'Media tendencia' };

function btCommonForm(st) {
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="form">
    <label class="f">Activo (busca por nombre o símbolo)<input id="bSym" value="${esc(st.symbol)}" placeholder="bitcoin, santander, SPY…"></label>
    <label class="f">Temporalidad<select id="bTf">${BT_TFS.map(t => `<option ${t === (st.btTf || '1d') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Desde<input type="date" id="bFrom" value="${st.btFrom || '2015-01-01'}"></label>
    <label class="f">Hasta<input type="date" id="bTo" value="${st.btTo || today}"></label>
    <label class="f">Capital inicial (€)<input type="number" id="bCap" value="${st.btCap || 10000}" step="100"></label>
    <label class="f">Tamaño posición (% capital)<input type="number" id="bSize" value="${st.btSize || 100}" min="1" max="100"></label>
    <label class="f">Dirección<select id="bDir"><option value="long">Solo largos (compras)</option><option value="short">Solo cortos (ventas)</option><option value="both">Largos y cortos</option></select></label>
    <label class="f">Stop-loss %<input type="number" id="bSL" value="${st.btSL ?? 0}" step="0.5" min="0"></label>
    <label class="f">Take-profit %<input type="number" id="bTP" value="${st.btTP ?? 0}" step="0.5" min="0"></label>
    <label class="f">Trailing stop %<input type="number" id="bTR" value="${st.btTR ?? 0}" step="0.5" min="0"></label>
    <label class="f">SL en ATR (×)<input type="number" id="bSLA" value="0" step="0.5" min="0"></label>
    <label class="f">TP en ATR (×)<input type="number" id="bTPA" value="0" step="0.5" min="0"></label>
    <label class="f">Máx. velas en posición<input type="number" id="bMax" value="0" min="0"></label>
    <label class="f">Comisión % por orden<input type="number" id="bFee" value="0" step="0.01" min="0"></label>
    <label class="f">Deslizamiento %<input type="number" id="bSlip" value="0" step="0.01" min="0"></label>
  </div><div class="note">0 = desactivado. Por defecto sin comisiones, intereses ni impuestos. Las señales se calculan al cierre y se ejecutan en la apertura de la vela siguiente. Intradía limitado por Yahoo (5–30m: 60 días; 1h/4h: 2 años); cripto (Binance) hasta 6.000 velas.</div>`;
}
function btReadCommon() {
  const st = App.state, v = id => $('#' + id).value;
  Object.assign(st, { symbol: v('bSym').trim().toUpperCase(), btTf: v('bTf'), btFrom: v('bFrom'), btTo: v('bTo'), btCap: +v('bCap'), btSize: +v('bSize'), btSL: +v('bSL'), btTP: +v('bTP'), btTR: +v('bTR') });
  App.saveState();
  return { symbol: st.symbol, tf: st.btTf, start: st.btFrom, end: st.btTo,
    cfg: { capital: +v('bCap'), size_pct: +v('bSize'), direction: v('bDir'), sl_pct: +v('bSL'), tp_pct: +v('bTP'), trail_pct: +v('bTR'), sl_atr: +v('bSLA'), tp_atr: +v('bTPA'), max_bars: +v('bMax'), commission_pct: +v('bFee'), slippage_pct: +v('bSlip') } };
}

/* ---------- Constructor de reglas ---------- */
function operandHTML(reg, op = { kind: 'price', field: 'c' }) {
  const indOpts = Object.entries(reg).map(([k, v]) => `<option value="${k}" ${op.key === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  return `<span class="opnd"><select class="okind"><option value="price" ${op.kind === 'price' ? 'selected' : ''}>Precio</option><option value="ind" ${op.kind === 'ind' ? 'selected' : ''}>Indicador</option><option value="value" ${op.kind === 'value' ? 'selected' : ''}>Valor fijo</option></select>
    <span class="oprice" ${op.kind !== 'price' ? 'hidden' : ''}><select class="ofield">${[['c', 'Cierre'], ['o', 'Apertura'], ['h', 'Máximo'], ['l', 'Mínimo']].map(([k, n]) => `<option value="${k}" ${op.field === k ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
    <span class="oind" ${op.kind !== 'ind' ? 'hidden' : ''}><select class="okey">${indOpts}</select><select class="oout"></select><span class="oparams"></span></span>
    <span class="oval" ${op.kind !== 'value' ? 'hidden' : ''}><input type="number" class="ovalue" step="any" value="${op.value ?? 0}"></span></span>`;
}
function wireOperand(span, reg, op = {}) {
  const kind = $('.okind', span), key = $('.okey', span);
  const refresh = (keepParams) => {
    const spec = reg[key.value];
    $('.oout', span).innerHTML = spec.outputs.map(([k, n]) => `<option value="${k}" ${op.out === k ? 'selected' : ''}>${n}</option>`).join('');
    $('.oparams', span).innerHTML = Object.entries(spec.params).map(([p, d]) => `<input type="number" step="any" data-p="${p}" title="${p}" value="${keepParams && op.params && op.params[p] != null ? op.params[p] : d}">`).join('');
  };
  kind.onchange = () => { $('.oprice', span).hidden = kind.value !== 'price'; $('.oind', span).hidden = kind.value !== 'ind'; $('.oval', span).hidden = kind.value !== 'value'; };
  key.onchange = () => refresh(false);
  refresh(true);
}
function readOperand(span) {
  const kind = $('.okind', span).value;
  if (kind === 'price') return { kind, field: $('.ofield', span).value };
  if (kind === 'value') return { kind, value: +$('.ovalue', span).value };
  const params = {}; $$('.oparams input', span).forEach(i => params[i.dataset.p] = +i.value);
  return { kind, key: $('.okey', span).value, out: $('.oout', span).value, params };
}
function addRule(container, reg, rule) {
  rule = rule || { left: { kind: 'ind', key: 'rsi', out: 'v', params: { period: 14 } }, op: 'crosses_above', right: { kind: 'value', value: 30 } };
  const ops = { crosses_above: 'cruza al alza', crosses_below: 'cruza a la baja', gt: 'mayor que >', lt: 'menor que <', rising: 'está subiendo', falling: 'está bajando' };
  const r = el(`<div class="rule">${operandHTML(reg, rule.left)}<select class="rop">${Object.entries(ops).map(([k, n]) => `<option value="${k}" ${rule.op === k ? 'selected' : ''}>${n}</option>`).join('')}</select>${operandHTML(reg, rule.right)}<span class="x" title="Eliminar">✕</span></div>`);
  container.appendChild(r);
  const [a, b] = $$('.opnd', r); wireOperand(a, reg, rule.left); wireOperand(b, reg, rule.right);
  $('.x', r).onclick = () => r.remove();
}
function readRules(container) { return $$('.rule', container).map(r => { const [a, b] = $$('.opnd', r); return { left: readOperand(a), op: $('.rop', r).value, right: readOperand(b) }; }); }

/* ================= BACKTEST ================= */
App.views.backtest = async (main) => {
  const st = App.state;
  const [pr, reg] = await Promise.all([App.presets || (App.presets = await api('/api/presets')), App.indReg || (App.indReg = await api('/api/indicators'))]);
  st.btPreset = st.btPreset || 'ma_cross';
  main.innerHTML = `<div class="view-title"><h1>Backtesting</h1><span class="sub">Prueba estrategias sobre datos históricos reales con gestión monetaria completa</span></div>
  <div class="card"><h3>1 · Mercado, capital y gestión del riesgo</h3>${btCommonForm(st)}</div>
  <div class="card" style="margin-top:12px"><h3>2 · Estrategia</h3>
    <div class="tabs" id="mtabs"><button data-m="preset" class="on">Estrategias predefinidas</button><button data-m="custom">Constructor de reglas (indicadores propios)</button></div>
    <div id="mPreset"><div class="form" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))"><label class="f">Estrategia<select id="bPre">${Object.entries(pr.presets).map(([k, v]) => `<option value="${k}" ${k === st.btPreset ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label></div>
      <div class="desc" id="pDesc"></div><div class="form" id="pParams"></div></div>
    <div id="mCustom" hidden>
      <div class="grid g2"><div><div class="toolbar"><b class="up">Entrada en largo</b><select id="eLog"><option value="and">Todas (Y)</option><option value="or">Cualquiera (O)</option></select><span class="sp"></span><button class="btn" data-add="#rEntry">＋ Regla</button></div><div id="rEntry"></div>
        <div class="toolbar"><b class="down">Salida de largo</b><select id="xLog"><option value="or">Cualquiera (O)</option><option value="and">Todas (Y)</option></select><span class="sp"></span><button class="btn" data-add="#rExit">＋ Regla</button></div><div id="rExit"></div></div>
      <div><div class="toolbar"><b class="down">Entrada en corto</b><span class="muted">(si dirección incluye cortos)</span><span class="sp"></span><button class="btn" data-add="#rSEntry">＋ Regla</button></div><div id="rSEntry"></div>
        <div class="toolbar"><b class="up">Salida de corto</b><span class="sp"></span><button class="btn" data-add="#rSExit">＋ Regla</button></div><div id="rSExit"></div></div></div>
      <div class="note">Ejemplo: «Indicador RSI(14) cruza al alza Valor 30» Y «Precio cierre mayor que Indicador SMA(200)». Puedes comparar indicadores entre sí (p. ej. EMA 9 cruza al alza EMA 21; MACD cruza su señal).</div></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" id="bRun" style="padding:9px 22px;font-size:14px">▶ Ejecutar backtest</button><button class="btn" onclick="App.go('optimizador')">⚙ Optimizar parámetros</button></div></div>
  <div class="card" style="margin-top:12px"><h3>3 · Comparar en más activos <span class="badge">misma estrategia y parámetros · hasta 40</span></h3>
    <div class="toolbar"><input id="mAdd" placeholder="Añadir activo: nombre o símbolo (acciones, ETFs, índices, divisas, materias primas, cripto…)" style="flex:1;min-width:260px"><span class="muted">Cestas:</span><span id="mBaskets"></span><button class="btn" id="mClear">Vaciar</button></div>
    <div class="chips" id="mChips"></div>
    <div class="toolbar" style="margin-top:10px"><button class="btn primary" id="mRun">▶ Ejecutar en todos</button><span class="muted" id="mInfo">Se usan el rango, la temporalidad, el capital, la gestión del riesgo y la estrategia de arriba.</span></div>
    <div id="mRes"></div></div>
  <div id="bRes" style="margin-top:12px"></div>`;
  symPicker($('#bSym'), sym => { $('#bSym').value = sym; });
  let mode = 'preset';
  $$('#mtabs button').forEach(b => b.onclick = () => { mode = b.dataset.m; $$('#mtabs button').forEach(x => x.classList.toggle('on', x === b)); $('#mPreset').hidden = mode !== 'preset'; $('#mCustom').hidden = mode !== 'custom'; });
  const showParams = () => {
    const p = pr.presets[$('#bPre').value]; st.btPreset = $('#bPre').value;
    const saved = (st.btParams || {})[st.btPreset] || {};
    $('#pDesc').textContent = p.desc;
    $('#pParams').innerHTML = Object.entries(p.params).map(([k, v]) => k === 'kind' ? `<label class="f">${PARAM_ES[k]}<select data-p="kind"><option value="ema" ${(saved.kind || v) === 'ema' ? 'selected' : ''}>EMA</option><option value="sma" ${(saved.kind || v) === 'sma' ? 'selected' : ''}>SMA</option><option value="wma">WMA</option><option value="hma">HMA</option></select></label>` : `<label class="f">${PARAM_ES[k] || k}<input type="number" step="any" data-p="${k}" value="${saved[k] ?? v}"></label>`).join('');
  };
  $('#bPre').onchange = showParams; showParams();
  addRule($('#rEntry'), reg, { left: { kind: 'ind', key: 'ema', out: 'v', params: { period: 9 } }, op: 'crosses_above', right: { kind: 'ind', key: 'ema', out: 'v', params: { period: 21 } } });
  addRule($('#rEntry'), reg, { left: { kind: 'price', field: 'c' }, op: 'gt', right: { kind: 'ind', key: 'sma', out: 'v', params: { period: 200 } } });
  addRule($('#rExit'), reg, { left: { kind: 'ind', key: 'ema', out: 'v', params: { period: 9 } }, op: 'crosses_below', right: { kind: 'ind', key: 'ema', out: 'v', params: { period: 21 } } });
  $$('[data-add]').forEach(b => b.onclick = () => addRule($(b.dataset.add), reg));

  const buildBody = () => {
    const body = btReadCommon();
    if (mode === 'preset') {
      body.preset = $('#bPre').value; body.params = {};
      $$('#pParams [data-p]').forEach(i => body.params[i.dataset.p] = i.tagName === 'SELECT' ? i.value : +i.value);
      st.btParams = Object.assign(st.btParams || {}, { [body.preset]: body.params }); App.saveState();
    } else {
      Object.assign(body, { mode: 'custom', entry: readRules($('#rEntry')), exit: readRules($('#rExit')), short_entry: readRules($('#rSEntry')), short_exit: readRules($('#rSExit')), entry_logic: $('#eLog').value, exit_logic: $('#xLog').value });
    }
    return body;
  };
  $('#bRun').onclick = async () => {
    const body = buildBody();
    $('#bRes').innerHTML = loading('Ejecutando simulación…');
    try { renderBT(await api('/api/backtest', body), body); } catch (e) { $('#bRes').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  /* --- multi-activo --- */
  st.btMulti = st.btMulti || ['BTCUSDT', 'ETHUSDT', '^GSPC', 'SAN.MC', 'GC=F'];
  const chips = () => { $('#mChips').innerHTML = st.btMulti.length ? st.btMulti.map((x, i) => `<span class="chip">${esc(x)}<i data-i="${i}" title="Quitar">✕</i></span>`).join('') : '<span class="muted">Añade activos con el buscador o carga una cesta.</span>'; App.saveState(); };
  $('#mChips').onclick = e => { const i = e.target.dataset.i; if (i != null) { st.btMulti.splice(+i, 1); chips(); } };
  const addSym = sym => { if (!st.btMulti.includes(sym) && st.btMulti.length < 40) st.btMulti.push(sym); $('#mAdd').value = ''; chips(); };
  symPicker($('#mAdd'), addSym);
  $('#mClear').onclick = () => { st.btMulti = []; chips(); };
  chips();
  api('/api/baskets').then(b => { $('#mBaskets').innerHTML = Object.keys(b.baskets).map(k => `<button class="btn" data-b="${esc(k)}">${esc(k)}</button>`).join(' ');
    $$('#mBaskets [data-b]').forEach(x => x.onclick = () => { b.baskets[x.dataset.b].forEach(addSym); }); });
  $('#mRun').onclick = async () => {
    if (!st.btMulti.length) return;
    const body = buildBody(); body.symbols = st.btMulti.slice();
    $('#mRes').innerHTML = loading(`Ejecutando la estrategia en ${body.symbols.length} activos…`);
    try { renderMulti(await api('/api/backtest_multi', body), body); } catch (e) { $('#mRes').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  App._btRunSym = sym => { $('#bSym').value = sym; $('#bRun').click(); $('#bRes').scrollIntoView({ behavior: 'smooth' }); };
  if (App._applyOpt) { const a = App._applyOpt; App._applyOpt = null; $('#bPre').value = a.preset; showParams(); Object.entries(a.params).forEach(([k, v]) => { const i = $(`#pParams [data-p="${k}"]`); if (i) i.value = v; }); if (a.sl_pct != null) $('#bSL').value = a.sl_pct; if (a.tp_pct != null) $('#bTP').value = a.tp_pct; $('#bRun').click(); }
};

function renderBT(r, body) {
  const m = r.metrics;
  const k = (l, v, c = '') => `<div class="kpi"><div class="k">${l}</div><div class="v ${c}">${v}</div></div>`;
  const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  $('#bRes').innerHTML = `
  <div class="grid g3"><div class="card span2"><h3>Conclusiones <span class="badge">${esc(r.meta.name)} · ${body.tf} · ${r.meta.source}</span></h3><div class="concl">${r.conclusions.map(([t, s]) => `<div class="${t}">${esc(s)}</div>`).join('')}</div></div>
    <div class="card"><h3>Resultado</h3><div class="big ${cls(m.profit)}">${fmtEur(m.final)}</div><div class="${cls(m.profit)} mono" style="font-size:15px">${m.profit >= 0 ? '+' : ''}${fmtEur(m.profit)} (${fmtR(m.total_ret)})</div>
      <div class="kpis" style="margin-top:12px;grid-template-columns:1fr 1fr">${k('Comprar y mantener', fmtEur(m.bh_final), cls(m.bh_ret))}${k('Diferencia', fmtR(m.total_ret - m.bh_ret), cls(m.total_ret - m.bh_ret))}${k('CAGR estrategia', fmtR(m.cagr), cls(m.cagr))}${k('CAGR activo', fmtR(m.bh_cagr), cls(m.bh_cagr))}</div></div></div>
  <div class="card" style="margin-top:12px"><h3>Métricas</h3><div class="kpis">
    ${k('Operaciones', m.trades)}${k('% acierto', fmtN(m.win_rate * 100, 1) + ' %', m.win_rate >= .5 ? 'up' : '')}${k('Factor beneficio', fmtN(m.profit_factor), m.profit_factor > 1 ? 'up' : 'down')}${k('Sharpe', fmtN(m.sharpe), m.sharpe > 1 ? 'up' : '')}${k('Sortino', fmtN(m.sortino))}${k('Calmar', fmtN(m.calmar))}
    ${k('Máx. drawdown', fmtR(m.max_dd), 'down')}${k('DD activo', fmtR(m.bh_max_dd), 'down')}${k('Duración máx. DD', m.max_dd_bars + ' velas')}${k('Volatilidad anual', fmtN(m.vol * 100, 2) + ' %')}${k('Exposición', fmtN(m.exposure * 100, 1) + ' %')}${k('Velas medias/op.', fmtN(m.avg_bars, 1))}
    ${k('Ganancia media', fmtEur(m.avg_win), 'up')}${k('Pérdida media', fmtEur(m.avg_loss), 'down')}${k('Ratio G/P', fmtN(m.payoff))}${k('Esperanza/op.', fmtEur(m.expectancy), cls(m.expectancy))}${k('Mejor op.', fmtR(m.best), 'up')}${k('Peor op.', fmtR(m.worst), 'down')}
    ${k('Pérdidas seguidas', m.max_consec_losses)}${k('SQN', fmtN(m.sqn))}${k('Kelly', m.kelly == null ? '—' : fmtN(m.kelly * 100, 1) + ' %')}${k('Comisiones', fmtEur(m.fees))}${k('Años', fmtN(m.years, 1))}</div></div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>Curva de capital vs comprar y mantener</h3><div id="eqch" style="height:340px"></div></div>
    <div class="card"><h3>Precio con operaciones</h3><div id="trch" style="height:340px"></div></div></div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>Rentabilidad mensual de la estrategia (%)</h3><div class="scroll"><table class="hm"><tr><th>Año</th>${M.map(x => `<th style="text-align:center">${x}</th>`).join('')}<th style="text-align:center">Total</th></tr>
    ${Object.entries(r.monthly).reverse().map(([y, d]) => `<tr><th>${y}</th>${d.months.map(v => v == null ? '<td></td>' : `<td style="background:${heatColor(v * 100, 6)}">${fmtN(v * 100, 1)}</td>`).join('')}<td style="background:${heatColor(d.year * 100, 25)};font-weight:700">${fmtN(d.year * 100, 1)}</td></tr>`).join('')}</table></div></div>
    <div class="card"><h3>Distribución de resultados por operación (%)</h3><div id="pnlh"></div></div></div>
  <div class="card" style="margin-top:12px"><h3>Registro de operaciones <span class="badge">${r.trades.length}</span></h3><div class="scroll"><table><tr><th>#</th><th>Lado</th><th>Entrada</th><th class="num">Precio</th><th>Salida</th><th class="num">Precio</th><th>Motivo salida</th><th class="num">Cantidad</th><th class="num">Velas</th><th class="num">Resultado</th><th class="num">%</th></tr>
    ${r.trades.map((t, i) => `<tr><td class="muted">${i + 1}</td><td><span class="badge ${t.side === 'Largo' ? 'up' : 'down'}">${t.side}</span></td><td>${fmtDate(t.entry_t, isIntraday(body.tf))}</td><td class="num">${fmtP(t.entry_px)}</td><td>${fmtDate(t.exit_t, isIntraday(body.tf))}</td><td class="num">${fmtP(t.exit_px)}</td><td>${esc(t.exit_reason)}</td><td class="num">${fmtN(t.qty, 4)}</td><td class="num">${t.bars}</td><td class="num ${cls(t.pnl)}">${fmtEur(t.pnl)}</td><td class="num ${cls(t.ret)}">${fmtR(t.ret)}</td></tr>`).join('')}</table></div></div>`;
  const L = LightweightCharts;
  const eq = L.createChart($('#eqch'), chartTheme()); App.onLeave(() => eq.remove());
  const s1 = eq.addSeries(L.AreaSeries, { lineColor: '#f5b700', topColor: '#f5b70044', bottomColor: '#f5b70000', lineWidth: 2, title: 'Estrategia' });
  const uniq = arr => { const s = new Set(); return arr.filter(p => !s.has(p[0]) && s.add(p[0])); };
  s1.setData(uniq(r.equity).map(([t, v]) => ({ time: t, value: v })));
  const s2 = eq.addSeries(L.LineSeries, { color: '#64748b', lineWidth: 1, lineStyle: 2, title: 'Comprar y mantener' });
  s2.setData(uniq(r.bh_equity).map(([t, v]) => ({ time: t, value: v })));
  s1.createPriceLine({ price: m.capital, color: '#475569', lineStyle: 1, lineWidth: 1, title: 'Capital' });
  const s3 = eq.addSeries(L.AreaSeries, { lineColor: '#ea3943', topColor: '#ea394300', bottomColor: '#ea394366', invertFilledArea: true, lineWidth: 1, title: 'DD %', priceFormat: { type: 'percent' } }, 1);
  s3.setData(uniq(r.drawdown).map(([t, v]) => ({ time: t, value: v })));
  eq.panes()[1] && eq.panes()[1].setHeight(90);
  eq.timeScale().fitContent();
  const tr = L.createChart($('#trch'), chartTheme()); App.onLeave(() => tr.remove());
  const c = r.candles, cs = tr.addSeries(L.CandlestickSeries, { upColor: '#16c784', downColor: '#ea3943', borderVisible: false, wickUpColor: '#16c78499', wickDownColor: '#ea394399' });
  cs.setData(c.t.map((t, i) => ({ time: t, open: c.o[i], high: c.h[i], low: c.l[i], close: c.c[i] })));
  const mk = [];
  r.trades.forEach(t => {
    const lg = t.side === 'Largo';
    mk.push({ time: t.entry_t, position: lg ? 'belowBar' : 'aboveBar', color: lg ? '#16c784' : '#ea3943', shape: lg ? 'arrowUp' : 'arrowDown', text: lg ? 'C' : 'V' });
    if (t.exit_t) mk.push({ time: t.exit_t, position: lg ? 'aboveBar' : 'belowBar', color: t.pnl >= 0 ? '#f5b700' : '#a78bfa', shape: 'circle', text: (t.ret >= 0 ? '+' : '') + (t.ret * 100).toFixed(1) + '%' });
  });
  mk.sort((a, b) => a.time - b.time);
  L.createSeriesMarkers(cs, mk);
  tr.timeScale().fitContent();
  if (r.pnl_hist.length) { const e = r.pnl_edges; $('#pnlh').innerHTML = svgChart([{ type: 'bar', data: r.pnl_hist.map((n, i) => [(e[i] + e[i + 1]) / 2, n]), color: (v, x) => x >= 0 ? '#16c784' : '#ea3943' }], { h: 230, y0: 0, xfmt: v => fmtN(v, 1) + '%', yfmt: v => fmtN(v, 0) }); }
  else $('#pnlh').innerHTML = '<div class="muted">Pocas operaciones</div>';
}

function renderMulti(r, body) {
  const S = r.summary, rows = r.rows;
  const cols = [['symbol', 'Activo'], ['name', 'Nombre'], ['total_ret', 'Rent. estrategia'], ['bh_ret', 'Comprar y mantener'], ['edge', 'Diferencia'], ['cagr', 'CAGR'], ['sharpe', 'Sharpe'], ['max_dd', 'Máx. DD'], ['profit_factor', 'F. beneficio'], ['win_rate', '% acierto'], ['trades', 'Ops'], ['bars', 'Velas']];
  rows.forEach(x => { if (!x.error) x.edge = x.total_ret - x.bh_ret; });
  let key = 'sharpe', dir = -1;
  const pct = v => fmtR(v), f2 = v => fmtN(v);
  const fmt = { total_ret: pct, bh_ret: pct, edge: pct, cagr: pct, max_dd: pct, win_rate: v => fmtN(v * 100, 1) + ' %', sharpe: f2, profit_factor: f2 };
  const ok = rows.filter(x => !x.error), bad = rows.filter(x => x.error);
  const fr = S.n ? S.profitable / S.n : 0;
  const head = S.n ? `<div class="kpis" style="margin:10px 0">
      <div class="kpi"><div class="k">Activos válidos</div><div class="v">${S.n}${S.errors ? ` <span class="muted" style="font-size:12px">(${S.errors} sin datos)</span>` : ''}</div></div>
      <div class="kpi"><div class="k">Rentable en</div><div class="v ${fr >= .7 ? 'up' : fr >= .5 ? '' : 'down'}">${S.profitable} / ${S.n} (${fmtN(100 * fr, 0)} %)</div></div>
      <div class="kpi"><div class="k">Bate a comprar y mantener</div><div class="v ${S.beat_bh / S.n >= .5 ? 'up' : 'down'}">${S.beat_bh} / ${S.n}</div></div>
      <div class="kpi"><div class="k">Sharpe mediano</div><div class="v ${S.med_sharpe > 1 ? 'up' : ''}">${fmtN(S.med_sharpe)}</div></div>
      <div class="kpi"><div class="k">Rent. mediana</div><div class="v ${cls(S.med_ret)}">${fmtR(S.med_ret)}</div></div>
      <div class="kpi"><div class="k">DD mediano</div><div class="v down">${fmtR(S.med_dd)}</div></div></div>
    <div class="concl"><div class="${fr >= .7 ? 'ok' : fr >= .5 ? 'warn' : 'bad'}">${fr >= .7 ? 'Robusta: es rentable en al menos el 70 % de los activos con los mismos parámetros.' : fr >= .5 ? 'Mixta: funciona en algo más de la mitad de los activos. Revisa en qué clase de activo falla.' : 'Poco robusta: falla en la mayoría de los activos. Probablemente los buenos resultados en uno solo sean casualidad.'} Bate a comprar y mantener en ${S.beat_bh} de ${S.n}.</div></div>` : '';
  const val = x => x ?? -1e18;
  const paint = () => {
    ok.sort((a, b) => key === 'symbol' || key === 'name' ? dir * String(b[key]).localeCompare(String(a[key])) : dir * (val(a[key]) - val(b[key])));
    $('#mTab').innerHTML = `<tr>${cols.map(([k, n]) => `<th data-k="${k}" class="${k === 'symbol' || k === 'name' ? '' : 'num'}">${n}${k === key ? (dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr>` +
      ok.map(x => `<tr class="click" data-s="${esc(x.symbol)}">${cols.map(([k]) => k === 'symbol' ? `<td><b class="mono">${esc(x.symbol)}</b> <span class="badge ${x.source === 'binance' ? 'up' : ''}">${esc(x.source)}</span></td>` : k === 'name' ? `<td class="muted">${esc(x.name)}</td>` : `<td class="num ${['total_ret', 'edge', 'cagr', 'bh_ret'].includes(k) ? cls(x[k]) : k === 'max_dd' ? 'down' : ''}">${(fmt[k] || (v => v ?? '—'))(x[k])}</td>`).join('')}</tr>`).join('') +
      bad.map(x => `<tr><td><b class="mono">${esc(x.symbol)}</b></td><td colspan="${cols.length - 1}" class="down">${esc(x.error)}</td></tr>`).join('');
    $$('#mTab th').forEach(th => th.onclick = () => { const k = th.dataset.k; dir = key === k ? -dir : -1; key = k; paint(); });
    $$('#mTab tr.click').forEach(tr => tr.onclick = () => App._btRunSym(tr.dataset.s));
  };
  $('#mRes').innerHTML = head + `<div class="scroll"><table class="sortable" id="mTab"></table></div><div class="note">Haz clic en una columna para ordenar y en una fila para ver su backtest completo.</div>`;
  paint();
}

/* ================= OPTIMIZADOR ================= */
App.views.optimizador = async (main) => {
  const st = App.state;
  const pr = App.presets || (App.presets = await api('/api/presets'));
  main.innerHTML = `<div class="view-title"><h1>Optimizador de estrategias</h1><span class="sub">Búsqueda exhaustiva de los mejores parámetros con validación fuera de muestra (anti-sobreajuste)</span></div>
  <div class="card"><h3>1 · Mercado, capital y gestión</h3>${btCommonForm(st)}</div>
  <div class="card" style="margin-top:12px"><h3>2 · Rejilla de parámetros</h3>
    <div class="form" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      <label class="f">Estrategia<select id="oPre">${Object.entries(pr.presets).filter(([k]) => k !== 'buy_hold').map(([k, v]) => `<option value="${k}" ${k === st.btPreset ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <label class="f">Optimizar por<select id="oObj"><option value="sharpe">Ratio de Sharpe</option><option value="return">Rentabilidad total</option><option value="profit_factor">Factor de beneficio</option><option value="calmar">Ratio Calmar (rent./DD)</option><option value="sortino">Ratio Sortino</option><option value="drawdown">Menor drawdown</option><option value="expectancy">Esperanza por operación</option></select></label>
      <label class="f">% datos para optimizar (resto = validación)<input type="number" id="oSplit" value="70" min="40" max="95"></label>
      <label class="f">Mín. operaciones<input type="number" id="oMin" value="5" min="0"></label>
      <label class="f">Valores de stop-loss % a probar<input id="oSL" value="0, 3, 5, 8"></label>
      <label class="f">Valores de take-profit % a probar<input id="oTP" value="0, 10, 20"></label></div>
    <div class="desc" style="margin-top:10px">Valores a probar para cada parámetro (separados por comas, o rango <span class="mono">inicio:fin:paso</span>):</div>
    <div class="form" id="oGrid"></div>
    <div class="toolbar" style="margin-top:12px"><button class="btn primary" id="oRun" style="padding:9px 22px;font-size:14px">⚙ Optimizar</button><span class="muted" id="oCount"></span></div></div>
  <div id="oRes" style="margin-top:12px"></div>`;
  symPicker($('#bSym'), sym => { $('#bSym').value = sym; });
  const parse = s => s.split(',').flatMap(x => { x = x.trim(); if (!x) return []; if (x.includes(':')) { const [a, b, c = 1] = x.split(':').map(Number); const out = []; for (let v = a; v <= b + 1e-9 && out.length < 200; v += c) out.push(+v.toFixed(6)); return out; } return [isNaN(+x) ? x : +x]; });
  const show = () => {
    const p = pr.presets[$('#oPre').value];
    $('#oGrid').innerHTML = Object.entries(p.params).map(([k, v]) => `<label class="f">${PARAM_ES[k] || k}<input data-p="${k}" value="${k === 'kind' ? v : (p.opt[k] || [v]).join(', ')}"></label>`).join('');
    count(); $$('#oGrid input, #oSL, #oTP').forEach(i => i.oninput = count);
  };
  const count = () => { let n = parse($('#oSL').value).length * parse($('#oTP').value).length; $$('#oGrid input').forEach(i => n *= parse(i.value).length || 1); $('#oCount').textContent = `${n} combinaciones a evaluar`; };
  $('#oPre').onchange = show; show();
  $('#oRun').onclick = async () => {
    const body = btReadCommon();
    body.preset = $('#oPre').value; body.params = {}; body.grid = {};
    $$('#oGrid input').forEach(i => { const v = parse(i.value); if (v.length > 1) body.grid[i.dataset.p] = v; body.params[i.dataset.p] = v[0]; });
    Object.assign(body, { objective: $('#oObj').value, split: +$('#oSplit').value / 100, sl_grid: parse($('#oSL').value), tp_grid: parse($('#oTP').value), min_trades: +$('#oMin').value });
    $('#oRes').innerHTML = loading('Probando combinaciones…');
    try { renderOpt(await api('/api/optimize', body), body); } catch (e) { $('#oRes').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
};

function renderOpt(r, body) {
  const keys = r.rows.length ? Object.keys(r.rows[0].params) : [];
  const h = r.heatmap;
  $('#oRes').innerHTML = `<div class="grid g2"><div class="card"><h3>Conclusiones <span class="badge">${r.tested} combinaciones en ${fmtN(r.seconds, 1)} s</span></h3><div class="concl">${r.conclusions.map(([t, s]) => `<div class="${t}">${esc(s)}</div>`).join('')}</div>
    <div class="note">División entrenamiento/validación: ${r.split_time ? fmtDate(r.split_time) : '—'}. Una estrategia es fiable si sigue funcionando en datos que el optimizador no ha visto.</div></div>
    <div class="card"><h3>Mapa de calor ${h ? `<span class="badge">${PARAM_ES[h.x] || h.x} × ${PARAM_ES[h.y] || h.y} · ${h.metric}</span>` : ''}</h3>${h ? heatTable(h) : '<div class="muted">Necesita al menos 2 parámetros con varios valores.</div>'}</div></div>
  <div class="card" style="margin-top:12px"><h3>Top ${r.rows.length} combinaciones</h3><div class="scroll"><table><tr><th>#</th>${keys.map(k => `<th class="num">${PARAM_ES[k] || k.replace('_pct', ' %').toUpperCase()}</th>`).join('')}<th class="num">Rent. (entren.)</th><th class="num">Sharpe</th><th class="num">DD</th><th class="num">Ops</th><th class="num">% acierto</th><th class="num">Rent. VALIDACIÓN</th><th class="num">Sharpe val.</th><th class="num">B&amp;H val.</th><th class="num">Rent. total</th><th></th></tr>
  ${r.rows.map((x, i) => `<tr><td class="muted">${i + 1}</td>${keys.map(k => `<td class="num">${x.params[k]}</td>`).join('')}<td class="num ${cls(x.is.total_ret)}">${fmtR(x.is.total_ret)}</td><td class="num">${fmtN(x.is.sharpe)}</td><td class="num down">${fmtR(x.is.max_dd)}</td><td class="num">${x.is.trades}</td><td class="num">${fmtN(x.is.win_rate * 100, 1)}%</td>
    <td class="num"><span class="badge ${x.oos.total_ret >= 0 ? 'up' : 'down'}">${fmtR(x.oos.total_ret)}</span></td><td class="num">${fmtN(x.oos.sharpe)}</td><td class="num muted">${fmtR(x.oos.bh_ret)}</td><td class="num ${cls(x.full.total_ret)}">${fmtR(x.full.total_ret)}</td><td><button class="btn" data-i="${i}">Backtest ➜</button></td></tr>`).join('')}</table></div></div>`;
  $$('#oRes button[data-i]').forEach(b => b.onclick = () => { const x = r.rows[+b.dataset.i]; App._applyOpt = { preset: body.preset, params: Object.assign({}, body.params, x.params), sl_pct: x.params.sl_pct, tp_pct: x.params.tp_pct }; App.go('backtest'); });
}
function heatTable(h) {
  const vals = h.z.flat().filter(v => v != null), mn = Math.min(...vals), mx = Math.max(...vals);
  const col = v => v == null ? 'transparent' : heatColor(((v - mn) / ((mx - mn) || 1) - 0.5) * 6);
  const f = v => v == null ? '' : h.metric.includes('ret') || h.metric === 'max_dd' ? fmtN(v * 100, 1) : fmtN(v, 2);
  return `<div class="scroll"><table class="hm"><tr><th>${PARAM_ES[h.y] || h.y} ↓ / ${PARAM_ES[h.x] || h.x} →</th>${h.xs.map(x => `<th style="text-align:center">${x}</th>`).join('')}</tr>${h.ys.map((y, j) => `<tr><th>${y}</th>${h.z[j].map(v => `<td style="background:${col(v)}">${f(v)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
