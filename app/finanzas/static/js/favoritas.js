/* Mis favoritas: veredicto por horizonte + rentabilidad estimada + justificación */
'use strict';

const FAV_DEFAULT = ['NVDA', 'AMZN', 'AAPL', 'SHOP', 'EL', 'WYNN', 'CELH', 'NFLX'];
const FAV_H = [[1, '1 mes'], [3, '3 meses'], [6, '6 meses'], [12, '12 meses'], [24, '24 meses']];
const VCOL = { strong_buy: '#16c784', buy: '#84cc16', hold: '#eab308', sell: '#f97316', strong_sell: '#ea3943' };

function vpill(v) { return `<span class="vpill" style="--c:${VCOL[v.key]}">${esc(v.verdict)}</span>`; }
function sbar(s, w = 90) {   // barra divergente -1..1
  if (s == null) return '<span class="muted">—</span>';
  const p = Math.max(-1, Math.min(1, s)), c = p >= 0 ? '#16c784' : '#ea3943';
  return `<span class="sbar" style="width:${w}px" title="${fmtN(p, 2)}"><i style="${p >= 0 ? 'left:50%' : `left:${50 + p * 50}%`};width:${Math.abs(p) * 50}%;background:${c}"></i></span><span class="mono sbn ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${fmtN(p, 2)}</span>`;
}
function fval(v, f) { if (v == null) return '—'; if (f === 'pct') return fmtR(v); const d = { n0: 0, n1: 1, n2: 2, n3: 3 }[f]; return fmtN(v, d ?? 2); }
function factorTable(rows) {
  if (!rows.length) return '<div class="muted">Sin datos para este activo.</div>';
  return `<div class="scroll"><table><tr><th>Factor</th><th class="num">Valor</th><th>Lectura</th><th>Puntuación</th></tr>${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${fval(r.value, r.fmt)}</td><td class="muted">${esc(r.reading)}</td><td style="white-space:nowrap">${sbar(r.score, 80)}</td></tr>`).join('')}</table></div>`;
}

App.views.favoritas = async (main) => {
  const st = App.state;
  st.favs = st.favs && st.favs.length ? st.favs : FAV_DEFAULT.slice();
  st.favH = st.favH || 6;
  main.innerHTML = `<div class="view-title"><h1>Mis favoritas</h1><span class="sub">¿Compro o vendo según mi plazo? Veredicto, rentabilidad estimada y todos los datos que lo justifican</span></div>
  <div class="card"><div class="toolbar">
      <b class="muted">Mi plazo:</b><div class="seg" id="fH">${FAV_H.map(([m, n]) => `<button data-m="${m}" class="${m === st.favH ? 'on' : ''}">${n}</button>`).join('')}</div>
      <span class="sp"></span><input id="fAdd" placeholder="Añadir empresa: nombre o símbolo…" style="width:280px"><button class="btn" id="fReset">Restaurar lista inicial</button></div>
    <div class="chips" id="fChips"></div></div>
  <div class="card" style="margin-top:12px"><h3>Ranking de mis empresas <span class="badge" id="fHl"></span></h3><div id="fTab">${loading('Analizando tus empresas (técnico, fundamental y macro)…')}</div></div>
  <div class="card" style="margin-top:12px"><h3>Contexto macroeconómico <span class="badge" id="fMs"></span></h3><div id="fMac">${loading()}</div></div>
  <div id="fDet" style="margin-top:12px"></div>`;

  let data = null, cur = st.favSel && st.favs.includes(st.favSel) ? st.favSel : null;
  const chips = () => { $('#fChips').innerHTML = st.favs.map((x, i) => `<span class="chip">${esc(x)}<i data-i="${i}" title="Quitar">✕</i></span>`).join(''); App.saveState(); };
  $('#fChips').onclick = e => { const i = e.target.dataset.i; if (i != null) { st.favs.splice(+i, 1); chips(); load(); } };
  symPicker($('#fAdd'), s => { $('#fAdd').value = ''; if (!st.favs.includes(s)) { st.favs.push(s); chips(); load(); } });
  $('#fReset').onclick = () => { st.favs = FAV_DEFAULT.slice(); chips(); load(); };
  $$('#fH button').forEach(b => b.onclick = () => { st.favH = +b.dataset.m; App.saveState(); $$('#fH button').forEach(x => x.classList.toggle('on', x === b)); paint(); if (cur) detail(cur, true); });
  chips();

  const hi = () => FAV_H.findIndex(([m]) => m === st.favH);
  function paint() {
    if (!data) return;
    const k = hi();
    $('#fHl').textContent = 'plazo ' + FAV_H[k][1];
    const ok = data.rows.filter(r => !r.error).sort((a, b) => b.views[k].score - a.views[k].score), bad = data.rows.filter(r => r.error);
    $('#fTab').innerHTML = `<div class="scroll"><table class="favtab"><tr><th>#</th><th>Empresa</th><th class="num">Precio</th><th>Veredicto</th><th>Puntuación</th><th class="num">Rent. estimada</th><th class="num">Rango probable<br><span class="muted">(80 % de casos)</span></th><th class="num">Prob. de subir</th><th>Técnico</th><th>Fundam.</th><th class="num">Analistas</th><th>6 meses</th></tr>
      ${ok.map((r, i) => { const v = r.views[k]; return `<tr class="click ${r.symbol === cur ? 'sel' : ''}" data-s="${esc(r.symbol)}"><td class="muted">${i + 1}</td>
        <td><b class="mono">${esc(r.symbol)}</b><div class="muted" style="font-size:11px">${esc(r.name)}${r.sector ? ' · ' + esc(r.sector) : ''}</div></td>
        <td class="num">${fmtP(r.price)}<div class="${cls(r.pct)}" style="font-size:11px">${fmtR(r.pct)}</div></td>
        <td>${vpill(v)}</td><td style="white-space:nowrap">${sbar(v.score, 70)}</td>
        <td class="num ${cls(v.exp)}" style="font-weight:700">${fmtR(v.exp, 1)}</td><td class="num muted">${fmtR(v.p10, 0)} … ${fmtR(v.p90, 0)}</td>
        <td class="num">${fmtN(v.p_up * 100, 0)} %</td><td style="white-space:nowrap">${sbar(r.tech_score, 46)}</td><td style="white-space:nowrap">${r.fund_score == null ? '<span class="muted">n/d</span>' : sbar(r.fund_score, 46)}</td>
        <td class="num ${cls(r.upside)}">${r.upside == null ? '—' : fmtR(r.upside, 0)}</td><td>${sparkline(r.spark, 80, 26)}</td></tr>`; }).join('')}
      ${bad.map(r => `<tr><td></td><td><b class="mono">${esc(r.symbol)}</b></td><td colspan="10" class="down">${esc(r.error)}</td></tr>`).join('')}</table></div>
      <div class="note">Haz clic en una empresa para ver el análisis completo. «Rango probable»: entre el percentil 10 y el 90 de la estimación. «Analistas»: potencial hasta su precio objetivo medio a 12 meses.</div>`;
    $$('#fTab tr.click').forEach(tr => tr.onclick = () => detail(tr.dataset.s));
    const m = data.macro;
    $('#fMs').innerHTML = `${m.score >= 0.1 ? 'favorable' : m.score <= -0.1 ? 'desfavorable' : 'neutral'} · ${m.score >= 0 ? '+' : ''}${fmtN(m.score, 2)}`;
    $('#fMac').innerHTML = `<div class="favmac">${m.rows.map(r => `<div><div class="mn">${esc(r.name)}</div><div class="mv mono">${fval(r.value, r.fmt)}</div><div class="mr muted">${esc(r.reading)}</div><div>${sbar(r.score, 70)}</div></div>`).join('')}</div>
      <div class="note">El contexto pesa entre un 20 % y un 25 % en todos los plazos: con viento macro en contra, hasta las buenas empresas suelen caer.</div>`;
  }

  async function load() {
    try { data = await api('/api/favoritas?symbols=' + encodeURIComponent(st.favs.join(','))); paint(); if (!cur && data.rows.find(r => !r.error)) { const k = hi(); cur = data.rows.filter(r => !r.error).sort((a, b) => b.views[k].score - a.views[k].score)[0].symbol; } if (cur) detail(cur, true); }
    catch (e) { $('#fTab').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  const cache = {};
  async function detail(sym, keepScroll) {
    cur = sym; st.favSel = sym; App.saveState();
    $$('#fTab tr.click').forEach(tr => tr.classList.toggle('sel', tr.dataset.s === sym));
    if (!cache[sym]) { $('#fDet').innerHTML = `<div class="card">${loading('Analizando ' + esc(sym) + '…')}</div>`; try { cache[sym] = await api('/api/favorita?symbol=' + encodeURIComponent(sym)); } catch (e) { $('#fDet').innerHTML = `<div class="err">${esc(e.message)}</div>`; return; } }
    if (cur !== sym) return;
    renderFav(cache[sym], hi());
    if (!keepScroll) $('#fDet').scrollIntoView({ behavior: 'smooth' });
  }
  App._favH = m => { st.favH = m; App.saveState(); $$('#fH button').forEach(x => x.classList.toggle('on', +x.dataset.m === m)); paint(); detail(cur, true); };
  load();
};

function renderFav(r, k) {
  const v = r.views[k], f = r.profile || {}, t = r.technical, H = FAV_H[k][1], px = r.price;
  const cur = r.currency ? ' ' + r.currency : '';
  const tgt = px * (1 + v.exp), stop = Math.max(r.plan.stop_atr, 0), rr = (tgt - px) / Math.max(1e-9, px - stop);
  const sentence = v.key === 'strong_buy' || v.key === 'buy'
    ? `A ${H}, el modelo ve <b>más motivos para comprar que para vender</b>: rentabilidad estimada del <b class="up">${fmtR(v.exp, 1)}</b>, con un ${fmtN(v.p_up * 100, 0)} % de probabilidad de acabar por encima del precio actual.`
    : v.key === 'hold'
      ? `A ${H}, las señales están <b>equilibradas</b>: rentabilidad estimada del <b>${fmtR(v.exp, 1)}</b> y un ${fmtN(v.p_up * 100, 0)} % de probabilidad de subir. Si ya la tienes, mantén; si no, espera una señal más clara.`
      : `A ${H}, el modelo ve <b>más riesgo que oportunidad</b>: rentabilidad estimada del <b class="${cls(v.exp)}">${fmtR(v.exp, 1)}</b> y solo un ${fmtN(v.p_up * 100, 0)} % de probabilidad de subir. Plantéate reducir o no entrar todavía.`;
  const day = 86400, last = r.closes[r.closes.length - 1][0], days = FAV_H[k][0] * 30.4;
  const mu = Math.log1p(v.exp), sg = Math.max(1e-6, (Math.log1p(v.p90) - mu) / 1.2816);
  const cone = z => { const pts = []; for (let i = 0; i <= 16; i++) { const fr = i / 16; pts.push([(last + fr * days * day) / day, px * Math.exp(mu * fr + z * sg * Math.sqrt(fr))]); } return pts; };
  const hist = r.closes.map(([tt, c]) => [tt / day, c]);
  const s50 = r.closes.map(([tt], i) => [tt / day, r.sma50[i]]), s200 = r.closes.map(([tt], i) => [tt / day, r.sma200[i]]);
  const chart = svgChart([
    { data: hist, color: '#e6edf6', width: 1.6, name: 'Precio' }, { data: s50, color: '#38bdf8', width: 1.2, name: 'Media 50' }, { data: s200, color: '#f5b700', width: 1.2, name: 'Media 200' },
    { data: cone(1.2816), color: '#16c784', width: 1.4, dash: 1, name: 'Escenario optimista (P90)' }, { data: cone(0), color: '#a78bfa', width: 2, dash: 1, name: 'Estimación' }, { data: cone(-1.2816), color: '#ea3943', width: 1.4, dash: 1, name: 'Escenario pesimista (P10)' }],
    { h: 300, w: 900, xticks: 5, yfmt: x => fmtN(x, x < 10 ? 2 : 0), xfmt: x => new Date(x * day * 1000).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) });
  const MN = { hist: ['Histórico ajustado', 'Tendencia de largo plazo del valor, mezclada al 50 % con la del mercado (8 % anual) para no extrapolar rachas.'],
    regime: ['Situaciones parecidas', `Mediana de lo que pasó a ${H} en las ${v.regime_n || 0} sesiones históricas con la misma tendencia y un RSI parecido al actual.`],
    analysts: ['Analistas (ajustado)', 'Potencial hasta el precio objetivo medio, reducido al 60 % porque los objetivos suelen ser optimistas.'],
    value: ['Valoración', 'Rendimiento por beneficios (1/PER futuro) más el 60 % del crecimiento esperado, con penalización si el PER supera 30.'] };
  const recs = f.recs; const rtot = recs ? Object.values(recs).reduce((a, b) => a + b, 0) : 0;
  $('#fDet').innerHTML = `
  <div class="card favhead"><div class="favtitle"><div><h2>${esc(r.name)} <span class="mono muted">${esc(r.symbol)}</span></h2>
      <div class="muted">${[r.sector, f.industry, f.country].filter(Boolean).map(esc).join(' · ')}${f.next_earnings ? ` · Próximos resultados: <b>${fmtDate(f.next_earnings)}</b>` : ''}</div></div>
      <div class="favpx"><div class="big">${fmtP(px)}<small>${esc(cur)}</small></div><div class="${cls(r.pct)} mono">${fmtR(r.pct)} hoy</div></div></div>
    <div class="favstrip">${r.views.map((x, i) => `<button class="${i === k ? 'on' : ''}" onclick="App._favH(${x.months})" style="--c:${VCOL[x.key]}"><span>${FAV_H[i][1]}</span><b>${esc(x.verdict)}</b><span class="mono ${cls(x.exp)}">${fmtR(x.exp, 1)}</span></button>`).join('')}</div>
    <div class="favmain">
      <div class="favverdict" style="--c:${VCOL[v.key]}"><div class="vlab">Veredicto a ${H}</div><div class="vbig">${esc(v.verdict)}</div>${gauge(v.score, { mode: 'signal' })}<div class="muted" style="margin-top:10px">Confianza del modelo: <b>${fmtN(v.confidence * 100, 0)} %</b></div></div>
      <div><p class="favsent">${sentence}</p>
        <div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
          <div class="kpi"><div class="k">Rentabilidad estimada</div><div class="v ${cls(v.exp)}">${fmtR(v.exp, 1)}</div></div>
          <div class="kpi"><div class="k">Precio estimado</div><div class="v">${fmtP(tgt)}</div></div>
          <div class="kpi"><div class="k">Probabilidad de subir</div><div class="v">${fmtN(v.p_up * 100, 0)} %</div></div>
          <div class="kpi"><div class="k">Rango central (50 %)</div><div class="v" style="font-size:14px">${fmtR(v.p25, 0)} … ${fmtR(v.p75, 0)}</div></div>
          <div class="kpi"><div class="k">Pesimista (P10)</div><div class="v down">${fmtR(v.p10, 0)}</div></div>
          <div class="kpi"><div class="k">Optimista (P90)</div><div class="v up">${fmtR(v.p90, 0)}</div></div></div>
        <div class="grid g2" style="margin-top:12px"><div class="concl"><b class="up">A favor</b>${(v.pro.length ? v.pro : ['Ningún factor claramente positivo']).map(x => `<div class="ok">${esc(x)}</div>`).join('')}</div>
          <div class="concl"><b class="down">En contra</b>${(v.con.length ? v.con : ['Ningún factor claramente negativo']).map(x => `<div class="bad">${esc(x)}</div>`).join('')}</div></div></div></div></div>

  <div class="grid g2" style="margin-top:12px;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)">
    <div class="card"><h3>Precio, medias y proyección a ${H}</h3>${chart}</div>
    <div class="card"><h3>Cómo se ha calculado</h3>
      <div class="desc">Puntuación final = técnico × ${fmtN(v.weights.tech * 100, 0)} % + fundamental × ${fmtN(v.weights.fund * 100, 0)} % + macro × ${fmtN(v.weights.macro * 100, 0)} % (70 %), más la ventaja de la rentabilidad estimada sobre el mercado ajustada al riesgo (30 %).</div>
      <table><tr><td>Técnico</td><td>${sbar(r.tech_score)}</td><td class="num muted">peso ${fmtN(v.weights.tech * 100, 0)} %</td></tr>
        <tr><td>Fundamental</td><td>${r.fund_score == null ? '<span class="muted">sin datos (ETF, índice o cripto)</span>' : sbar(r.fund_score)}</td><td class="num muted">peso ${fmtN(v.weights.fund * 100, 0)} %</td></tr>
        <tr><td>Macro</td><td>${sbar(r.macro_score)}</td><td class="num muted">peso ${fmtN(v.weights.macro * 100, 0)} %</td></tr>
        <tr><td>Ventaja vs mercado</td><td>${sbar(Math.tanh(v.edge * 1.5))}</td><td class="num muted">peso 30 %</td></tr>
        <tr><td><b>Total</b></td><td>${sbar(v.score)}</td><td>${vpill(v)}</td></tr></table>
      <h3 style="margin-top:14px">Modelos de rentabilidad a ${H}</h3>
      <table class="wrap"><tr><th>Modelo</th><th class="num">Estimación</th><th class="num">Peso</th></tr>${Object.entries(v.models).map(([key, m]) => `<tr title="${esc(MN[key][1])}"><td>${MN[key][0]}<div class="muted" style="font-size:11px">${esc(MN[key][1])}</div></td><td class="num ${cls(m.value)}">${m.value == null ? 'n/d' : fmtR(m.value, 1)}</td><td class="num">${fmtN(m.weight * 100, 0)} %</td></tr>`).join('')}
        <tr><td><b>Combinada</b></td><td class="num ${cls(v.exp)}"><b>${fmtR(v.exp, 1)}</b></td><td></td></tr></table></div></div>

  <div class="grid g3" style="margin-top:12px">
    <div class="card"><h3>Plan orientativo</h3><table>
      <tr><td>Precio actual</td><td class="num">${fmtP(px)}</td></tr>
      <tr><td>Objetivo estimado a ${H}</td><td class="num ${cls(v.exp)}">${fmtP(tgt)}</td></tr>
      <tr><td>Stop sugerido (2,5 × ATR)</td><td class="num down">${fmtP(stop)} <span class="muted">(${fmtR(stop / px - 1, 1)})</span></td></tr>
      <tr><td>Soporte (mínimo 3 meses)</td><td class="num">${fmtP(r.plan.support)}</td></tr>
      <tr><td>Resistencia (máximo 52 semanas)</td><td class="num">${fmtP(r.plan.resistance)}</td></tr>
      <tr><td>Riesgo : beneficio</td><td class="num ${rr >= 2 ? 'up' : rr >= 1 ? '' : 'down'}">1 : ${fmtN(rr, 2)}</td></tr></table>
      <div class="note">${rr >= 2 ? 'La relación riesgo/beneficio es buena.' : rr >= 1 ? 'Relación riesgo/beneficio justa: entra con una posición pequeña.' : 'Arriesgas más de lo que esperas ganar: no compensa entrar ahora.'} Dimensiona la posición para arriesgar como mucho un 1–2 % de tu cartera si salta el stop.</div></div>
    <div class="card"><h3>Analistas</h3>${f.target_mean ? `<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="k">Objetivo medio</div><div class="v">${fmtP(f.target_mean)}</div></div><div class="kpi"><div class="k">Potencial</div><div class="v ${cls(f.upside)}">${fmtR(f.upside, 1)}</div></div><div class="kpi"><div class="k">Objetivo bajo / alto</div><div class="v" style="font-size:14px">${fmtP(f.target_low)} / ${fmtP(f.target_high)}</div></div><div class="kpi"><div class="k">Opiniones</div><div class="v">${f.analysts ?? '—'}</div></div></div>` : '<div class="muted">Sin cobertura de analistas.</div>'}
      ${rtot ? `<div class="recbar">${[['strongBuy', 'Compra fuerte', '#16c784'], ['buy', 'Comprar', '#84cc16'], ['hold', 'Mantener', '#eab308'], ['sell', 'Vender', '#f97316'], ['strongSell', 'Venta fuerte', '#ea3943']].map(([kk, n, c]) => recs[kk] ? `<i style="flex:${recs[kk]};background:${c}" title="${n}: ${recs[kk]}">${recs[kk]}</i>` : '').join('')}</div><div class="muted" style="font-size:11px;margin-top:4px">Compra fuerte · Comprar · Mantener · Vender · Venta fuerte (este mes)</div>` : ''}
      ${f.beats_n ? `<div style="margin-top:10px">Resultados: batió estimaciones <b>${f.beats} de ${f.beats_n}</b> trimestres${f.avg_surprise != null ? `, sorpresa media ${fmtR(f.avg_surprise, 1)}` : ''}.</div>` : ''}</div>
    <div class="card"><h3>La empresa en cifras</h3><table>
      <tr><td>Capitalización</td><td class="num">${fmtBig(f.market_cap)}</td></tr><tr><td>Ventas (12 m)</td><td class="num">${fmtBig(f.revenue)}</td></tr>
      <tr><td>EBITDA</td><td class="num">${fmtBig(f.ebitda)}</td></tr><tr><td>Caja / deuda</td><td class="num">${fmtBig(f.cash)} / ${fmtBig(f.debt)}</td></tr>
      <tr><td>Flujo de caja libre</td><td class="num">${fmtBig(f.fcf)}</td></tr><tr><td>PER actual / futuro</td><td class="num">${fmtN(f.pe, 1)} / ${fmtN(f.fpe, 1)}</td></tr>
      <tr><td>Precio / ventas · Precio / valor contable</td><td class="num">${fmtN(f.ps, 1)} · ${fmtN(f.pb, 1)}</td></tr><tr><td>Margen bruto / operativo</td><td class="num">${fmtR(f.gross_margin, 1)} / ${fmtR(f.op_margin, 1)}</td></tr>
      <tr><td>Beta · Dividendo</td><td class="num">${fmtN(f.beta, 2)} · ${f.div_yield ? fmtR(f.div_yield, 2) : '—'}</td></tr><tr><td>Empleados</td><td class="num">${f.employees ? fmtN(f.employees, 0) : '—'}</td></tr></table></div></div>

  <div class="grid g3" style="margin-top:12px">
    <div class="card"><h3>Técnico <span class="badge">${r.technical.rows.length} factores</span></h3>${factorTable(r.technical.rows)}</div>
    <div class="card"><h3>Fundamental <span class="badge">${r.fundamental.rows.length} factores</span></h3>${factorTable(r.fundamental.rows)}</div>
    <div class="card"><h3>Macroeconomía <span class="badge">${r.macro.rows.length} factores</span></h3>${factorTable(r.macro.rows)}
      ${r.sector_etf ? `<div class="note">Sector comparado con el ETF ${esc(r.sector_etf)}.</div>` : ''}</div></div>
  ${f.summary ? `<div class="card" style="margin-top:12px"><h3>A qué se dedica</h3><div class="desc">${esc(f.summary)}${f.summary.length >= 700 ? '…' : ''}</div></div>` : ''}
  <div class="note" style="margin-top:10px">Estimación estadística con datos públicos (Yahoo Finance), no una predicción segura ni asesoramiento financiero. Antes de operar, compruébalo en <a href="#/grafico/${encodeURIComponent(r.symbol)}">Gráficos</a>, <a href="#/analisis/${encodeURIComponent(r.symbol)}">Análisis</a> y el <a href="#/backtest">Backtest</a>.</div>`;
}
