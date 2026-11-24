/* LAX admin — izvještaji (samo admin): promet i radnici, usluge, klijenti i bodovi, shop */
(function () {
  'use strict';
  const CAT = {kosa: 'Nadogradnja kose', nokti: 'Nokti', trepavice: 'Trepavice i obrve', trajna: 'Trajna šminka', lice: 'Tretmani lica', tijelo: 'Tretmani tijela', sminkanje: 'Šminkanje', edukacije: 'Edukacije'};
  const MS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
  const MN = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni', 'Juli', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
  const REP = [['promet', 'Promet i radnici'], ['usluge', 'Usluge'], ['klijenti', 'Klijenti i bodovi'], ['shop', 'Shop']];
  let rep = 'promet', D = null, cur = null, from, to, label;

  const sec = document.createElement('section');
  sec.id = 't-reports'; sec.className = 'hide';
  sec.innerHTML = `<div class="bar"><h2>Izvještaji</h2>
      <div class="rpper"><select id="rpPer"><option value="m0">Ovaj mjesec</option><option value="m1">Prošli mjesec</option><option value="w0">Ova sedmica</option><option value="y0">Ova godina</option><option value="y1">Prošla godina</option><option value="c">Od – do…</option></select>
      <span id="rpCustom" class="hide"><input type="date" id="rpFrom"> – <input type="date" id="rpTo"></span></div>
      <div style="display:flex;gap:8px"><button class="btn" id="rpCsv">⬇ Excel (CSV)</button><button class="btn" id="rpPrint">🖨 Štampa / PDF</button></div></div>
    <div class="rptabs" id="rpTabs">${REP.map(([k, n]) => `<button data-rp="${k}" class="${k === rep ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="rpOut"><div class="card" style="color:var(--muted)">Učitavanje…</div></div>`;
  const staffSec = document.getElementById('t-staff');
  staffSec.parentNode.insertBefore(sec, staffSec);

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dmy = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + '.';
  const pl = (n, a, b, c) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);
  const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–';
  const sum = (L, f) => L.reduce((t, x) => t + (+f(x) || 0), 0);
  const artOf = a => Array.isArray(a.extras) ? a.extras.filter(x => x.variant_id) : [];

  function period() {
    const v = $('#rpPer').value, n = new Date(); n.setHours(0, 0, 0, 0);
    $('#rpCustom').classList.toggle('hide', v !== 'c');
    if (v === 'm0' || v === 'm1') { const k = v === 'm1' ? 1 : 0; from = new Date(n.getFullYear(), n.getMonth() - k, 1); to = new Date(n.getFullYear(), n.getMonth() - k + 1, 1); label = MN[from.getMonth()] + ' ' + from.getFullYear() + '.'; }
    else if (v === 'w0') { from = new Date(n); from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); to = new Date(from); to.setDate(to.getDate() + 7); }
    else if (v === 'y0' || v === 'y1') { const y = n.getFullYear() - (v === 'y1' ? 1 : 0); from = new Date(y, 0, 1); to = new Date(y + 1, 0, 1); label = 'Godina ' + y + '.'; }
    else {
      if (!$('#rpFrom').value) { $('#rpFrom').value = ymd(new Date(n.getFullYear(), n.getMonth(), 1)); $('#rpTo').value = ymd(n); }
      from = new Date($('#rpFrom').value + 'T00:00'); to = new Date($('#rpTo').value + 'T00:00'); to.setDate(to.getDate() + 1);
    }
    if (v === 'w0' || v === 'c') { const e = new Date(to); e.setDate(e.getDate() - 1); label = dmy(from) + ' – ' + dmy(e); }
  }

  // Supabase vraća najviše 1000 redova odjednom: čitaj u dijelovima
  async function all(make) {
    let out = [];
    for (let i = 0; i < 50; i++) {
      const {data, error} = await make().range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out = out.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function load() {
    period();
    $('#rpOut').innerHTML = '<div class="card" style="color:var(--muted)">Učitavanje…</div>';
    const F = from.toISOString(), T = to.toISOString();
    try {
      const [ap, pts, ord, cl, st] = await Promise.all([
        all(() => sb.from('lax_appointments').select('*').gte('starts_at', F).lt('starts_at', T).order('starts_at')),
        all(() => sb.from('lax_points').select('client_id,delta,reason,created_at').gte('created_at', F).lt('created_at', T)),
        all(() => sb.from('lax_orders').select('*').gte('created_at', F).lt('created_at', T).order('created_at')),
        all(() => sb.from('lax_client_balance').select('*').order('name')),
        sb.from('lax_staff').select('*').order('sort').then(r => { if (r.error) throw r.error; return r.data; })
      ]);
      D = {ap: ap.map(a => ({...a, s: new Date(a.starts_at)})), pts, ord, cl, st};
      draw();
    } catch (e) { $('#rpOut').innerHTML = '<div class="card">Greška: ' + esc(e.message || e) + '</div>'; }
  }

  // ---------- grafikon po danima ili mjesecima ----------
  function buckets(L, val) {
    const days = Math.round((to - from) / 864e5), byMonth = days > 62, B = [];
    if (byMonth) for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) B.push({k: d.getFullYear() + '-' + d.getMonth(), l: MS[d.getMonth()] + (from.getFullYear() !== new Date(to - 1).getFullYear() ? ' ' + String(d.getFullYear()).slice(2) : ''), v: 0});
    else for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) B.push({k: ymd(d), l: d.getDate() + '.', v: 0, w: d.getDay() === 1});
    const idx = Object.fromEntries(B.map((b, i) => [b.k, i]));
    L.forEach(x => { const d = x.s || new Date(x.created_at), k = byMonth ? d.getFullYear() + '-' + d.getMonth() : ymd(d); if (idx[k] != null) B[idx[k]].v += val(x); });
    return {B, byMonth};
  }
  function chart(title, L, val, fmt) {
    const {B, byMonth} = buckets(L, val), mx = Math.max(1, ...B.map(b => b.v));
    return {title: title + (byMonth ? ' po mjesecima' : ' po danima'), html: `<div class="rpch">${B.map(b => `<div class="c${b.w ? ' w' : ''}" title="${esc(b.l)} ${esc(fmt(b.v))}"><span class="v">${b.v ? esc(fmt(b.v).replace(' KM', '')) : ''}</span><i style="height:${Math.round(b.v / mx * 100)}%"></i><span class="l">${esc(b.l)}</span></div>`).join('')}</div>`,
      csv: {head: [byMonth ? 'Mjesec' : 'Dan', title], rows: B.map(b => [b.l, b.v])}};
  }
  const bar = (v, mx) => `<span class="rpbar"><i style="width:${mx ? Math.round(v / mx * 100) : 0}%"></i></span>`;

  // ---------- izvještaji: svaki vraća {kpi, blocks} ----------
  function rPromet() {
    const A = D.ap, done = A.filter(a => a.status === 'zavrsen'), nd = A.filter(a => a.status === 'nije_dosla'), ot = A.filter(a => a.status === 'otkazan');
    const tot = sum(done, a => a.price), art = sum(done, a => sum(artOf(a), x => x.price * x.qty));
    const rows = D.st.map(s => {
      const m = A.filter(a => a.staff_id === s.id), d = m.filter(a => a.status === 'zavrsen'), p = sum(d, a => a.price);
      return {n: s.name, d: d.length, p, avg: d.length ? p / d.length : 0, nd: m.filter(a => a.status === 'nije_dosla').length, ot: m.filter(a => a.status === 'otkazan').length};
    }).filter(r => r.d || r.nd || r.ot);
    const mx = Math.max(0, ...rows.map(r => r.p));
    return {kpi: [['Promet', km(tot), pl(done.length, 'završen termin', 'završena termina', 'završenih termina'), 1], ['Prosjek po terminu', km(done.length ? tot / done.length : 0), ''], ['Od toga artikli', km(art), 'prodano uz termine'],
        ['Nisu došli', nd.length, pct(nd.length, nd.length + done.length) + ' od dolazaka'], ['Otkazano', ot.length, 'termina']],
      blocks: [chart('Promet', done, a => +a.price || 0, km),
        {title: 'Po radniku/ci', head: ['Radnik/ca', 'Završeno', 'Promet', 'Udio', 'Prosjek', 'Nisu došli', 'Otkazano'], num: [1, 2, 3, 4, 5, 6],
          rows: rows.map(r => [r.n, r.d, km(r.p), pct(r.p, tot), km(r.avg), r.nd, r.ot]), csv: rows.map(r => [r.n, r.d, r.p, tot ? Math.round(r.p / tot * 100) : 0, +r.avg.toFixed(2), r.nd, r.ot]),
          extra: (i) => bar(rows[i].p, mx), foot: ['Ukupno', done.length, km(tot), '100 %', km(done.length ? tot / done.length : 0), nd.length, ot.length]}]};
  }
  function rUsluge() {
    const done = D.ap.filter(a => a.status === 'zavrsen'), tot = sum(done, a => a.price), C = {}, S = {};
    done.forEach(a => {
      const c = CAT[a.category] || 'Ostalo'; (C[c] = C[c] || {n: c, k: 0, p: 0}); C[c].k++; C[c].p += +a.price || 0;
      const s = a.service_name || '—'; (S[s] = S[s] || {n: s, c, k: 0, p: 0}); S[s].k++; S[s].p += +a.price || 0;
    });
    const cs = Object.values(C).sort((a, b) => b.p - a.p), ss = Object.values(S).sort((a, b) => b.p - a.p);
    const mc = Math.max(0, ...cs.map(x => x.p)), mss = Math.max(0, ...ss.map(x => x.p));
    return {kpi: [['Promet od usluga', km(tot), pl(done.length, 'urađena usluga', 'urađene usluge', 'urađenih usluga'), 1], ['Različitih usluga', ss.length, ''], ['Najjača kategorija', cs[0] ? cs[0].n : '–', cs[0] ? km(cs[0].p) : '']],
      blocks: [{title: 'Po kategoriji', head: ['Kategorija', 'Puta', 'Promet', 'Udio'], num: [1, 2, 3], rows: cs.map(x => [x.n, x.k, km(x.p), pct(x.p, tot)]), csv: cs.map(x => [x.n, x.k, x.p, tot ? Math.round(x.p / tot * 100) : 0]), extra: i => bar(cs[i].p, mc)},
        {title: 'Po usluzi', head: ['Usluga', 'Kategorija', 'Puta', 'Promet', 'Prosj. cijena'], num: [2, 3, 4], rows: ss.map(x => [x.n, x.c, x.k, km(x.p), km(x.p / x.k)]), csv: ss.map(x => [x.n, x.c, x.k, x.p, +(x.p / x.k).toFixed(2)]), extra: i => bar(ss[i].p, mss)}]};
  }
  function rKlijenti() {
    const done = D.ap.filter(a => a.status === 'zavrsen'), cl = D.cl, byId = Object.fromEntries(cl.map(c => [c.id, c]));
    const nov = cl.filter(c => c.created_at && new Date(c.created_at) >= from && new Date(c.created_at) < to);
    const T = {}; done.forEach(a => { const k = a.client_id || 'n:' + (a.client_name || ''); (T[k] = T[k] || {c: byId[a.client_id], n: a.client_name, k: 0, p: 0}); T[k].k++; T[k].p += +a.price || 0; });
    const top = Object.values(T).sort((a, b) => b.p - a.p).slice(0, 20);
    const given = sum(D.pts.filter(p => p.delta > 0), p => p.delta), used = -sum(D.pts.filter(p => p.delta < 0), p => p.delta);
    const cut = new Date(); cut.setDate(cut.getDate() - 60);
    const away = cl.filter(c => c.last_visit && new Date(c.last_visit) < cut).sort((a, b) => new Date(a.last_visit) - new Date(b.last_visit)).slice(0, 30);
    const miss = cl.filter(c => (c.missed || 0) >= 2).sort((a, b) => b.missed - a.missed).slice(0, 20);
    const ago = d => Math.round((Date.now() - new Date(d)) / 864e5) + ' dana';
    const sem = c => c && c.done_ok != null ? `<span class="sem"><i class="g">${c.done_ok}</i><i class="y">${c.done_moved}</i><i class="r">${c.missed}</i></span>` : '';
    return {kpi: [['Klijenata sa dolaskom', Object.keys(T).length, 'u ovom periodu', 1], ['Novi klijenti', nov.length, 'ukupno u bazi ' + cl.length], ['Bodovi podijeljeni', given, ''], ['Bodovi iskorišteni', used, 'za nagrade'], ['Bodova kod klijenata', sum(cl, c => c.points), 'trenutno stanje']],
      blocks: [{title: 'Top klijenti po potrošnji', head: ['Klijent', 'Dolazaka', 'Potrošeno', 'Bodovi sada'], num: [1, 2, 3],
          rows: top.map(t => [esc(t.c ? t.c.name : t.n || '—') + sem(t.c), t.k, km(t.p), t.c ? t.c.points : '–']), raw: true, csv: top.map(t => [t.c ? t.c.name : t.n || '', t.k, t.p, t.c ? t.c.points : ''])},
        {title: 'Dugo nisu dolazili (više od 60 dana)', head: ['Klijent', 'Telefon', 'Zadnji dolazak', 'Prije', 'Bodovi'], num: [4],
          rows: away.map(c => [esc(c.name) + sem(c), esc(c.phone || ''), dmy(new Date(c.last_visit)), ago(c.last_visit), c.points]), raw: true, csv: away.map(c => [c.name, c.phone || '', dmy(new Date(c.last_visit)), ago(c.last_visit), c.points]), empty: 'Nema takvih klijenata.'},
        {title: 'Česti nedolasci i otkazivanja (2 ili više, ukupno)', head: ['Klijent', 'Telefon', 'Nije došla / otkazano', 'Završeno'], num: [2, 3],
          rows: miss.map(c => [esc(c.name) + sem(c), esc(c.phone || ''), c.missed, (c.done_ok || 0) + (c.done_moved || 0)]), raw: true, csv: miss.map(c => [c.name, c.phone || '', c.missed, (c.done_ok || 0) + (c.done_moved || 0)]), empty: 'Nema klijenata sa 2 ili više nedolazaka.'},
        {title: 'Novi klijenti', head: ['Klijent', 'Telefon', 'Upisan'], rows: nov.map(c => [esc(c.name), esc(c.phone || ''), dmy(new Date(c.created_at))]), raw: true, csv: nov.map(c => [c.name, c.phone || '', dmy(new Date(c.created_at))]), empty: 'Nema novih klijenata u ovom periodu.'}]};
  }
  function rShop() {
    const O = D.ord.filter(o => o.status !== 'otkazana'), tot = sum(O, o => o.total), dl = sum(O, o => o.delivery_price), P = {};
    O.forEach(o => (Array.isArray(o.items) ? o.items : []).forEach(it => { const k = it.product + (it.variant ? ' · ' + it.variant : ''); (P[k] = P[k] || {n: k, q: 0, p: 0, src: 'web'}); P[k].q += +it.qty || 0; P[k].p += +it.line_total || 0; }));
    const X = {}; D.ap.filter(a => a.status === 'zavrsen').forEach(a => artOf(a).forEach(x => { (X[x.name] = X[x.name] || {n: x.name, q: 0, p: 0}); X[x.name].q += +x.qty || 0; X[x.name].p += (+x.price || 0) * (+x.qty || 0); }));
    const ps = Object.values(P).sort((a, b) => b.p - a.p), xs = Object.values(X).sort((a, b) => b.p - a.p), mp = Math.max(0, ...ps.map(x => x.p));
    const stc = ['nova', 'potvrđena', 'poslana', 'završena', 'otkazana'].map(s => [s, D.ord.filter(o => o.status === s).length]).filter(x => x[1]);
    return {kpi: [['Promet shopa', km(tot), pl(O.length, 'narudžba', 'narudžbe', 'narudžbi') + ' (bez otkazanih)', 1], ['Prosječna narudžba', km(O.length ? tot / O.length : 0), ''], ['Od toga dostava', km(dl), ''], ['Artikli uz termine', km(sum(xs, x => x.p)), 'prodano u salonu'], ['Otkazane narudžbe', D.ord.length - O.length, '']],
      blocks: [chart('Promet shopa', O, o => +o.total || 0, km),
        {title: 'Najprodavaniji proizvodi (webshop)', head: ['Proizvod', 'Komada', 'Promet'], num: [1, 2], rows: ps.map(x => [x.n, x.q, km(x.p)]), csv: ps.map(x => [x.n, x.q, x.p]), extra: i => bar(ps[i].p, mp), empty: 'Nema narudžbi u ovom periodu.'},
        {title: 'Artikli prodani uz termine', head: ['Artikal', 'Komada', 'Iznos'], num: [1, 2], rows: xs.map(x => [x.n, x.q, km(x.p)]), csv: xs.map(x => [x.n, x.q, x.p]), empty: 'Nema artikala prodanih uz termine.'},
        {title: 'Narudžbe po statusu', head: ['Status', 'Broj'], num: [1], rows: stc, csv: stc, empty: 'Nema narudžbi.'}]};
  }
  const RF = {promet: rPromet, usluge: rUsluge, klijenti: rKlijenti, shop: rShop};

  function draw() {
    if (!D) return;
    cur = RF[rep]();
    const name = REP.find(r => r[0] === rep)[1];
    $('#rpOut').innerHTML = `<div class="rphead"><b>LAX Studio — ${esc(name)}</b><span>${esc(label)}</span></div>
      <div class="prom rpk">${cur.kpi.map(k => `<div class="pm${k[3] ? ' main' : ''}"><small>${esc(k[0])}</small><b>${esc(String(k[1]))}</b><i>${esc(k[2])}</i></div>`).join('')}</div>` +
      cur.blocks.map(b => b.html ? `<div class="rpblk"><h3>${esc(b.title)}</h3>${b.html}</div>` : `<div class="rpblk"><h3>${esc(b.title)}</h3>${!b.rows.length ? `<div class="card" style="color:var(--muted)">${esc(b.empty || 'Nema podataka za ovaj period.')}</div>` :
        `<table class="cktbl"><thead><tr>${b.head.map((h, j) => `<th class="${(b.num || []).includes(j) ? 'r' : ''}">${esc(h)}</th>`).join('')}${b.extra ? '<th class="bc"></th>' : ''}</tr></thead><tbody>${b.rows.map((r, i) => `<tr>${r.map((c, j) => `<td class="${(b.num || []).includes(j) ? 'r' : ''}">${b.raw ? c : esc(String(c))}</td>`).join('')}${b.extra ? `<td class="bc">${b.extra(i)}</td>` : ''}</tr>`).join('')}</tbody>${b.foot ? `<tfoot><tr>${b.foot.map((c, j) => `<td class="${(b.num || []).includes(j) ? 'r' : ''}">${esc(String(c))}</td>`).join('')}${b.extra ? '<td></td>' : ''}</tr></tfoot>` : ''}</table>`}</div>`).join('') +
      `<p class="hint rpnote">Promet se računa od termina sa statusom Završen; cijena termina uključuje i dodane artikle. Shop: sve narudžbe osim otkazanih.</p>`;
  }

  // ---------- CSV (Excel): ; kao separator, decimalni zarez ----------
  $('#rpCsv').onclick = () => {
    if (!cur) return;
    const name = REP.find(r => r[0] === rep)[1], q = v => { if (typeof v === 'number') return String(+v.toFixed(2)).replace('.', ','); v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const L = [['LAX Studio — ' + name], [label], [], ...cur.kpi.map(k => [k[0], k[1], k[2]])];
    cur.blocks.forEach(b => { const c = b.csv && b.csv.head ? b.csv : {head: b.head, rows: b.csv || b.rows}; L.push([], [b.title], c.head, ...c.rows); });
    const txt = '﻿' + L.map(r => r.map(q).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], {type: 'text/csv;charset=utf-8'}));
    a.download = 'LAX-izvjestaj-' + rep + '-' + ymd(from) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    toast('Izvještaj preuzet');
  };
  $('#rpPrint').onclick = () => { document.body.classList.add('rpprint'); setTimeout(() => { window.print(); document.body.classList.remove('rpprint'); }, 50); };

  $('#rpTabs').onclick = e => { const b = e.target.closest('[data-rp]'); if (!b) return; rep = b.dataset.rp; $('#rpTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  $('#rpPer').onchange = load; $('#rpFrom').onchange = load; $('#rpTo').onchange = load;
  document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t === 'reports') load(); });
})();
