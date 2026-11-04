/* Calculadoras financieras */
'use strict';

const fr = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
const sq = x => `<span class="sqrt">${x}</span>`;
const SUM = (a, b) => `<span class="big-op">Σ</span><sub>${a}</sub><sup>${b}</sup>`;
const R_ = (l, v, c = '') => `<div class="kpi"><div class="k">${l}</div><div class="v ${c}">${v}</div></div>`;
function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
function npdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
function irr(cfs) { let lo = -0.99, hi = 10; const npv = r => cfs.reduce((a, c, i) => a + c / (1 + r) ** i, 0); if (npv(lo) * npv(hi) > 0) return NaN; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (npv(lo) * npv(m) <= 0) ? hi = m : lo = m; } return (lo + hi) / 2; }
const yearsChart = (series, h = 220) => svgChart(series, { h, xfmt: v => 'Año ' + fmtN(v, 0), yfmt: fmtBig, y0: 0 });

const CALCS = [
  { id: 'compuesto', t: 'Interés compuesto con aportaciones', cat: 'Ahorro e inversión',
    f: `<i>VF</i> <span class="op">=</span> <i>C</i><sub>0</sub>(1+<i>r</i>/<i>m</i>)<sup><i>m·n</i></sup> <span class="op">+</span> <i>A</i> · ${fr('(1+<i>r</i>/<i>m</i>)<sup><i>m·n</i></sup> − 1', '<i>r</i>/<i>m</i>')}`,
    d: 'Proyecta el crecimiento de una inversión con capital inicial y aportaciones periódicas.',
    in: [['c0', 'Capital inicial €', 10000], ['a', 'Aportación mensual €', 300], ['r', 'Rentabilidad anual %', 7], ['n', 'Años', 25], ['inf', 'Inflación anual %', 2.5]],
    run(v) {
      const rm = v.r / 100 / 12; let bal = v.c0, aport = v.c0; const rows = [], s1 = [[0, bal]], s2 = [[0, aport]];
      for (let y = 1; y <= v.n; y++) { for (let m = 0; m < 12; m++) { bal = bal * (1 + rm) + v.a; aport += v.a; } rows.push([y, aport, bal, bal - aport, bal / (1 + v.inf / 100) ** y]); s1.push([y, bal]); s2.push([y, aport]); }
      return `<div class="res">${R_('Valor final', fmtEur(bal), 'gold')}${R_('Total aportado', fmtEur(aport))}${R_('Intereses generados', fmtEur(bal - aport), 'up')}${R_('Valor real (hoy)', fmtEur(bal / (1 + v.inf / 100) ** v.n))}${R_('Multiplicador', fmtN(bal / aport, 2) + '×')}</div>` +
        yearsChart([{ type: 'area', data: s1, color: '#f5b700', name: 'Valor total' }, { type: 'area', data: s2, color: '#3b82f6', name: 'Aportado' }]) +
        `<div class="scroll" style="max-height:220px"><table><tr><th>Año</th><th class="num">Aportado</th><th class="num">Valor</th><th class="num">Intereses</th><th class="num">Valor real</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td class="num">${fmtEur(r[1])}</td><td class="num">${fmtEur(r[2])}</td><td class="num up">${fmtEur(r[3])}</td><td class="num muted">${fmtEur(r[4])}</td></tr>`).join('')}</table></div>`;
    } },
  { id: 'prestamo', t: 'Préstamo / hipoteca (sistema francés)', cat: 'Deuda',
    f: `<i>Cuota</i> <span class="op">=</span> <i>P</i> · ${fr('<i>i</i> (1+<i>i</i>)<sup><i>n</i></sup>', '(1+<i>i</i>)<sup><i>n</i></sup> − 1')} &nbsp; <span class="muted" style="font-size:13px"><i>i</i> = TIN/12</span>`,
    d: 'Cuota mensual constante, cuadro de amortización y total de intereses.',
    in: [['p', 'Importe €', 200000], ['tin', 'TIN anual %', 3.2], ['y', 'Plazo (años)', 30], ['ex', 'Amortización extra anual €', 0]],
    run(v) {
      const i = v.tin / 1200, n = v.y * 12, q = i ? v.p * i * (1 + i) ** n / ((1 + i) ** n - 1) : v.p / n;
      let bal = v.p, ti = 0, rows = [], sc = [[0, v.p]], si = [[0, 0]], m = 0;
      while (bal > 0.005 && m < n) { m++; const it = bal * i; let am = Math.min(q - it, bal); bal -= am; ti += it; if (m % 12 === 0 && v.ex) { const e = Math.min(v.ex, bal); bal -= e; } if (m % 12 === 0 || bal <= 0.005) { rows.push([Math.ceil(m / 12), bal, ti]); sc.push([m / 12, bal]); si.push([m / 12, ti]); } }
      return `<div class="res">${R_('Cuota mensual', fmtEur(q), 'gold')}${R_('Total intereses', fmtEur(ti), 'down')}${R_('Total pagado', fmtEur(v.p + ti))}${R_('Meses reales', m)}${R_('TAE aprox.', fmtN(((1 + i) ** 12 - 1) * 100, 3) + ' %')}</div>` +
        yearsChart([{ type: 'area', data: sc, color: '#3b82f6', name: 'Capital pendiente' }, { type: 'line', data: si, color: '#ea3943', name: 'Intereses acumulados' }]) +
        `<div class="scroll" style="max-height:220px"><table><tr><th>Año</th><th class="num">Pendiente</th><th class="num">Intereses acumulados</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td class="num">${fmtEur(r[1])}</td><td class="num down">${fmtEur(r[2])}</td></tr>`).join('')}</table></div>`;
    } },
  { id: 'van', t: 'VAN y TIR de un proyecto', cat: 'Valoración',
    f: `<i>VAN</i> <span class="op">=</span> ${SUM('<i>t</i>=0', '<i>n</i>')} ${fr('<i>FC<sub>t</sub></i>', '(1+<i>k</i>)<sup><i>t</i></sup>')} &nbsp;&nbsp; <i>TIR</i>: <i>VAN</i>(<i>TIR</i>) = 0`,
    d: 'Flujos de caja separados por comas (el primero suele ser la inversión, negativo).',
    in: [['cf', 'Flujos de caja', '-10000, 2500, 3000, 3500, 4000, 2000', 'text'], ['k', 'Tasa de descuento %', 8]],
    run(v) {
      const cfs = String(v.cf).split(',').map(Number).filter(x => !isNaN(x)); const k = v.k / 100;
      const npv = cfs.reduce((a, c, i) => a + c / (1 + k) ** i, 0), r = irr(cfs);
      let acc = 0, pb = null; cfs.forEach((c, i) => { const prev = acc; acc += c; if (pb == null && acc >= 0 && i > 0) pb = i - 1 + (-prev / c); });
      const pv = cfs.slice(1).reduce((a, c, i) => a + c / (1 + k) ** (i + 1), 0);
      return `<div class="res">${R_('VAN', fmtEur(npv), cls(npv))}${R_('TIR', isNaN(r) ? '—' : fmtN(r * 100, 2) + ' %', r > k ? 'up' : 'down')}${R_('Payback', pb == null ? 'No' : fmtN(pb, 2) + ' periodos')}${R_('Índice rentabilidad', cfs[0] ? fmtN(pv / -cfs[0], 3) : '—')}</div>
        <div class="concl" style="margin-top:8px"><div class="${npv > 0 ? 'ok' : 'bad'}">${npv > 0 ? 'El proyecto crea valor: VAN positivo y TIR superior al coste de capital.' : 'El proyecto destruye valor a esa tasa de descuento.'}</div></div>` +
        svgChart([{ type: 'bar', data: cfs.map((c, i) => [i, c]), color: x => x >= 0 ? '#16c784' : '#ea3943', name: 'Flujos' }, { type: 'line', data: cfs.map((c, i) => [i, c / (1 + k) ** i]), color: '#f5b700', name: 'Descontado' }], { h: 200, xfmt: v => 't' + Math.round(v), xticks: Math.max(1, cfs.length - 1) });
    } },
  { id: 'cagr', t: 'CAGR — Tasa de crecimiento anual compuesto', cat: 'Ahorro e inversión',
    f: `<i>CAGR</i> <span class="op">=</span> (${fr('<i>V<sub>final</sub></i>', '<i>V<sub>inicial</sub></i>')})<sup>1/<i>n</i></sup> − 1`, d: 'Rentabilidad anual equivalente entre dos valores.',
    in: [['vi', 'Valor inicial', 10000], ['vf', 'Valor final', 25000], ['n', 'Años', 8]],
    run(v) { const c = (v.vf / v.vi) ** (1 / v.n) - 1; return `<div class="res">${R_('CAGR', fmtN(c * 100, 3) + ' %', cls(c))}${R_('Rentabilidad total', fmtN((v.vf / v.vi - 1) * 100, 2) + ' %')}${R_('Años para duplicar', c > 0 ? fmtN(Math.log(2) / Math.log(1 + c), 1) : '—')}</div>`; } },
  { id: 'posicion', t: 'Tamaño de posición y riesgo/beneficio', cat: 'Trading',
    f: `<i>Unidades</i> <span class="op">=</span> ${fr('<i>Capital</i> × <i>Riesgo</i>%', '|<i>Entrada</i> − <i>Stop</i>|')} &nbsp;&nbsp; <i>R</i>:<i>B</i> <span class="op">=</span> ${fr('|<i>TP</i> − <i>Entrada</i>|', '|<i>Entrada</i> − <i>Stop</i>|')}`,
    d: 'Cuántas acciones/unidades comprar para arriesgar solo un % del capital.',
    in: [['cap', 'Capital €', 20000], ['risk', 'Riesgo por operación %', 1], ['e', 'Precio entrada', 100], ['sl', 'Stop-loss', 95], ['tp', 'Take-profit', 112], ['wr', 'Tasa de acierto esperada %', 45]],
    run(v) {
      const rpu = Math.abs(v.e - v.sl), u = v.cap * v.risk / 100 / rpu, rr = Math.abs(v.tp - v.e) / rpu, w = v.wr / 100, ev = w * rr - (1 - w);
      return `<div class="res">${R_('Unidades', fmtN(u, 2), 'gold')}${R_('Valor posición', fmtEur(u * v.e))}${R_('% del capital', fmtN(u * v.e / v.cap * 100, 1) + ' %')}${R_('Pérdida máxima', fmtEur(u * rpu), 'down')}${R_('Beneficio objetivo', fmtEur(u * Math.abs(v.tp - v.e)), 'up')}${R_('Ratio R:B', '1 : ' + fmtN(rr, 2))}${R_('Acierto mínimo', fmtN(100 / (1 + rr), 1) + ' %')}${R_('Esperanza (R)', fmtN(ev, 3), cls(ev))}</div>`;
    } },
  { id: 'bs', t: 'Opciones: Black-Scholes y griegas', cat: 'Derivados',
    f: `<i>C</i> <span class="op">=</span> <i>S</i>·<i>N</i>(<i>d</i><sub>1</sub>) − <i>K</i>e<sup>−<i>rT</i></sup><i>N</i>(<i>d</i><sub>2</sub>) &nbsp;&nbsp; <i>d</i><sub>1</sub> <span class="op">=</span> ${fr('ln(<i>S</i>/<i>K</i>) + (<i>r</i> + <i>σ</i>²/2)<i>T</i>', '<i>σ</i>' + sq('<i>T</i>'))}, &nbsp; <i>d</i><sub>2</sub> = <i>d</i><sub>1</sub> − <i>σ</i>${sq('<i>T</i>')}`,
    d: 'Precio teórico de opciones europeas call y put y sus sensibilidades.',
    in: [['s', 'Precio subyacente', 100], ['k', 'Strike', 105], ['t', 'Días al vencimiento', 60], ['vol', 'Volatilidad implícita %', 25], ['r', 'Tipo libre de riesgo %', 3], ['q', 'Rentabilidad dividendo %', 0]],
    run(v) {
      const S = v.s, K = v.k, T = v.t / 365, s = v.vol / 100, r = v.r / 100, q = v.q / 100;
      const d1 = (Math.log(S / K) + (r - q + s * s / 2) * T) / (s * Math.sqrt(T)), d2 = d1 - s * Math.sqrt(T);
      const C = S * Math.exp(-q * T) * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2), P = K * Math.exp(-r * T) * ncdf(-d2) - S * Math.exp(-q * T) * ncdf(-d1);
      const g = Math.exp(-q * T) * npdf(d1) / (S * s * Math.sqrt(T)), vega = S * Math.exp(-q * T) * npdf(d1) * Math.sqrt(T) / 100;
      const thC = (-S * Math.exp(-q * T) * npdf(d1) * s / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * ncdf(d2) + q * S * Math.exp(-q * T) * ncdf(d1)) / 365;
      const thP = (-S * Math.exp(-q * T) * npdf(d1) * s / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * ncdf(-d2) - q * S * Math.exp(-q * T) * ncdf(-d1)) / 365;
      const pay = []; for (let x = S * 0.7; x <= S * 1.3; x += S * 0.01) pay.push([x, Math.max(0, x - K) - C, Math.max(0, K - x) - P]);
      return `<table><tr><th></th><th class="num">CALL</th><th class="num">PUT</th></tr><tr><td><b>Prima</b></td><td class="num gold"><b>${fmtN(C, 4)}</b></td><td class="num gold"><b>${fmtN(P, 4)}</b></td></tr>
        <tr><td>Delta Δ</td><td class="num">${fmtN(Math.exp(-q * T) * ncdf(d1), 4)}</td><td class="num">${fmtN(-Math.exp(-q * T) * ncdf(-d1), 4)}</td></tr><tr><td>Gamma Γ</td><td class="num">${fmtN(g, 5)}</td><td class="num">${fmtN(g, 5)}</td></tr>
        <tr><td>Vega ν (por 1 %)</td><td class="num">${fmtN(vega, 4)}</td><td class="num">${fmtN(vega, 4)}</td></tr><tr><td>Theta Θ (por día)</td><td class="num down">${fmtN(thC, 4)}</td><td class="num down">${fmtN(thP, 4)}</td></tr>
        <tr><td>Rho ρ (por 1 %)</td><td class="num">${fmtN(K * T * Math.exp(-r * T) * ncdf(d2) / 100, 4)}</td><td class="num">${fmtN(-K * T * Math.exp(-r * T) * ncdf(-d2) / 100, 4)}</td></tr>
        <tr><td>Prob. acabar ITM</td><td class="num">${fmtN(ncdf(d2) * 100, 1)} %</td><td class="num">${fmtN(ncdf(-d2) * 100, 1)} %</td></tr><tr><td>Punto muerto</td><td class="num">${fmtP(K + C)}</td><td class="num">${fmtP(K - P)}</td></tr></table>` +
        svgChart([{ type: 'line', data: pay.map(p => [p[0], p[1]]), color: '#16c784', name: 'Call comprada (a vencimiento)' }, { type: 'line', data: pay.map(p => [p[0], p[2]]), color: '#ea3943', name: 'Put comprada' }], { h: 200, xfmt: v => fmtN(v, 0), yfmt: v => fmtN(v, 1) });
    } },
  { id: 'bono', t: 'Bonos: precio, TIR, duración y convexidad', cat: 'Renta fija',
    f: `<i>P</i> <span class="op">=</span> ${SUM('<i>t</i>=1', '<i>n</i>')} ${fr('<i>C</i>', '(1+<i>y</i>)<sup><i>t</i></sup>')} + ${fr('<i>N</i>', '(1+<i>y</i>)<sup><i>n</i></sup>')} &nbsp;&nbsp; <i>D<sub>mac</sub></i> = ${fr('1', '<i>P</i>')}${SUM('<i>t</i>', '')} ${fr('<i>t</i>·<i>FC<sub>t</sub></i>', '(1+<i>y</i>)<sup><i>t</i></sup>')}`,
    d: 'Introduce el precio de mercado para obtener la TIR (YTM), o la TIR para obtener el precio.',
    in: [['nom', 'Nominal', 1000], ['cup', 'Cupón anual %', 4], ['yrs', 'Años a vencimiento', 10], ['freq', 'Pagos por año', 1], ['ytm', 'TIR exigida %', 4.5], ['px', 'Precio de mercado (0 = calcular)', 0]],
    run(v) {
      const m = v.freq || 1, n = Math.round(v.yrs * m), c = v.nom * v.cup / 100 / m;
      const price = y => { let p = 0; for (let t = 1; t <= n; t++) p += c / (1 + y / m) ** t; return p + v.nom / (1 + y / m) ** n; };
      let y = v.ytm / 100;
      if (v.px > 0) { let lo = -0.5, hi = 1; for (let i = 0; i < 200; i++) { const md = (lo + hi) / 2; price(md) > v.px ? lo = md : hi = md; } y = (lo + hi) / 2; }
      const P = price(y); let dm = 0, cx = 0;
      for (let t = 1; t <= n; t++) { const cf = c + (t === n ? v.nom : 0), df = cf / (1 + y / m) ** t; dm += t * df; cx += t * (t + 1) * df; }
      dm = dm / P / m; const dmod = dm / (1 + y / m); cx = cx / (P * (1 + y / m) ** 2 * m * m);
      const curve = []; for (let yy = Math.max(0.001, y - 0.04); yy <= y + 0.04; yy += 0.002) curve.push([yy * 100, price(yy)]);
      return `<div class="res">${R_('Precio', fmtN(P, 2), 'gold')}${R_('Precio % nominal', fmtN(P / v.nom * 100, 3))}${R_('TIR (YTM)', fmtN(y * 100, 3) + ' %')}${R_('Rent. corriente', fmtN(v.cup * v.nom / P, 3) + ' %')}${R_('Duración Macaulay', fmtN(dm, 3) + ' años')}${R_('Duración modificada', fmtN(dmod, 3))}${R_('Convexidad', fmtN(cx, 2))}${R_('Δ precio si +1 % tipos', fmtN((-dmod * 0.01 + 0.5 * cx * 0.0001) * 100, 2) + ' %', 'down')}</div>` +
        svgChart([{ type: 'line', data: curve, color: '#22d3ee', name: 'Precio vs TIR' }], { h: 190, xfmt: v => fmtN(v, 1) + '%', yfmt: v => fmtN(v, 0) });
    } },
  { id: 'fire', t: 'Jubilación / independencia financiera (FIRE)', cat: 'Ahorro e inversión',
    f: `<i>Objetivo</i> <span class="op">=</span> ${fr('<i>Gasto anual</i>', '<i>Tasa de retiro segura</i>')} &nbsp;&nbsp; (regla del 4 % ⇒ 25 × gasto)`,
    d: 'Calcula el patrimonio necesario y cuántos años faltan para vivir de las rentas.',
    in: [['g', 'Gasto anual deseado €', 30000], ['swr', 'Tasa de retiro %', 4], ['pat', 'Patrimonio actual €', 50000], ['ah', 'Ahorro anual €', 15000], ['r', 'Rentabilidad real anual %', 5]],
    run(v) {
      const goal = v.g / (v.swr / 100); let p = v.pat, y = 0; const s = [[0, p]];
      while (p < goal && y < 80) { p = p * (1 + v.r / 100) + v.ah; y++; s.push([y, p]); }
      return `<div class="res">${R_('Patrimonio objetivo', fmtEur(goal), 'gold')}${R_('Años hasta FIRE', y >= 80 ? '> 80' : y, 'up')}${R_('Progreso actual', fmtN(v.pat / goal * 100, 1) + ' %')}${R_('Renta mensual', fmtEur(v.g / 12))}</div>` +
        yearsChart([{ type: 'area', data: s, color: '#16c784', name: 'Patrimonio' }, { type: 'line', data: s.map(x => [x[0], goal]), color: '#f5b700', dash: 1, name: 'Objetivo' }]);
    } },
  { id: 'inflacion', t: 'Inflación y poder adquisitivo', cat: 'Macroeconomía',
    f: `<i>Valor real</i> <span class="op">=</span> ${fr('<i>Valor nominal</i>', '(1 + <i>π</i>)<sup><i>n</i></sup>')} &nbsp;&nbsp; <i>r<sub>real</sub></i> = ${fr('1 + <i>r<sub>nom</sub></i>', '1 + <i>π</i>')} − 1 &nbsp; (Fisher)`,
    d: 'Pérdida de poder adquisitivo del dinero y rentabilidad real.',
    in: [['m', 'Cantidad €', 10000], ['pi', 'Inflación anual %', 3], ['n', 'Años', 20], ['rn', 'Rentabilidad nominal %', 4]],
    run(v) {
      const real = v.m / (1 + v.pi / 100) ** v.n, rr = (1 + v.rn / 100) / (1 + v.pi / 100) - 1; const s = [];
      for (let y = 0; y <= v.n; y++) s.push([y, v.m / (1 + v.pi / 100) ** y]);
      return `<div class="res">${R_('Poder adquisitivo final', fmtEur(real), 'down')}${R_('Pérdida', fmtN((1 - real / v.m) * 100, 1) + ' %', 'down')}${R_('Necesitarás', fmtEur(v.m * (1 + v.pi / 100) ** v.n))}${R_('Rentabilidad real', fmtN(rr * 100, 3) + ' %', cls(rr))}</div>` + yearsChart([{ type: 'area', data: s, color: '#ea3943', name: 'Valor real' }], 180);
    } },
  { id: 'dcf', t: 'Valoración por descuento de flujos (DCF)', cat: 'Valoración',
    f: `<i>EV</i> <span class="op">=</span> ${SUM('<i>t</i>=1', '<i>n</i>')} ${fr('<i>FCF</i><sub>0</sub>(1+<i>g</i>)<sup><i>t</i></sup>', '(1+<i>WACC</i>)<sup><i>t</i></sup>')} + ${fr('<i>FCF<sub>n</sub></i>(1+<i>g<sub>∞</sub></i>)', '(<i>WACC</i> − <i>g<sub>∞</sub></i>)(1+<i>WACC</i>)<sup><i>n</i></sup>')}`,
    d: 'Valor intrínseco por acción de una empresa (modelo de 2 etapas).',
    in: [['fcf', 'Flujo de caja libre actual (M)', 1000], ['g', 'Crecimiento años 1-n %', 8], ['n', 'Años de proyección', 10], ['gt', 'Crecimiento perpetuo %', 2.5], ['w', 'WACC %', 9], ['debt', 'Deuda neta (M)', 2000], ['sh', 'Acciones (M)', 500], ['px', 'Precio actual acción', 25]],
    run(v) {
      let pv = 0, f = v.fcf; const rows = [];
      for (let t = 1; t <= v.n; t++) { f *= 1 + v.g / 100; const d = f / (1 + v.w / 100) ** t; pv += d; rows.push([t, f, d]); }
      const tv = f * (1 + v.gt / 100) / ((v.w - v.gt) / 100), pvtv = tv / (1 + v.w / 100) ** v.n, ev = pv + pvtv, eq = ev - v.debt, ps = eq / v.sh, up = ps / v.px - 1;
      return `<div class="res">${R_('Valor empresa (EV)', fmtN(ev, 0) + ' M')}${R_('Valor terminal (VP)', fmtN(pvtv, 0) + ' M')}${R_('% del valor en terminal', fmtN(pvtv / ev * 100, 1) + ' %')}${R_('Valor por acción', fmtN(ps, 2), 'gold')}${R_('Potencial', fmtR(up), cls(up))}${R_('Margen de seguridad', up > 0 ? fmtN(up / (1 + up) * 100, 1) + ' %' : 'Sobrevalorada', cls(up))}</div>` +
        svgChart([{ type: 'bar', data: rows.map(r => [r[0], r[1]]), color: '#3b82f6', name: 'FCF proyectado' }, { type: 'bar', data: rows.map(r => [r[0], r[2]]), color: '#f5b700', name: 'FCF descontado' }], { h: 190, y0: 0, xfmt: v => 'Año ' + Math.round(v), xticks: Math.min(10, v.n - 1) });
    } },
  { id: 'kelly', t: 'Criterio de Kelly', cat: 'Trading',
    f: `<i>f</i>* <span class="op">=</span> <i>p</i> − ${fr('1 − <i>p</i>', '<i>b</i>')} &nbsp;&nbsp; <span class="muted" style="font-size:13px"><i>p</i> = prob. acierto, <i>b</i> = ganancia/pérdida media</span>`,
    d: 'Fracción óptima del capital a arriesgar para maximizar el crecimiento a largo plazo.',
    in: [['p', 'Prob. de acierto %', 55], ['b', 'Ratio ganancia/pérdida', 1.5]],
    run(v) { const p = v.p / 100, f = p - (1 - p) / v.b; const s = []; for (let x = 0; x <= 1; x += 0.02) s.push([x * 100, p * Math.log(1 + v.b * x) + (1 - p) * Math.log(Math.max(1e-9, 1 - x))]);
      return `<div class="res">${R_('Kelly completo', fmtN(f * 100, 2) + ' %', f > 0 ? 'gold' : 'down')}${R_('½ Kelly (recomendado)', fmtN(f * 50, 2) + ' %')}${R_('¼ Kelly', fmtN(f * 25, 2) + ' %')}${R_('Esperanza por unidad', fmtN(p * v.b - (1 - p), 3), cls(p * v.b - (1 - p)))}</div>` + svgChart([{ type: 'line', data: s, color: '#a78bfa', name: 'Crecimiento log esperado vs % arriesgado' }], { h: 180, xfmt: v => fmtN(v, 0) + '%', yfmt: v => fmtN(v, 3) }); } },
  { id: 'dividendo', t: 'Dividendos: rentabilidad y modelo de Gordon', cat: 'Valoración',
    f: `<i>P</i><sub>0</sub> <span class="op">=</span> ${fr('<i>D</i><sub>1</sub>', '<i>k</i> − <i>g</i>')} &nbsp;&nbsp; <i>Yield</i> = ${fr('<i>D</i>', '<i>P</i>')} &nbsp;&nbsp; <i>YoC</i> = ${fr('<i>D<sub>actual</sub></i>', '<i>P<sub>compra</sub></i>')}`,
    d: 'Rentabilidad por dividendo, yield on cost y valor teórico por crecimiento de dividendos.',
    in: [['d', 'Dividendo anual por acción', 2], ['p', 'Precio actual', 50], ['pc', 'Precio de compra', 35], ['g', 'Crecimiento dividendo %', 5], ['k', 'Rentabilidad exigida %', 9], ['n', 'Acciones', 100]],
    run(v) { const val = v.d * (1 + v.g / 100) / ((v.k - v.g) / 100); return `<div class="res">${R_('Rent. dividendo', fmtN(v.d / v.p * 100, 2) + ' %', 'gold')}${R_('Yield on cost', fmtN(v.d / v.pc * 100, 2) + ' %')}${R_('Valor Gordon', fmtN(val, 2), val > v.p ? 'up' : 'down')}${R_('Ingreso anual', fmtEur(v.d * v.n))}${R_('Dividendo en 10 años', fmtN(v.d * (1 + v.g / 100) ** 10, 2))}</div>`; } },
  { id: 'breakeven', t: 'Punto muerto (umbral de rentabilidad)', cat: 'Empresa',
    f: `<i>Q</i>* <span class="op">=</span> ${fr('<i>Costes fijos</i>', '<i>Precio</i> − <i>Coste variable unitario</i>')}`, d: 'Unidades que hay que vender para cubrir todos los costes.',
    in: [['cf', 'Costes fijos €', 50000], ['p', 'Precio de venta unitario', 40], ['cv', 'Coste variable unitario', 22], ['q', 'Ventas previstas (uds)', 4000]],
    run(v) { const mc = v.p - v.cv, q = v.cf / mc, s1 = [], s2 = []; for (let x = 0; x <= Math.max(q, v.q) * 1.6; x += Math.max(q, v.q) * 1.6 / 30) { s1.push([x, v.p * x]); s2.push([x, v.cf + v.cv * x]); }
      return `<div class="res">${R_('Punto muerto', fmtN(q, 0) + ' uds', 'gold')}${R_('Facturación mínima', fmtEur(q * v.p))}${R_('Margen contribución', fmtN(mc / v.p * 100, 1) + ' %')}${R_('Beneficio previsto', fmtEur(mc * v.q - v.cf), cls(mc * v.q - v.cf))}${R_('Margen seguridad', fmtN((v.q - q) / v.q * 100, 1) + ' %')}</div>` + svgChart([{ type: 'line', data: s1, color: '#16c784', name: 'Ingresos' }, { type: 'line', data: s2, color: '#ea3943', name: 'Costes totales' }], { h: 190, xfmt: v => fmtN(v, 0) }); } },
  { id: 'divisas', t: 'Conversor de divisas en tiempo real', cat: 'Macroeconomía', live: true,
    f: `<i>Importe</i><sub>B</sub> <span class="op">=</span> <i>Importe</i><sub>A</sub> × <i>Tipo</i><sub>A/B</sub>`, d: 'Tipos de cambio en vivo desde el mercado de divisas.',
    in: [['amt', 'Importe', 1000], ['from', 'De (EUR, USD, GBP, JPY, CHF, MXN…)', 'EUR', 'text'], ['to', 'A', 'USD', 'text']],
    async run(v) { const a = String(v.from).toUpperCase().trim(), b = String(v.to).toUpperCase().trim(); if (a === b) return R_('Resultado', fmtN(v.amt, 2)); const [q] = await api(`/api/quotes?symbols=${a}${b}=X`); const rate = q.price;
      return `<div class="res">${R_('Resultado', fmtN(v.amt * rate, 2) + ' ' + esc(b), 'gold')}${R_(`1 ${esc(a)} =`, fmtP(rate) + ' ' + esc(b))}${R_(`1 ${esc(b)} =`, fmtP(1 / rate) + ' ' + esc(a))}${R_('Var. hoy', fmtPct(q.pct), cls(q.pct))}</div><div class="note">Fuente: ${q.source}</div>`; } },
  { id: 'fibo', t: 'Retrocesos y extensiones de Fibonacci', cat: 'Trading',
    f: `<i>Nivel</i> <span class="op">=</span> <i>Máx</i> − (<i>Máx</i> − <i>Mín</i>) × <i>ratio</i>, &nbsp; ratios: 0,236 · 0,382 · 0,5 · 0,618 · 0,786`, d: 'Niveles clave de soporte/resistencia de un movimiento.',
    in: [['hi', 'Máximo del tramo', 120], ['lo', 'Mínimo del tramo', 80]],
    run(v) { const d = v.hi - v.lo; const r = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], e = [1.272, 1.414, 1.618, 2, 2.618];
      return `<div class="grid g2"><table><tr><th>Retroceso</th><th class="num">Nivel</th></tr>${r.map(x => `<tr><td>${fmtN(x * 100, 1)} %</td><td class="num ${x === 0.618 ? 'gold' : ''}">${fmtP(v.hi - d * x)}</td></tr>`).join('')}</table><table><tr><th>Extensión</th><th class="num">Alcista</th><th class="num">Bajista</th></tr>${e.map(x => `<tr><td>${fmtN(x * 100, 1)} %</td><td class="num up">${fmtP(v.lo + d * x)}</td><td class="num down">${fmtP(v.hi - d * x)}</td></tr>`).join('')}</table></div>`; } },
  { id: 'pivotes', t: 'Puntos pivote', cat: 'Trading',
    f: `<i>P</i> <span class="op">=</span> ${fr('<i>H</i> + <i>L</i> + <i>C</i>', '3')} &nbsp; <i>R</i>1 = 2<i>P</i> − <i>L</i> &nbsp; <i>S</i>1 = 2<i>P</i> − <i>H</i> &nbsp; <i>R</i>2 = <i>P</i> + (<i>H</i>−<i>L</i>) &nbsp; <i>S</i>2 = <i>P</i> − (<i>H</i>−<i>L</i>)`, d: 'Niveles intradía a partir del máximo, mínimo y cierre de la sesión anterior.',
    in: [['h', 'Máximo anterior', 105], ['l', 'Mínimo anterior', 98], ['c', 'Cierre anterior', 103]],
    run(v) { const P = (v.h + v.l + v.c) / 3, R = v.h - v.l; const L = [['R3', v.h + 2 * (P - v.l)], ['R2', P + R], ['R1', 2 * P - v.l], ['P', P], ['S1', 2 * P - v.h], ['S2', P - R], ['S3', v.l - 2 * (v.h - P)]];
      return `<table>${L.map(([k, x]) => `<tr><td class="${k[0] === 'R' ? 'down' : k[0] === 'S' ? 'up' : 'gold'}"><b>${k}</b></td><td class="num">${fmtP(x)}</td><td class="num muted">${fmtPct((x / v.c - 1) * 100)}</td></tr>`).join('')}</table>`; } },
  { id: 'regla72', t: 'Regla del 72 / tiempo para duplicar', cat: 'Ahorro e inversión',
    f: `<i>n</i> ≈ ${fr('72', '<i>r</i> (%)')} &nbsp;&nbsp; exacto: <i>n</i> = ${fr('ln 2', 'ln(1 + <i>r</i>)')}`, d: 'Años necesarios para duplicar (o triplicar) el capital.',
    in: [['r', 'Rentabilidad anual %', 8]],
    run(v) { const r = v.r / 100; return `<div class="res">${R_('Regla del 72', fmtN(72 / v.r, 2) + ' años')}${R_('Exacto ×2', fmtN(Math.log(2) / Math.log(1 + r), 2) + ' años', 'gold')}${R_('Exacto ×3', fmtN(Math.log(3) / Math.log(1 + r), 2) + ' años')}${R_('Exacto ×10', fmtN(Math.log(10) / Math.log(1 + r), 2) + ' años')}</div>`; } },
  { id: 'anualidad', t: 'Valor presente / futuro de una renta', cat: 'Ahorro e inversión',
    f: `<i>VP</i> <span class="op">=</span> <i>PMT</i> · ${fr('1 − (1+<i>i</i>)<sup>−<i>n</i></sup>', '<i>i</i>')} &nbsp;&nbsp; <i>VF</i> <span class="op">=</span> <i>PMT</i> · ${fr('(1+<i>i</i>)<sup><i>n</i></sup> − 1', '<i>i</i>')}`, d: 'Cuánto vale hoy (o mañana) una serie de pagos periódicos.',
    in: [['pmt', 'Pago periódico €', 500], ['i', 'Tipo por periodo %', 0.4], ['n', 'Nº de periodos', 120]],
    run(v) { const i = v.i / 100, vp = i ? v.pmt * (1 - (1 + i) ** -v.n) / i : v.pmt * v.n, vf = i ? v.pmt * ((1 + i) ** v.n - 1) / i : v.pmt * v.n;
      return `<div class="res">${R_('Valor presente', fmtEur(vp), 'gold')}${R_('Valor futuro', fmtEur(vf), 'up')}${R_('Suma de pagos', fmtEur(v.pmt * v.n))}${R_('Renta perpetua (VP)', i ? fmtEur(v.pmt / i) : '∞')}</div>`; } },
  { id: 'dca', t: 'Precio medio (DCA / promediar)', cat: 'Trading',
    f: `<i>P̄</i> <span class="op">=</span> ${fr(SUM('<i>i</i>', '') + ' <i>q<sub>i</sub></i> · <i>p<sub>i</sub></i>', SUM('<i>i</i>', '') + ' <i>q<sub>i</sub></i>')}`, d: 'Compras como "cantidad@precio" separadas por comas.',
    in: [['buys', 'Compras', '10@100, 15@90, 20@80, 10@85', 'text'], ['px', 'Precio actual', 92]],
    run(v) { const b = String(v.buys).split(',').map(s => s.split('@').map(Number)).filter(x => x.length === 2 && !x.some(isNaN)); const q = b.reduce((a, x) => a + x[0], 0), c = b.reduce((a, x) => a + x[0] * x[1], 0), avg = c / q, val = q * v.px;
      return `<div class="res">${R_('Precio medio', fmtP(avg), 'gold')}${R_('Unidades', fmtN(q, 4))}${R_('Invertido', fmtEur(c))}${R_('Valor actual', fmtEur(val))}${R_('Resultado', fmtEur(val - c) + ' (' + fmtPct((val / c - 1) * 100) + ')', cls(val - c))}</div>`; } },
  { id: 'recuperar', t: 'Recuperación tras una pérdida', cat: 'Trading',
    f: `<i>Ganancia necesaria</i> <span class="op">=</span> ${fr('1', '1 − <i>pérdida</i>')} − 1`, d: 'Las pérdidas son asimétricas: perder un 50 % exige ganar un 100 % para recuperar.',
    in: [['l', 'Pérdida %', 30], ['r', 'Rentabilidad anual esperada %', 8]],
    run(v) { const g = 1 / (1 - v.l / 100) - 1; const s = []; for (let x = 5; x <= 90; x += 5) s.push([x, (1 / (1 - x / 100) - 1) * 100]);
      return `<div class="res">${R_('Ganancia necesaria', fmtN(g * 100, 2) + ' %', 'down')}${R_('Años para recuperar', fmtN(Math.log(1 + g) / Math.log(1 + v.r / 100), 1))}</div>` + svgChart([{ type: 'area', data: s, color: '#ea3943', name: 'Ganancia necesaria según pérdida' }], { h: 170, xfmt: v => fmtN(v, 0) + '%', yfmt: v => fmtN(v, 0) + '%', y0: 0 }); } },
  { id: 'apalanca', t: 'Apalancamiento y precio de liquidación', cat: 'Derivados',
    f: `<i>P<sub>liq</sub></i> (largo) ≈ <i>P<sub>e</sub></i> · (1 − ${fr('1', '<i>L</i>')} + <i>mm</i>) &nbsp;&nbsp; (corto) ≈ <i>P<sub>e</sub></i> · (1 + ${fr('1', '<i>L</i>')} − <i>mm</i>)`, d: 'Margen requerido, exposición y precio aproximado de liquidación (futuros/CFD).',
    in: [['m', 'Margen aportado €', 1000], ['L', 'Apalancamiento (×)', 10], ['pe', 'Precio de entrada', 50000], ['mm', 'Margen de mantenimiento %', 0.5]],
    run(v) { const exp = v.m * v.L, mm = v.mm / 100; return `<div class="res">${R_('Exposición', fmtEur(exp), 'gold')}${R_('Liquidación largo', fmtP(v.pe * (1 - 1 / v.L + mm)), 'down')}${R_('Liquidación corto', fmtP(v.pe * (1 + 1 / v.L - mm)), 'down')}${R_('Mov. adverso tolerado', fmtN((1 / v.L - mm) * 100, 2) + ' %')}${R_('P&L por 1 % de movimiento', fmtEur(exp / 100))}</div>`; } },
  { id: 'ratios', t: 'Ratios de valoración de empresas', cat: 'Valoración',
    f: `<i>PER</i> = ${fr('<i>Precio</i>', '<i>BPA</i>')} &nbsp; <i>PEG</i> = ${fr('<i>PER</i>', '<i>g</i> (%)')} &nbsp; <i>P/VC</i> = ${fr('<i>Precio</i>', '<i>VC por acción</i>')} &nbsp; <i>ROE</i> = ${fr('<i>Beneficio neto</i>', '<i>Patrimonio</i>')}`, d: 'Múltiplos principales a partir de datos del balance y la cuenta de resultados.',
    in: [['p', 'Precio acción', 150], ['eps', 'BPA (beneficio por acción)', 6], ['g', 'Crecimiento BPA %', 12], ['bv', 'Valor contable por acción', 30], ['sh', 'Acciones (M)', 1000], ['ebitda', 'EBITDA (M)', 12000], ['debt', 'Deuda neta (M)', 20000], ['sales', 'Ventas (M)', 60000]],
    run(v) { const mc = v.p * v.sh, ev = mc + v.debt; return `<div class="res">${R_('Capitalización', fmtN(mc, 0) + ' M')}${R_('PER', fmtN(v.p / v.eps, 2), 'gold')}${R_('Rent. beneficio (E/P)', fmtN(v.eps / v.p * 100, 2) + ' %')}${R_('PEG', fmtN(v.p / v.eps / v.g, 2), v.p / v.eps / v.g < 1 ? 'up' : '')}${R_('P/VC', fmtN(v.p / v.bv, 2))}${R_('ROE', fmtN(v.eps / v.bv * 100, 2) + ' %')}${R_('EV', fmtN(ev, 0) + ' M')}${R_('EV/EBITDA', fmtN(ev / v.ebitda, 2))}${R_('P/Ventas', fmtN(mc / v.sales, 2))}${R_('Deuda/EBITDA', fmtN(v.debt / v.ebitda, 2))}</div>`; } },
];

App.views.calculadoras = (main) => {
  const cats = [...new Set(CALCS.map(c => c.cat))];
  main.innerHTML = `<div class="view-title"><h1>Calculadoras financieras</h1><span class="sub">${CALCS.length} herramientas con fórmula, resultados, tablas y gráficas</span></div>
    <div class="calc-nav">${['Todas', ...cats].map((c, i) => `<button class="btn ${i ? '' : 'on'}" data-c="${c}">${c}</button>`).join('')}</div><div class="calc-grid" id="cg"></div>`;
  const draw = cat => {
    $('#cg').innerHTML = CALCS.filter(c => cat === 'Todas' || c.cat === cat).map(c => `<div class="card calc" data-id="${c.id}"><h3>${esc(c.t)} <span class="badge">${c.cat}</span></h3><div class="formula">${c.f}</div><div class="desc">${c.d}</div>
      <div class="form">${c.in.map(([k, l, d, ty]) => `<label class="f" ${ty === 'text' ? 'style="grid-column:1/-1"' : ''}>${l}<input data-k="${k}" ${ty === 'text' ? '' : 'type="number" step="any"'} value="${d}"></label>`).join('')}</div><div class="out" style="margin-top:6px"></div></div>`).join('');
    $$('#cg .calc').forEach(card => {
      const c = CALCS.find(x => x.id === card.dataset.id);
      const go = async () => { const v = {}; $$('input', card).forEach(i => v[i.dataset.k] = i.type === 'number' ? +i.value : i.value); try { $('.out', card).innerHTML = await c.run(v); } catch (e) { $('.out', card).innerHTML = `<div class="err">${esc(e.message)}</div>`; } };
      $$('input', card).forEach(i => i.addEventListener(c.live ? 'change' : 'input', go)); go();
    });
  };
  $$('.calc-nav button').forEach(b => b.onclick = () => { $$('.calc-nav button').forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.c); });
  draw('Todas');
};
