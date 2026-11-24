/* LAX admin — plan termina, klijenti, bodovi, radnice */
(function () {
  const HOURS = {1: [12, 19], 2: [12, 19], 3: [12, 19], 4: [9, 16], 5: [9, 16], 6: [9, 15]};
  const DN = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
  const MN = ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'];
  const SCN = {kosa: 'Nadogradnja kose', nokti: 'Nokti', trepavice: 'Trepavice i obrve', trajna: 'Trajna šminka', lice: 'Tretmani lica', tijelo: 'Tretmani tijela', sminkanje: 'Šminkanje', edukacije: 'Edukacije'};
  const STN = {zakazan: 'Zakazan', zavrsen: 'Završen', otkazan: 'Otkazan', nije_dosla: 'Nije došla'};
  const RH = 48; // px za 30 min
  const pad = n => String(n).padStart(2, '0');
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const dkey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const ddmm = d => d.getDate() + '.' + (d.getMonth() + 1) + '.';
  const intl = p => { const t = String(p || '').replace(/[^\d+]/g, ''); return t.startsWith('+') ? t.slice(1) : t.startsWith('00') ? t.slice(2) : t.startsWith('0') ? '387' + t.slice(1) : t; };
  const cardUrl = c => location.origin + '/bodovi?k=' + c.token; // bez # jer ga Viber odsiječe
  const welcomeMsg = c => `Ćao ${first(c.name)}! 💛 Dobrodošli u LAX program vjernosti. Svoje bodove i nagrade možeš pratiti ovdje: ${cardUrl(c)}`;
  const sendLinks = (phone, msg) => { const n = intl(phone), t = encodeURIComponent(msg); return {v: 'viber://chat?number=%2B' + n + '&draft=' + t, w: 'https://wa.me/' + n + '?text=' + t, s: 'sms:+' + n + '?&body=' + t}; };
  // prozor "pošalji poruku" (bodovi / dobrodošlica)
  document.body.insertAdjacentHTML('beforeend', `<div class="md hide" id="snd"><div class="mdb" style="max-width:480px">
    <div class="mdh"><h3 id="sndT"></h3><button class="x" id="sndX">×</button></div>
    <div id="sndMsg" style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin-bottom:14px"></div>
    <div class="rmd" style="order:0">Pošalji: <a class="btn" id="sndV" target="_blank">Viber</a><a class="btn" id="sndW" target="_blank" rel="noopener">WhatsApp</a><a class="btn" id="sndS">SMS</a></div>
    <div class="mact"><small id="sndHint" style="flex:1;color:var(--muted);font-size:12.5px"></small><button class="btn btn-gold" id="sndOk">Gotovo</button></div></div></div>`);
  let sndLocked = false;
  const closeSnd = () => { if (sndLocked) return; $('#snd').classList.add('hide'); };
  $('#sndX').onclick = closeSnd; $('#sndOk').onclick = closeSnd;
  $('#snd').addEventListener('click', e => { if (e.target.id === 'snd') closeSnd(); });
  ['#sndV', '#sndW', '#sndS'].forEach(id => $(id).addEventListener('click', () => {
    sndLocked = false; $('#sndOk').disabled = false; $('#sndX').classList.remove('hide'); $('#sndHint').textContent = '';
  }));
  // required = prozor se ne može zatvoriti dok se ne klikne Viber, WhatsApp ili SMS
  function offerSend(title, c, msg, required) {
    if (!c || !c.phone) return;
    const L = sendLinks(c.phone, msg);
    $('#sndT').textContent = title; $('#sndMsg').textContent = msg;
    $('#sndV').href = L.v; $('#sndW').href = L.w; $('#sndS').href = L.s;
    sndLocked = !!required; $('#sndOk').disabled = sndLocked; $('#sndX').classList.toggle('hide', sndLocked);
    $('#sndHint').textContent = sndLocked ? 'Pošalji poruku da bi zatvorio prozor.' : '';
    $('#snd').classList.remove('hide');
  }
  const first = n => String(n || '').split(' ')[0];
  // semafor klijenta: zeleno = završeni, žuto = završeni s pomjeranjem, crveno = otkazani / nije došla
  const sem = c => c && c.done_ok != null ? `<span class="sem" title="Završeni · s pomjeranjem · otkazani/nije došla"><i class="g">${c.done_ok}</i><i class="y">${c.done_moved}</i><i class="r">${c.missed}</i></span>` : '';
  const dmy = v => { const d = new Date(v); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + '.'; };

  let WHO = {admin: false, staff: null}, READY = false;
  let staff = [], services = [], clients = [], rewards = [], appts = [], shopItems = [];
  let weekStart = monday(new Date()), day = todayIdx(), DAYH0 = 9;

  function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; }
  function todayIdx() { const w = new Date().getDay(); return w === 0 ? 1 : w; } // 1..6
  function dayDate(i) { const d = new Date(weekStart); d.setDate(d.getDate() + i - 1); return d; }

  // ---------- init (poziva boot) ----------
  let INITED = false;
  window.laxStaffInit = async function (who) {
    if (INITED) return; INITED = true;
    WHO = who;
    if (!who.admin) {
      document.querySelectorAll('#tabs .adm').forEach(b => b.classList.add('hide'));
      $('#pub') && $('#pub').classList.add('hide');
      selectTab('appts');
    } else {
      document.querySelectorAll('#tabs .adm').forEach(b => b.classList.remove('hide'));
    }
    $('#who').textContent = who.staff ? who.staff.name : $('#who').textContent;
    await reloadBase();
    READY = true;
    loadWeek();
    if (who.admin) loadStaffAdmin();
  };
  function selectTab(t) { const b = document.querySelector(`#tabs button[data-t="${t}"]`); b && b.click(); }

  async function reloadBase() {
    const r = await Promise.all([
      sb.from('lax_staff').select('*').order('sort').order('created_at'),
      sb.from('lax_services').select('id,category,name,duration_min,price,needs_cabin,active,sort').order('sort'),
      sb.from('lax_client_balance').select('*').order('name'),
      sb.from('lax_rewards').select('*').order('points')
    ]);
    if (r[0].error) { $('#apGrid').innerHTML = '<div class="card">Plan termina još nije podešen: pokreni <b>sql/termini.sql</b> u Supabase. (' + esc(r[0].error.message) + ')</div>'; return; }
    staff = r[0].data || []; services = r[1].data || []; clients = r[2].data || []; rewards = r[3].data || [];
    drawClientDL(); drawClients();
    // artikli iz web shopa koji se mogu prodati uz termin
    const pr = await sb.from('lax_products').select('id,name,active,lax_variants(id,price,length_cm,color,label,active)').eq('active', true).order('sort');
    shopItems = [];
    (pr.data || []).forEach(p => (p.lax_variants || []).filter(v => v.active !== false).forEach(v => {
      const det = [v.length_cm ? v.length_cm + ' cm' : '', v.color, v.label].filter(Boolean).join(' · ');
      shopItems.push({id: v.id, name: p.name + (det ? ' · ' + det : ''), price: +v.price || 0});
    }));
  }
  async function reloadClients() { const r = await sb.from('lax_client_balance').select('*').order('name'); if (!r.error) { clients = r.data; drawClientDL(); drawClients(); } }

  // =========================================================
  // PLAN TERMINA
  // =========================================================
  async function loadWeek() {
    if (!staff.length) return;
    const we = new Date(weekStart); we.setDate(we.getDate() + 7);
    const {data, error} = await sb.from('lax_appointments').select('*').gte('starts_at', weekStart.toISOString()).lt('starts_at', we.toISOString()).order('starts_at');
    if (error) return toast('Greška: ' + error.message);
    appts = (data || []).map(a => ({...a, s: new Date(a.starts_at), e: new Date(a.ends_at)}));
    drawWeek(); loadReminders();
  }
  const live = a => a.status === 'zakazan' || a.status === 'zavrsen';
  function drawWeek() {
    const e = new Date(weekStart); e.setDate(e.getDate() + 5);
    $('#apWeek').textContent = weekStart.getDate() + '. ' + (weekStart.getMonth() !== e.getMonth() ? MN[weekStart.getMonth()] + ' ' : '') + '– ' + e.getDate() + '. ' + MN[e.getMonth()] + ' ' + e.getFullYear();
    const tk = dkey(new Date());
    $('#apDays').innerHTML = [1, 2, 3, 4, 5, 6].map(i => {
      const d = dayDate(i), n = appts.filter(a => dkey(a.s) === dkey(d) && a.status !== 'otkazan').length;
      return `<button data-d="${i}" class="${i === day ? 'on' : ''} ${dkey(d) === tk ? 'today' : ''}"><b>${DN[d.getDay()]}</b> ${ddmm(d)}${n ? `<i>${n}</i>` : ''}</button>`;
    }).join('');
    drawDay();
  }
  function drawDay() {
    const d = dayDate(day), st = staff.filter(s => s.active), list = appts.filter(a => dkey(a.s) === dkey(d));
    // radno vrijeme dana, prošireno ako neki termin ispada van njega
    let [h0, h1] = HOURS[d.getDay()] || [9, 19];
    list.forEach(a => { h0 = Math.min(h0, a.s.getHours()); h1 = Math.max(h1, a.e.getHours() + (a.e.getMinutes() ? 1 : 0) + (dkey(a.e) !== dkey(d) ? 24 : 0)); });
    h1 = Math.min(h1, 24); const rows = (h1 - h0) * 2;
    DAYH0 = h0;
    // termini koji se preklapaju kod iste radnice idu jedan pored drugog
    const lane = {};
    st.forEach(s => {
      const L = list.filter(a => a.staff_id === s.id).sort((x, y) => x.s - y.s);
      let grp = [], ends = [], gEnd = 0;
      const flush = () => { grp.forEach(a => lane[a.id].n = ends.length); grp = []; ends = []; };
      L.forEach(a => {
        if (grp.length && a.s >= gEnd) flush();
        let k = ends.findIndex(e => e <= a.s); if (k < 0) { k = ends.length; ends.push(0); }
        ends[k] = a.e; lane[a.id] = {k}; grp.push(a); gEnd = Math.max(gEnd, +a.e);
      });
      flush();
    });
    const top = t => ((t.getHours() - h0) * 60 + t.getMinutes()) / 30 * RH;
    let html = `<div class="apg" style="--n:${st.length};--rows:${rows}">
      <div class="aph"></div>${st.map(s => `<div class="aph"><span class="av">${esc(s.name[0] || '?')}</span>${esc(s.name)}<small>· ${list.filter(a => a.staff_id === s.id && a.status !== 'otkazan').length}</small></div>`).join('')}<div class="aph cabh">Kabine</div>
      <div class="aptimes">${Array.from({length: rows}, (_, i) => `<span style="top:${i * RH}px">${i % 2 ? '' : pad(h0 + i / 2) + ':00'}</span>`).join('')}</div>`;
    st.forEach(s => {
      html += `<div class="apcol" data-staff="${s.id}" style="height:${rows * RH}px">` +
        Array.from({length: rows}, (_, i) => `<div class="apline ${i % 2 ? 'half' : ''}" style="top:${i * RH}px"></div>`).join('') +
        list.filter(a => a.staff_id === s.id).map(a => {
          const t = Math.max(0, top(a.s)), h = Math.max(22, top(a.e) - t), c = clients.find(x => x.id === a.client_id);
          const ln = lane[a.id] || {k: 0, n: 1}, w = 100 / ln.n;
          return `<div class="ap ${a.status}" data-ap="${a.id}" style="top:${t + 2}px;height:${h - 4}px${ln.n > 1 ? `;left:calc(${ln.k * w}% + 3px);right:auto;width:calc(${w}% - 6px)` : ''}">
            <div class="t">${hm(a.s)} – ${hm(a.e)}${a.price != null && a.price !== '' ? ` · <b class="apr">${km(a.price)}</b>` : ''}</div>
            <div class="k"><b>${esc(c ? c.name : a.client_name || '')}</b>${sem(c)}${c ? ` <span class="pts">♥ ${c.points}</span>` : ''}</div>
            <div class="u">${esc(a.service_name)}</div>
            <div class="tags" ${h < 80 ? 'style="top:6px;bottom:auto"' : ''}>${a.needs_cabin ? '<span class="cab">KABINA</span>' : ''}${Array.isArray(a.extras) && a.extras.length ? '<span class="xt">+ DODATAK</span>' : ''}<span class="sts">${STN[a.status]}</span></div></div>`;
        }).join('') + '</div>';
    });
    html += `<div class="apcab" style="height:${rows * RH}px">` + Array.from({length: rows}, (_, i) => {
      const s = new Date(d); s.setHours(h0, i * 30, 0, 0); const e = new Date(s.getTime() + 30 * 60000);
      const n = cabinMax(s, e, null);
      return `<div class="cs c${Math.min(n, 2)}" style="top:${i * RH + 2}px;height:${RH - 4}px">${n}/2</div>`;
    }).join('') + '</div></div>';
    if (!st.length) html = '<div class="card">Nema aktivnih radnica. Dodaj ih u kartici Radnice.</div>';
    $('#apGrid').innerHTML = html;
  }
  // najveći broj istovremenih kabinskih termina u [s,e)
  function cabinMax(s, e, excl) {
    const L = appts.filter(a => a.needs_cabin && live(a) && a.id !== excl && a.s < e && a.e > s);
    const pts = [s, ...L.map(a => a.s).filter(t => t > s && t < e)];
    return Math.max(0, ...pts.map(t => L.filter(a => a.s <= t && a.e > t).length));
  }
  function staffBusy(staffId, s, e, excl) { return appts.some(a => a.staff_id === staffId && live(a) && a.id !== excl && a.s < e && a.e > s); }
  function nextFree(staffId, s, mins, cab, excl) {
    const d = new Date(s), hh = HOURS[d.getDay()]; if (!hh) return null;
    const end = new Date(d); end.setHours(hh[1], 0, 0, 0); const open = new Date(d); open.setHours(hh[0], 0, 0, 0);
    for (let t = new Date(Math.max(s.getTime() + 15 * 60000, open.getTime())); t.getTime() + mins * 60000 <= end.getTime(); t = new Date(t.getTime() + 15 * 60000)) {
      const e = new Date(t.getTime() + mins * 60000);
      if (!staffBusy(staffId, t, e, excl) && (!cab || cabinMax(t, e, excl) < 2)) return t;
    }
    return null;
  }

  $('#apPrev').onclick = () => { weekStart.setDate(weekStart.getDate() - 7); loadWeek(); };
  $('#apNext').onclick = () => { weekStart.setDate(weekStart.getDate() + 7); loadWeek(); };
  $('#apToday').onclick = () => { weekStart = monday(new Date()); day = todayIdx(); loadWeek(); };
  $('#apDays').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; day = +b.dataset.d; drawWeek(); };
  $('#apNew').onclick = () => { const d = dayDate(day), [h0] = HOURS[d.getDay()] || [9]; d.setHours(h0, 0, 0, 0); openAp(null, {start: d, staff: (WHO.staff || staff[0] || {}).id}); };
  $('#apGrid').addEventListener('click', e => {
    const a = e.target.closest('[data-ap]');
    if (a) return openAp(appts.find(x => x.id === a.dataset.ap));
    const col = e.target.closest('[data-staff]'); if (!col) return;
    const d = dayDate(day), h0 = DAYH0;
    const y = e.clientY - col.getBoundingClientRect().top, m = Math.floor(y / RH * 30 / 15) * 15;
    d.setHours(h0, 0, 0, 0); d.setMinutes(m);
    openAp(null, {start: d, staff: col.dataset.staff});
  });

  // ---------- prozor termina ----------
  let cur = null, pendingWelcome = null;
  function svcOptions(sel) {
    const g = {}; services.filter(s => s.active || s.id === sel).forEach(s => (g[s.category] = g[s.category] || []).push(s));
    const cur0 = cur && !sel && cur.service_name ? `<option value="" selected>${esc(cur.service_name)}</option>` : '<option value="">— izaberi uslugu —</option>';
    return cur0 + Object.keys(SCN).filter(k => g[k]).map(k => `<optgroup label="${esc(SCN[k])}">` +
      g[k].map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}${s.needs_cabin ? ' · kabina' : ''}</option>`).join('') + '</optgroup>').join('');
  }
  function openAp(a, pre) {
    cur = a || {id: null, staff_id: pre.staff, s: pre.start, e: new Date(pre.start.getTime() + 60 * 60000), status: 'zakazan'};
    const c = clients.find(x => x.id === cur.client_id);
    $('#apmT').textContent = a ? 'Termin' : 'Novi termin';
    $('#apmClient').value = c ? c.name + (c.phone ? ' · ' + c.phone : '') : (cur.client_name || '');
    $('#apmSvc').innerHTML = svcOptions(cur.service_id);
    $('#apmStaff').innerHTML = staff.filter(s => s.active || s.id === cur.staff_id).map(s => `<option value="${s.id}" ${s.id === cur.staff_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    $('#apmDate').value = dkey(cur.s); $('#apmTime').value = hm(cur.s);
    $('#apmMin').value = Math.round((cur.e - cur.s) / 60000);
    $('#apmPrice').value = cur.price ?? '';
    $('#apmNote').value = cur.note || '';
    xItems = Array.isArray(cur.extras) ? cur.extras.filter(x => x.variant_id).map(x => ({...x})) : [];
    $('#apmXOther').checked = !!(Array.isArray(cur.extras) && cur.extras.some(x => x.other));
    xOtherBase = $('#apmXOther').checked ? +$('#apmPrice').value : null;
    $('#apmXSel').innerHTML = '<option value="">— artikl iz shopa —</option>' + shopItems.map(i => `<option value="${i.id}">${esc(i.name)} · ${km(i.price)}</option>`).join('');
    $('#apmXQty').value = 1; drawX(); durHint();
    $('#apmWarn').classList.add('hide');
    $('#apmStatus').classList.toggle('hide', !a);
    $('#apmDel').classList.toggle('hide', !a);
    $('#apmSt').textContent = a ? STN[a.status] : ''; $('#apmSt').className = 'stb ' + (a ? a.status : '');
    $('#apmStatus').querySelectorAll('[data-st]').forEach(b => b.classList.toggle('hide', a && b.dataset.st === a.status));
    clientInfo(); remindLink();
    $('#apm').classList.remove('hide');
  }
  const closeAp = () => $('#apm').classList.add('hide');
  $('#apmX').onclick = closeAp; $('#apmCancel').onclick = closeAp;
  $('#apm').addEventListener('click', e => { if (e.target.id === 'apm') closeAp(); });
  function findClient(v) { v = (v || '').trim().toLowerCase(); return clients.find(c => (c.name + (c.phone ? ' · ' + c.phone : '')).toLowerCase() === v) || clients.find(c => c.name.toLowerCase() === v); }
  function clientInfo() {
    const v = $('#apmClient').value.trim(), c = findClient(v);
    $('#apmNewC').classList.toggle('hide', !v || !!c);
    if (c) {
      const can = rewards.filter(r => r.active && r.points <= c.points).pop();
      $('#apmPts').innerHTML = sem(c) + ` ♥ ${c.points} bodova` + (can ? ` — može iskoristiti: ${esc(can.name)}` : '');
    } else $('#apmPts').textContent = v ? 'Novi klijent — upiši telefon ispod.' : '';
  }
  const reminderMsg = (a, c) => `Ćao ${first(c.name)}! Podsjećamo te na termin u LAX Studiju ${DN[a.s.getDay()].toLowerCase()} ${ddmm(a.s)} u ${hm(a.s)} (${a.service_name}). Vidimo se! 💛` +
    (c.token ? `\n\nTvoji bodovi (${c.points}): ${cardUrl(c)}` : '');
  function remindLink() {
    const c = clients.find(x => x.id === cur.client_id), b = $('#apmRemind');
    if (!cur.id || !c || !c.phone || cur.status !== 'zakazan') return b.classList.add('hide');
    const msg = reminderMsg(cur, c);
    const L = sendLinks(c.phone, msg);
    $('#apmRV').href = L.v; $('#apmRW').href = L.w; $('#apmRS').href = L.s;
    b.classList.remove('hide');
  }
  $('#apmClient').addEventListener('input', clientInfo);
  // padajuća lista klijenata sa semaforom
  let sugI = -1, sugL = [];
  const sugBox = $('#apmSug');
  function drawSug() {
    const q = $('#apmClient').value.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    if (findClient(q)) { sugBox.classList.add('hide'); return; }
    sugL = clients.filter(c => !q || c.name.toLowerCase().includes(q) || (qd.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(qd))).slice(0, 8);
    sugI = -1;
    if (!sugL.length) { sugBox.innerHTML = q ? '<div class="nw">Nema u bazi — biće dodan kao novi klijent</div>' : ''; sugBox.classList.toggle('hide', !q); return; }
    sugBox.innerHTML = sugL.map((c, i) => `<div data-i="${i}"><b>${esc(c.name)}</b>${sem(c)}<small>${esc(c.phone || '')} · ♥ ${c.points}</small></div>`).join('');
    sugBox.classList.remove('hide');
  }
  function pickSug(i) {
    const c = sugL[i]; if (!c) return;
    $('#apmClient').value = c.name + (c.phone ? ' · ' + c.phone : '');
    sugBox.classList.add('hide'); clientInfo();
  }
  $('#apmClient').addEventListener('input', drawSug);
  $('#apmClient').addEventListener('focus', drawSug);
  $('#apmClient').addEventListener('blur', () => setTimeout(() => sugBox.classList.add('hide'), 150));
  $('#apmClient').addEventListener('keydown', e => {
    if (sugBox.classList.contains('hide') || !sugL.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugI = (sugI + (e.key === 'ArrowDown' ? 1 : -1) + sugL.length) % sugL.length;
      [...sugBox.children].forEach((d, k) => d.classList.toggle('on', k === sugI)); }
    else if (e.key === 'Enter' && sugI >= 0) { e.preventDefault(); pickSug(sugI); }
    else if (e.key === 'Escape') sugBox.classList.add('hide');
  });
  sugBox.addEventListener('mousedown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pickSug(+d.dataset.i); } });
  $('#apmSvc').onchange = () => {
    const s = services.find(x => x.id === $('#apmSvc').value); if (!s) return;
    $('#apmMin').value = s.duration_min || 60; durHint();
    $('#apmPrice').value = (+s.price || 0) + xSum(); xOtherBase = $('#apmXOther').checked ? +$('#apmPrice').value : null; checkX();
  };
  // trajanje iz cjenovnika
  function durHint() {
    const s = services.find(x => x.id === $('#apmSvc').value);
    $('#apmDurHint').textContent = s && !s.duration_min ? 'Trajanje ove usluge nije upisano u Cjenovniku — uzeto je 60 min. Upiši ga u Cjenovnik (polje Min).' : '';
  }
  // ---------- dodaci uz uslugu ----------
  let xItems = [], xOtherBase = null;
  const xSum = () => xItems.reduce((t, x) => t + x.price * x.qty, 0);
  function drawX() {
    $('#apmXList').innerHTML = xItems.map((x, i) => `<div class="xi"><span>${esc(x.name)} × ${x.qty}</span><b>${km(x.price * x.qty)}</b><button type="button" data-xr="${i}" title="Ukloni">×</button></div>`).join('');
    checkX();
  }
  function setPriceDelta(d) { const p = (+$('#apmPrice').value || 0) + d; $('#apmPrice').value = Math.round(p * 100) / 100; if (xOtherBase != null) xOtherBase += d; }
  $('#apmXAdd').onclick = () => {
    const it = shopItems.find(i => i.id === $('#apmXSel').value); if (!it) return toast('Izaberi artikl');
    const q = Math.max(1, parseInt($('#apmXQty').value) || 1);
    const ex = xItems.find(x => x.variant_id === it.id);
    if (ex) ex.qty += q; else xItems.push({variant_id: it.id, name: it.name, price: it.price, qty: q});
    setPriceDelta(it.price * q); $('#apmXSel').value = ''; $('#apmXQty').value = 1; drawX();
  };
  $('#apmXList').addEventListener('click', e => { const b = e.target.closest('[data-xr]'); if (!b) return; const x = xItems.splice(+b.dataset.xr, 1)[0]; setPriceDelta(-x.price * x.qty); drawX(); });
  $('#apmXOther').onchange = () => { xOtherBase = $('#apmXOther').checked ? +$('#apmPrice').value || 0 : null; checkX(); };
  // ako je dodano nešto van shopa: cijena mora biti promijenjena i napomena upisana
  function checkX() {
    let msg = '';
    if ($('#apmXOther').checked) {
      const changed = (+$('#apmPrice').value || 0) !== xOtherBase, note = $('#apmNote').value.trim().length > 2;
      if (!changed && !note) msg = 'Promijeni cijenu i u napomenu upiši šta je dodano.';
      else if (!changed) msg = 'Promijeni cijenu (dodaj iznos za ono što je dodano).';
      else if (!note) msg = 'U napomenu upiši šta je dodano.';
    }
    $('#apmXHint').textContent = msg; $('#apmSave').disabled = !!msg;
    $('#apmStatus').querySelectorAll('[data-st="zavrsen"]').forEach(b => b.disabled = !!msg);
  }
  $('#apmPrice').addEventListener('input', checkX); $('#apmNote').addEventListener('input', checkX);
  function formStart() { const [y, mo, d] = $('#apmDate').value.split('-').map(Number), [h, mi] = $('#apmTime').value.split(':').map(Number); return new Date(y, mo - 1, d, h, mi); }

  $('#apmSave').onclick = () => saveAp();
  async function saveAp(startOverride) {
    const btn = $('#apmSave'); btn.disabled = true;
    try {
      let c = findClient($('#apmClient').value);
      const nm = $('#apmClient').value.trim();
      if (!c && nm) {
        const ph = $('#apmPhone').value.trim();
        const r = await sb.from('lax_clients').insert({name: nm.split(' · ')[0], phone: ph || null, consent: $('#apmConsent').checked}).select().single();
        if (r.error) throw r.error;
        await reloadClients(); c = clients.find(x => x.id === r.data.id); pendingWelcome = c && c.id;
      }
      const start = startOverride || formStart(), mins = +$('#apmMin').value, svc = $('#apmSvc').value || null;
      const hh = HOURS[start.getDay()], endT = new Date(start.getTime() + mins * 60000);
      if (!hh) throw new Error('Nedjeljom salon ne radi');
      if (start.getHours() < hh[0] || endT.getHours() * 60 + endT.getMinutes() > hh[1] * 60 || dkey(endT) !== dkey(start))
        throw new Error(`Termin mora biti u radnom vremenu (${pad(hh[0])}:00 – ${pad(hh[1])}:00)`);
      if (!svc && !cur.service_name) throw new Error('Izaberi uslugu');
      const pr = $('#apmPrice').value === '' ? null : +$('#apmPrice').value;
      const {data, error} = await sb.rpc('lax_save_appointment', {p_id: cur.id, p_client: c ? c.id : null, p_staff: $('#apmStaff').value, p_service: svc,
        p_service_name: svc ? null : cur.service_name, p_starts: start.toISOString(), p_minutes: mins, p_price: pr, p_note: $('#apmNote').value});
      if (error) {
        const s = services.find(x => x.id === svc), cab = s ? s.needs_cabin : cur.needs_cabin;
        const nf = nextFree($('#apmStaff').value, start, mins, cab, cur.id);
        $('#apmWarn').innerHTML = `<b>${esc(error.message.replace(/^KABINE: /, ''))}</b>` + (nf ? `Prvo slobodno: <button class="lnk" id="apmNF">Zakaži u ${hm(nf)}</button>` : 'Tog dana nema slobodnog termina za ovu uslugu.');
        $('#apmWarn').classList.remove('hide');
        if (nf) $('#apmNF').onclick = () => { $('#apmTime').value = hm(nf); saveAp(nf); };
        return;
      }
      const extras = xItems.map(x => ({variant_id: x.variant_id, name: x.name, price: x.price, qty: x.qty})).concat($('#apmXOther').checked ? [{other: true, note: $('#apmNote').value.trim()}] : []);
      const xu = await sb.from('lax_appointments').update({extras}).eq('id', data);
      if (xu.error && (extras.length || (cur.extras && cur.extras.length))) toast('Termin sačuvan, ali dodaci nisu (pokreni sql/dodaci.sql)');
      else toast(cur.id ? 'Termin izmijenjen' : 'Termin zakazan');
      closeAp(); loadWeek();
      if (pendingWelcome && c && c.id === pendingWelcome) { pendingWelcome = null; offerSend('Novi klijent — pošalji link dobrodošlice', c, welcomeMsg(c), true); }
    } catch (err) { $('#apmWarn').innerHTML = '<b>' + esc(err.message || err) + '</b>'; $('#apmWarn').classList.remove('hide'); }
    finally { btn.disabled = false; }
  }
  $('#apmStatus').addEventListener('click', async e => {
    const b = e.target.closest('[data-st]'); if (!b || !cur.id) return;
    const pr = $('#apmPrice').value === '' ? null : +$('#apmPrice').value;
    const extras = xItems.map(x => ({variant_id: x.variant_id, name: x.name, price: x.price, qty: x.qty})).concat($('#apmXOther').checked ? [{other: true, note: $('#apmNote').value.trim()}] : []);
    await sb.from('lax_appointments').update({extras, note: $('#apmNote').value.trim() || null}).eq('id', cur.id);
    const {data, error} = await sb.rpc('lax_set_status', {p_id: cur.id, p_status: b.dataset.st, p_price: pr});
    if (error) return toast('Greška: ' + error.message);
    toast(b.dataset.st === 'zavrsen' ? (data.points ? `Završeno · +${data.points} bodova${data.double ? ' (dopuna ×2)' : ''}` : 'Završeno') : 'Status: ' + STN[b.dataset.st]);
    const done = cur; closeAp(); await reloadClients(); loadWeek();
    const c = clients.find(x => x.id === done.client_id);
    if (b.dataset.st === 'zavrsen' && data.points > 0 && c && c.phone)
      offerSend('Pošalji bodove klijentu', c, `Hvala ${first(c.name)}! 💛 Za današnji tretman dobijaš +${data.points} bodova${data.double ? ' (dopuna na vrijeme ×2)' : ''}. Sada imaš ${c.points} bodova.\n\nSvoje bodove i nagrade vidiš ovdje: ${cardUrl(c)}`, true);
  });
  $('#apmDel').onclick = async () => {
    if (!cur.id) return;
    if (!await askConfirm('Obrisati termin?', 'Termin se trajno briše iz plana, zajedno s bodovima koje je donio. Ako klijent samo nije došao ili je otkazala, radije promijeni status.')) return;
    const {error} = await sb.from('lax_appointments').delete().eq('id', cur.id);
    if (error) return toast('Greška: ' + error.message);
    await sb.from('lax_points').delete().eq('appointment_id', cur.id);
    toast('Termin obrisan'); closeAp(); await reloadClients(); loadWeek();
  };

  // =========================================================
  // KLIJENTICE
  // =========================================================
  function drawClientDL() { if ($('#clDL')) $('#clDL').innerHTML = clients.map(c => `<option value="${esc(c.name + (c.phone ? ' · ' + c.phone : ''))}">`).join(''); }
  function drawClients() {
    if (!$('#clList')) return;
    const q = ($('#clQ').value || '').trim().toLowerCase(), L = clients.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
    $('#clList').innerHTML = L.length ? `<div class="clh"><span>Ime</span><span>Telefon</span><span>Bodovi</span><span>Zadnja posjeta</span><span></span></div>` + L.map(c => `<div class="card clrow" data-cl="${c.id}">
      <b>${esc(c.name)}${sem(c)}</b><span>${esc(c.phone || '—')}</span><span class="pts">♥ ${c.points}</span><span>${c.last_visit ? dmy(c.last_visit) : '—'}</span><button class="btn">Otvori</button></div>`).join('')
      : '<div class="card" style="text-align:center;color:var(--muted)">' + (clients.length ? 'Nema rezultata.' : 'Još nema klijenata. Dodaju se ovdje ili automatski pri zakazivanju termina.') + '</div>';
  }
  $('#clQ').addEventListener('input', drawClients);
  $('#clList').addEventListener('click', e => { const r = e.target.closest('[data-cl]'); if (r) openCl(clients.find(c => c.id === r.dataset.cl)); });
  $('#clNew').onclick = () => openCl(null);

  let cc = null;
  async function openCl(c) {
    cc = c ? {...c} : {id: null, name: '', phone: '', birthday: null, consent: false, note: ''};
    $('#clmT').innerHTML = c ? esc(c.name) + sem(c) : 'Novi klijent';
    $('#clmName').value = cc.name; $('#clmPhone').value = cc.phone || ''; $('#clmBday').value = cc.birthday || '';
    $('#clmConsent').checked = !!cc.consent; $('#clmNote').value = cc.note || '';
    $('#clmPts').classList.toggle('hide', !c); $('#clmDel').classList.toggle('hide', !c || !WHO.admin);
    $('#clm').classList.remove('hide');
    if (c) drawClPts();
  }
  async function drawClPts() {
    const c = clients.find(x => x.id === cc.id) || cc;
    $('#clmBal').textContent = c.points;
    $('#clmRw').innerHTML = rewards.filter(r => r.active).map(r => `<button class="btn ${r.points <= c.points ? 'btn-gold' : ''}" data-rw="${r.id}" ${r.points <= c.points ? '' : 'disabled'}>${esc(r.name)} · ${r.points}</button>`).join('') || '<small>Nema nagrada.</small>';
    const url = cardUrl(c), msg = welcomeMsg(c);
    $('#clmLink').textContent = url;
    $('#clmViber').href = c.phone ? 'viber://chat?number=%2B' + intl(c.phone) + '&draft=' + encodeURIComponent(msg) : '#';
    $('#clmWa').href = c.phone ? 'https://wa.me/' + intl(c.phone) + '?text=' + encodeURIComponent(msg) : '#';
    $('#clmViber').classList.toggle('hide', !c.phone); $('#clmWa').classList.toggle('hide', !c.phone);
    const {data} = await sb.from('lax_points').select('*').eq('client_id', c.id).order('created_at', {ascending: false}).limit(100);
    $('#clmHist').innerHTML = (data || []).map(p => `<div class="ph"><span>${dmy(p.created_at)}</span><span>${esc(p.reason)}</span><b class="${p.delta < 0 ? 'neg' : ''}">${p.delta > 0 ? '+' : ''}${p.delta}</b></div>`).join('') || '<small>Nema promjena.</small>';
  }
  const closeCl = () => $('#clm').classList.add('hide');
  $('#clmX').onclick = closeCl;
  $('#clm').addEventListener('click', e => { if (e.target.id === 'clm') closeCl(); });
  $('#clmSave').onclick = async () => {
    const row = {name: $('#clmName').value.trim(), phone: $('#clmPhone').value.trim() || null, birthday: $('#clmBday').value || null, consent: $('#clmConsent').checked, note: $('#clmNote').value.trim() || null};
    if (!row.name) return toast('Upiši ime');
    const r = cc.id ? await sb.from('lax_clients').update(row).eq('id', cc.id).select().single() : await sb.from('lax_clients').insert(row).select().single();
    if (r.error) return toast('Greška: ' + r.error.message);
    toast(cc.id ? 'Klijent sačuvan' : 'Klijent dodan (+20 bodova)');
    const wasNew = !cc.id;
    await reloadClients(); const c = clients.find(x => x.id === r.data.id); openCl(c); drawDay();
    if (wasNew && c && c.phone) offerSend('Pošalji link dobrodošlice', c, welcomeMsg(c), true);
  };
  $('#clmRw').addEventListener('click', async e => {
    const b = e.target.closest('[data-rw]'); if (!b) return; const r = rewards.find(x => x.id === b.dataset.rw);
    if (!await askConfirm('Iskoristiti nagradu?', `${cc.name} koristi nagradu „${r.name}“. Oduzima se ${r.points} bodova.`, 'Iskoristi', false)) return;
    const {error} = await sb.rpc('lax_redeem', {p_client: cc.id, p_reward: r.id});
    if (error) return toast('Greška: ' + error.message);
    toast('Nagrada iskorištena'); await reloadClients(); drawClPts(); drawDay();
  });
  $('#clmAdd').onclick = async () => {
    const d = parseInt($('#clmDelta').value), why = $('#clmWhy').value.trim();
    if (!d) return toast('Upiši broj bodova (npr. 50 ili -50)');
    if (!why) return toast('Upiši razlog (npr. Preporuka, Rođendan)');
    const {error} = await sb.from('lax_points').insert({client_id: cc.id, delta: d, reason: why});
    if (error) return toast('Greška: ' + error.message);
    $('#clmDelta').value = ''; $('#clmWhy').value = '';
    toast((d > 0 ? '+' : '') + d + ' bodova'); await reloadClients(); drawClPts(); drawDay();
  };
  $('#clmCopy').onclick = () => { navigator.clipboard.writeText($('#clmLink').textContent).then(() => toast('Link kopiran')); };
  $('#clmNewTok').onclick = async () => {
    if (!await askConfirm('Napraviti novi link?', 'Stari link prestaje raditi. Klijentu treba poslati novi.', 'Novi link', false)) return;
    const tok = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
    const {error} = await sb.from('lax_clients').update({token: tok}).eq('id', cc.id);
    if (error) return toast('Greška: ' + error.message);
    await reloadClients(); drawClPts(); toast('Novi link napravljen');
  };
  $('#clmDel').onclick = async () => {
    if (!await askConfirm('Obrisati klijenta?', `${cc.name} i svi bodovi se trajno brišu. Termini ostaju u planu, bez veze s klijentom.`)) return;
    const {error} = await sb.from('lax_clients').delete().eq('id', cc.id);
    if (error) return toast('Greška: ' + error.message);
    toast('Klijent obrisan'); closeCl(); await reloadClients(); drawDay();
  };

  // =========================================================
  // RADNICE I NAGRADE (admin)
  // =========================================================
  async function loadStaffAdmin() {
    const r = await sb.from('lax_rewards').select('*').order('points');
    if (!r.error) rewards = r.data;
    drawStaffAdmin();
  }
  function drawStaffAdmin() {
    $('#stList').innerHTML = staff.map((s, i) => `<div class="card strow">
      <div><label class="l">Ime</label><input data-s="${i}" data-k="name" value="${esc(s.name)}"></div>
      <div><label class="l">Redoslijed</label><input type="number" data-s="${i}" data-k="sort" value="${s.sort ?? 0}"></div>
      <label class="ck"><input type="checkbox" data-s="${i}" data-k="active" ${s.active ? 'checked' : ''}> aktivna</label>
      <button class="btn btn-gold" data-ss="${i}">Sačuvaj</button>
      ${!s.id ? '<div class="slog"><span class="lk">Prvo sačuvaj radnicu, pa joj otvori šifru.</span></div>' : s.user_id ? `<div class="slog ok">
        <span class="lk">✓ Ima prijavu: <b>${esc(s.email || '')}</b></span>
        <button class="btn" data-np="${i}">🔑 Nova šifra</button><button class="btn btn-red" data-rm="${i}">Ukloni prijavu</button></div>` : `<div class="slog">
        <span class="lk">Nema prijavu.</span>
        <input data-s="${i}" data-k="em" placeholder="email" value="${esc(s._em ?? sugEmail(s))}" autocomplete="off">
        <input data-s="${i}" data-k="pw" placeholder="lozinka (min. 8)" value="${esc(s._pw || (s._pw = genPw()))}" autocomplete="new-password"><button class="btn" data-gen="${i}" title="Nova lozinka">↻</button>
        <button class="btn btn-gold" data-mk="${i}">🔑 Otvori šifru</button></div>`}
      ${s._done ? loginCard(s, i) : ''}
    </div>`).join('');
    $('#rwList').innerHTML = rewards.map((r, i) => `<div class="card rwrow">
      <input data-r="${i}" data-k="name" value="${esc(r.name)}" placeholder="Naziv nagrade">
      <input type="number" data-r="${i}" data-k="points" value="${r.points ?? ''}" placeholder="bodova">
      <label class="ck"><input type="checkbox" data-r="${i}" data-k="active" ${r.active !== false ? 'checked' : ''}> aktivna</label>
      <button class="btn btn-gold" data-rs="${i}">Sačuvaj</button><button class="btn btn-red" data-rx="${i}">×</button></div>`).join('');
  }
  $('#stList').addEventListener('input', e => { const t = e.target; if (t.dataset.s == null) return; const s = staff[+t.dataset.s], k = t.dataset.k; s[(k === 'em' || k === 'pw') ? '_' + k : '_' + k] = t.type === 'checkbox' ? t.checked : t.value; });
  async function staffUser(body) {
    const {data, error} = await sb.functions.invoke('lax-staff-user', {body});
    if (error) {
      let msg = error.message, exists = false;
      try { const j = await error.context.json(); msg = j.error || msg; exists = !!j.exists; } catch (_) {}
      if (/Failed to send|not found|404/i.test(msg)) msg = 'Funkcija lax-staff-user još nije postavljena u Supabase.';
      return {error: msg, exists};
    }
    return data || {};
  }
  const sugEmail = s => (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') + '@lax.ba';
  const loginMsg = (s, em, pw) => `Ćao ${s.name}! 👋\nTvoja prijava u LAX Studio admin:\n\n🔗 ${location.origin}/admin\n📧 Email: ${em}\n🔑 Lozinka: ${pw}\n\n1. Otvori link na telefonu ili računaru\n2. Upiši email i lozinku i klikni Prijava\n3. Na telefonu: Podijeli → "Dodaj na početni ekran" da ti bude kao aplikacija\n\nLozinku nemoj nikome slati. 💛`;
  function loginCard(s, i) {
    const t = encodeURIComponent(s._done.msg);
    return `<div class="lgcard"><h4>🔑 Podaci za prijavu — ${esc(s.name)}</h4>
      <div class="lgd"><span>Link</span><b>${esc(location.origin)}/admin</b><span>Email</span><b>${esc(s._done.em)}</b><span>Lozinka</span><b>${esc(s._done.pw)}</b></div>
      <ol><li>Pošalji joj poruku (Viber / WhatsApp) ili kopiraj.</li><li>Ona otvori link i prijavi se.</li><li>Ako zaboravi lozinku, ovdje klikni „Nova šifra“.</li></ol>
      <div class="lgacts"><a class="btn" href="viber://forward?text=${t}">Viber</a><a class="btn" href="https://wa.me/?text=${t}" target="_blank" rel="noopener">WhatsApp</a><button class="btn" data-cp="${i}">📋 Kopiraj poruku</button><button class="btn" data-hd="${i}">Zatvori</button></div></div>`;
  }
  const genPw = () => { const a = 'abcdefghjkmnpqrstuvwxyz', d = '23456789', r = n => crypto.getRandomValues(new Uint8Array(1))[0] % n; let p = ''; for (let k = 0; k < 6; k++) p += a[r(a.length)]; p = p[0].toUpperCase() + p.slice(1); for (let k = 0; k < 3; k++) p += d[r(d.length)]; return p; };
  $('#stList').addEventListener('click', async e => {
    const t = e.target, i = k => +t.closest('[' + k + ']').getAttribute(k);
    if (t.closest('[data-gen]')) { const s = staff[i('data-gen')]; s._pw = genPw(); const inp = t.closest('.slog').querySelector('[data-k="pw"]'); inp.value = s._pw; return; }
    if (t.closest('[data-cp]')) { navigator.clipboard.writeText(staff[i('data-cp')]._done.msg).then(() => toast('Poruka kopirana')); return; }
    if (t.closest('[data-hd]')) { staff[i('data-hd')]._done = null; drawStaffAdmin(); return; }
    if (t.closest('[data-mk]')) {
      const s = staff[i('data-mk')], em = (s._em ?? sugEmail(s)).trim(), pw = s._pw || '';
      if (!em || pw.length < 8) return toast('Upiši email i lozinku od bar 8 znakova');
      t.disabled = true; const r = await staffUser({action: 'create', staff_id: s.id, email: em, password: pw}); t.disabled = false;
      if (r.error) {
        if (r.exists && await askConfirm('Nalog već postoji', `Nalog s emailom ${em} već postoji. Želiš li ga povezati s radnicom ${s.name}? Lozinka ostaje stara.`, 'Poveži', false)) {
          const l = await sb.rpc('lax_link_staff', {p_staff: s.id, p_email: em}); if (l.error) return toast('Greška: ' + l.error.message);
          toast('Prijava povezana'); await reloadBase(); return drawStaffAdmin();
        }
        return toast('Greška: ' + r.error);
      }
      const done = {em, pw, msg: loginMsg(s, em, pw)};
      await reloadBase(); const n = staff.find(x => x.id === s.id); if (n) n._done = done; drawStaffAdmin(); toast('Šifra otvorena'); return;
    }
    if (t.closest('[data-np]')) {
      const s = staff[i('data-np')], pw = genPw();
      if (!await askConfirm('Nova šifra?', `${s.name} dobija novu lozinku, a stara prestaje da radi.`, 'Napravi novu', false)) return;
      const r = await staffUser({action: 'password', staff_id: s.id, password: pw}); if (r.error) return toast('Greška: ' + r.error);
      s._done = {em: s.email, pw, msg: loginMsg(s, s.email, pw)}; drawStaffAdmin(); toast('Nova šifra napravljena'); return;
    }
    if (t.closest('[data-rm]')) {
      const s = staff[i('data-rm')];
      if (!await askConfirm('Ukloniti prijavu?', `${s.name} se više neće moći prijaviti u admin, a njen nalog (${s.email}) se briše. Termini i podaci ostaju.`, 'Ukloni')) return;
      const r = await staffUser({action: 'remove', staff_id: s.id}); if (r.error) return toast('Greška: ' + r.error);
      await reloadBase(); drawStaffAdmin(); toast('Prijava uklonjena'); return;
    }
    const b = t.closest('[data-ss]'); if (!b) return; const s = staff[+b.dataset.ss];
    const row = {name: (s._name ?? s.name).trim(), sort: +(s._sort ?? s.sort) || 0, active: s._active ?? s.active};
    if (!row.name) return toast('Upiši ime');
    const r = s.id ? await sb.from('lax_staff').update(row).eq('id', s.id).select().single() : await sb.from('lax_staff').insert(row).select().single();
    if (r.error) return toast('Greška: ' + r.error.message);
    toast('Radnica sačuvana'); await reloadBase(); drawStaffAdmin(); loadWeek();
  });
  $('#stNew').onclick = () => { staff.push({name: '', email: '', sort: staff.length + 1, active: true}); drawStaffAdmin(); };
  $('#rwList').addEventListener('input', e => { const t = e.target; if (t.dataset.r == null) return; rewards[+t.dataset.r][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? parseInt(t.value) : t.value; });
  $('#rwList').addEventListener('click', async e => {
    const s = e.target.closest('[data-rs]'), x = e.target.closest('[data-rx]');
    if (s) {
      const r = rewards[+s.dataset.rs], row = {name: (r.name || '').trim(), points: r.points, active: r.active !== false};
      if (!row.name || !(row.points > 0)) return toast('Upiši naziv i broj bodova');
      const q = r.id ? await sb.from('lax_rewards').update(row).eq('id', r.id).select().single() : await sb.from('lax_rewards').insert(row).select().single();
      if (q.error) return toast('Greška: ' + q.error.message);
      rewards[+s.dataset.rs] = q.data; toast('Nagrada sačuvana'); drawStaffAdmin();
    }
    if (x) {
      const r = rewards[+x.dataset.rx];
      if (r.id) {
        if (!await askConfirm('Obrisati nagradu?', `„${r.name}“ se briše iz liste nagrada. Već iskorišteni bodovi ostaju zapisani.`)) return;
        const q = await sb.from('lax_rewards').delete().eq('id', r.id); if (q.error) return toast('Greška: ' + q.error.message);
      }
      rewards.splice(+x.dataset.rx, 1); drawStaffAdmin();
    }
  });
  $('#rwNew').onclick = () => { rewards.push({name: '', points: null, active: true}); drawStaffAdmin(); };

  // admin.html je možda već završio prijavu prije nego što se ovaj fajl učitao
  if (window.LAX_WHO) window.laxStaffInit(window.LAX_WHO);

  // =========================================================
  // PODSJETNICI ZA SLJEDEĆI RADNI DAN
  // =========================================================
  let rmList = [], rmDay = null;
  const rmKey = id => 'lax_rm_' + id;
  const isSent = a => !!a.reminded_at || (() => { try { return !!localStorage.getItem(rmKey(a.id)); } catch (e) { return false; } })();
  // "danas" za podsjetnike: do 6 ujutro se još računa prethodni dan (rad poslije ponoći)
  function logicalToday() { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; }
  // sljedeći dan; nedjelja se preskače
  function nextWorkday() { const d = logicalToday(); do { d.setDate(d.getDate() + 1); } while (!HOURS[d.getDay()]); return d; }
  let rmPick = null; // dan izabran strelicama u prozoru
  async function loadReminders() {
    const auto = nextWorkday(); rmDay = rmPick || auto; const e = new Date(rmDay); e.setDate(e.getDate() + 1);
    const {data, error} = await sb.from('lax_appointments').select('*').eq('status', 'zakazan').gte('starts_at', rmDay.toISOString()).lt('starts_at', e.toISOString()).order('starts_at');
    if (error) return;
    rmList = (data || []).map(a => ({...a, s: new Date(a.starts_at), e: new Date(a.ends_at)}));
    const lbl = DN[auto.getDay()] + ' ' + ddmm(auto), tom = (() => { const t = logicalToday(); t.setDate(t.getDate() + 1); return dkey(t) === dkey(auto); })();
    $('#rmBtn').firstChild.textContent = '🔔 Podsjetnici za ' + (tom ? 'sutra' : lbl);
    const todo = rmPick && dkey(rmPick) !== dkey(auto) ? +$('#rmN').textContent || 0 : rmList.filter(a => !isSent(a) && phoneOf(a)).length;
    $('#rmN').textContent = todo; $('#rmN').classList.toggle('hide', !todo);
    // podsjetnik na podsjetnike: od 14h, ako nešto nije poslano
    $('#rmBar').classList.toggle('hide', !(todo && new Date().getHours() >= 14));
    $('#rmBarT').textContent = `Nisu poslani podsjetnici za ${tom ? 'sutra' : lbl}: ${todo} ${todo === 1 ? 'termin' : 'termina'}.`;
    if (!$('#rmm').classList.contains('hide')) drawReminders();
  }
  const phoneOf = a => { const c = clients.find(x => x.id === a.client_id); return c && c.phone ? c : null; };
  document.body.insertAdjacentHTML('beforeend', `<div class="md hide" id="rmm"><div class="mdb" style="max-width:640px">
    <div class="mdh"><h3 id="rmmT">Podsjetnici</h3><button class="x" id="rmmX">×</button></div>
    <p class="hint" style="margin:0 0 6px">Klikni Viber, WhatsApp ili SMS kod svakog termina — poruka je već napisana. Poslani se označe sami.</p>
    <div id="rmmList"></div>
    <div class="mact"><small id="rmmSum" style="flex:1;color:var(--muted)"></small><button class="btn btn-gold" id="rmmOk">Zatvori</button></div></div></div>`);
  function drawReminders() {
    $('#rmmT').textContent = 'Podsjetnici — ' + DN[rmDay.getDay()] + ' ' + ddmm(rmDay);
    if (!rmList.length) { $('#rmmList').innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">Nema zakazanih termina za taj dan.</div>'; $('#rmmSum').textContent = ''; return; }
    $('#rmmList').innerHTML = rmList.map(a => {
      const c = phoneOf(a), st = staff.find(x => x.id === a.staff_id), sent = isSent(a);
      const cx = c || clients.find(x => x.id === a.client_id), name = cx ? cx.name : a.client_name || 'bez klijenta';
      let acts = '<span class="nop">nema broja telefona</span>';
      if (c) { const L = sendLinks(c.phone, reminderMsg(a, c));
        acts = (sent ? '<span class="ok">✓ poslano</span>' : '') + `<a class="btn" data-rm="${a.id}" href="${L.v}" target="_blank">Viber</a><a class="btn" data-rm="${a.id}" href="${L.w}" target="_blank" rel="noopener">WhatsApp</a><a class="btn" data-rm="${a.id}" href="${L.s}">SMS</a>`; }
      return `<div class="rmrow ${sent ? 'sent' : ''}"><div class="tm">${hm(a.s)}</div><div class="who"><b>${esc(name)}${sem(cx)}</b><small>${esc(a.service_name)} · ${esc(st ? st.name : '')}</small></div><div class="acts">${acts}</div></div>`;
    }).join('');
    const withPh = rmList.filter(phoneOf), done = withPh.filter(isSent).length;
    $('#rmmSum').textContent = `Poslano ${done} od ${withPh.length}`;
  }
  $('#rmmList').addEventListener('click', async e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const a = rmList.find(x => x.id === b.dataset.rm); if (!a || isSent(a)) return;
    const now = new Date().toISOString();
    try { localStorage.setItem(rmKey(a.id), now); } catch (err) {}
    a.reminded_at = now; setTimeout(() => { drawReminders(); loadReminders(); }, 300);
    await sb.from('lax_appointments').update({reminded_at: now}).eq('id', a.id); // bez kolone (prije SQL-a) ostaje zapisano u pregledniku
  });
  const openRm = async () => { rmPick = null; await loadReminders(); drawReminders(); $('#rmm').classList.remove('hide'); };
  $('#rmBtn').onclick = openRm; $('#rmBarGo').onclick = openRm;
  const closeRm = () => { $('#rmm').classList.add('hide'); if (rmPick) { rmPick = null; loadReminders(); } };
  $('#rmmX').onclick = closeRm; $('#rmmOk').onclick = closeRm;
  $('#rmm').addEventListener('click', e => { if (e.target.id === 'rmm') closeRm(); });

  // ---------- PROVJERA (admin i radnice): promet od završenih termina ----------
  let ckDay = null;
  const ckSum = L => L.reduce((t, a) => t + (+a.price || 0), 0);
  const ckArt = L => L.reduce((t, a) => t + (Array.isArray(a.extras) ? a.extras.filter(x => x.variant_id).reduce((u, x) => u + x.price * x.qty, 0) : 0), 0);
  async function loadCheck() {
    if (!ckDay) { ckDay = new Date(); ckDay.setHours(0, 0, 0, 0); if (ckDay.getDay() === 0) ckDay.setDate(ckDay.getDate() - 1); }
    const d = ckDay, nd = new Date(d); nd.setDate(nd.getDate() + 1);
    const ws = new Date(d); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); const we = new Date(ws); we.setDate(we.getDate() + 7);
    const ms = new Date(d.getFullYear(), d.getMonth(), 1), me = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const from = ws < ms ? ws : ms, to = we > me ? we : me;
    $('#ckDate').textContent = DN[d.getDay()] + ' ' + ddmm(d) + d.getFullYear() + '.';
    const {data, error} = await sb.from('lax_appointments').select('*').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at');
    if (error) { $('#apProm').innerHTML = '<div class="card">Greška: ' + esc(error.message) + '</div>'; $('#ckList').innerHTML = ''; return; }
    const L = data.map(a => ({...a, s: new Date(a.starts_at), e: new Date(a.ends_at)})).sort((x, y) => x.s - y.s), inR = (a, x, y) => a.s >= x && a.s < y;
    const day = L.filter(a => inR(a, d, nd)), done = day.filter(a => a.status === 'zavrsen'), sched = day.filter(a => a.status === 'zakazan');
    const wkD = L.filter(a => a.status === 'zavrsen' && inR(a, ws, we)), moD = L.filter(a => a.status === 'zavrsen' && inR(a, ms, me));
    const art = ckArt(done), st = staff.filter(s => s.active !== false);
    const per = st.map(s => ({n: s.name, v: ckSum(done.filter(a => a.staff_id === s.id)), k: done.filter(a => a.staff_id === s.id).length})).filter(x => x.k);
    $('#apProm').innerHTML = `<div class="pm main"><small>Promet · ${DN[d.getDay()]} ${ddmm(d)}</small><b>${km(ckSum(done))}</b><i>${done.length} ${done.length === 1 ? 'završen termin' : 'završenih termina'}${art ? ' · od toga artikli ' + km(art) : ''}</i></div>
      <div class="pm"><small>Još zakazano</small><b>${km(ckSum(sched))}</b><i>${sched.length} termina</i></div>
      <div class="pm"><small>Sedmica</small><b>${km(ckSum(wkD))}</b><i>${wkD.length} završenih</i></div>
      <div class="pm"><small>${MN[d.getMonth()]}</small><b>${km(ckSum(moD))}</b><i>${moD.length} završenih</i></div>
      <div class="pms">${per.map(x => `<span>${esc(x.n)} <b>${km(x.v)}</b> <small>(${x.k})</small></span>`).join('')}</div>`;
    const rows = day.filter(a => a.status !== 'otkazan');
    if (!rows.length) { $('#ckList').innerHTML = '<div class="card" style="text-align:center;color:var(--muted)">Nema termina za ovaj dan.</div>'; return; }
    $('#ckList').innerHTML = `<table class="cktbl"><thead><tr><th>Vrijeme</th><th>Klijent</th><th>Usluga</th><th>Radnica</th><th>Status</th><th class="r">Iznos</th></tr></thead><tbody>${rows.map(a => {
      const c = clients.find(x => x.id === a.client_id), s = staff.find(x => x.id === a.staff_id);
      const ex = Array.isArray(a.extras) && a.extras.length ? '<br><small>+ ' + a.extras.map(x => esc(x.name) + (x.qty > 1 ? ' ×' + x.qty : '')).join(', ') + '</small>' : '';
      return `<tr class="${a.status === 'zakazan' ? 'zak' : a.status === 'nije_dosla' ? 'nd' : ''}"><td>${hm(a.s)}</td><td>${esc(c ? c.name : a.client_name || '')}</td><td>${esc(a.service_name)}${ex}</td><td>${esc(s ? s.name : '')}</td><td>${STN[a.status] || a.status}</td><td class="r">${a.status === 'zavrsen' ? km(a.price || 0) : '<small>' + km(a.price || 0) + '</small>'}</td></tr>`;
    }).join('')}</tbody><tfoot><tr><td colspan="5">Ukupno završeno</td><td class="r">${km(ckSum(done))}</td></tr></tfoot></table>`;
  }
  const ckMove = n => { do { ckDay.setDate(ckDay.getDate() + n); } while (ckDay.getDay() === 0); loadCheck(); };
  $('#ckPrev').onclick = () => ckMove(-1); $('#ckNext').onclick = () => ckMove(1);
  $('#ckToday').onclick = () => { ckDay = null; loadCheck(); };
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t === 'check') loadCheck(); });

  // =========================================================
  // ŠTAMPA: dnevni, sedmični i mjesečni pregled termina
  // =========================================================
  document.body.insertAdjacentHTML('beforeend', `<div class="md hide" id="prm"><div class="mdb" style="max-width:440px">
    <div class="mdh"><h3>Štampa / slika rasporeda</h3><button class="x" id="prmX">×</button></div>
    <div class="prmode"><button class="on" data-pm="print">🖨 Štampaj</button><button data-pm="img">📷 Slika za Viber / WhatsApp</button></div>
    <div style="display:grid;gap:8px">
      <button class="btn" data-pr="dan" id="prDan">Dan</button>
      <button class="btn" data-pr="sedmica" id="prSed">Sedmica</button>
      <button class="btn" data-pr="mjesec" id="prMj">Mjesec</button>
    </div>
    <label class="ck" style="margin-top:14px"><input type="checkbox" id="prOtk"> Uključi otkazane i „nije došla“</label>
  </div></div>
  <div class="md hide" id="pim"><div class="mdb" style="max-width:720px">
    <div class="mdh"><h3>Slika rasporeda</h3><button class="x" id="pimX">×</button></div>
    <div id="pimBox" style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;max-height:56vh;overflow:auto;text-align:center"></div>
    <div class="rmd" style="order:0;margin-top:14px;flex-wrap:wrap"><button class="btn btn-gold hide" id="pimShare">📤 Podijeli (Viber / WhatsApp)</button><button class="btn" id="pimCopy">📋 Kopiraj sliku</button><a class="btn" id="pimDl">⬇ Preuzmi</a></div>
    <small id="pimHint" style="display:block;color:var(--muted);font-size:12.5px;margin-top:10px;line-height:1.5"></small></div></div>`);
  let prMode = 'print';
  $('#prm').addEventListener('click', e => { const m = e.target.closest('[data-pm]'); if (!m) return;
    prMode = m.dataset.pm; $('#prm').querySelectorAll('[data-pm]').forEach(x => x.classList.toggle('on', x === m)); });
  const closePr = () => $('#prm').classList.add('hide');
  $('#prBtn').onclick = () => {
    const d = dayDate(day), we = new Date(weekStart); we.setDate(we.getDate() + 5);
    $('#prDan').textContent = 'Dan — ' + DN[d.getDay()] + ' ' + ddmm(d) + d.getFullYear() + '.';
    $('#prSed').textContent = 'Sedmica — ' + ddmm(weekStart) + ' – ' + ddmm(we) + we.getFullYear() + '.';
    $('#prMj').textContent = 'Mjesec — ' + MN[d.getMonth()] + ' ' + d.getFullYear() + '.';
    $('#prm').classList.remove('hide');
  };
  $('#prmX').onclick = closePr; $('#prm').addEventListener('click', e => { if (e.target.id === 'prm') closePr(); });
  async function prData(k) {
    const d = dayDate(day); let from, to, title;
    if (k === 'dan') { from = new Date(d); to = new Date(d); to.setDate(to.getDate() + 1); title = 'Dnevni pregled — ' + DN[d.getDay()] + ' ' + ddmm(d) + d.getFullYear() + '.'; }
    else if (k === 'sedmica') { from = new Date(weekStart); to = new Date(weekStart); to.setDate(to.getDate() + 7); const e2 = new Date(weekStart); e2.setDate(e2.getDate() + 5); title = 'Sedmični pregled — ' + ddmm(from) + ' – ' + ddmm(e2) + e2.getFullYear() + '.'; }
    else { from = new Date(d.getFullYear(), d.getMonth(), 1); to = new Date(d.getFullYear(), d.getMonth() + 1, 1); title = 'Mjesečni pregled — ' + MN[d.getMonth()] + ' ' + d.getFullYear() + '.'; }
    const {data, error} = await sb.from('lax_appointments').select('*').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at');
    if (error) throw error;
    const all = $('#prOtk').checked;
    return {title, from, L: (data || []).map(a => ({...a, s: new Date(a.starts_at), e: new Date(a.ends_at)})).filter(a => all || live(a))};
  }
  $('#prm').addEventListener('click', async e => {
    const b = e.target.closest('[data-pr]'); if (!b) return;
    const k = b.dataset.pr;
    if (prMode === 'img') return makeImage(k, b);
    const w = window.open('', '_blank'); // odmah, da preglednik ne blokira prozor
    if (!w) return toast('Preglednik je blokirao novi prozor — dozvoli pop-up za lax.ba');
    w.document.write('<p style="font-family:sans-serif;padding:30px">Pripremam pregled…</p>');
    let r; try { r = await prData(k); } catch (err) { w.document.body.innerHTML = 'Greška: ' + esc(err.message); return; }
    w.document.open(); w.document.write(printHtml(r.title, r.L, k)); w.document.close();
    closePr(); setTimeout(() => { try { w.focus(); w.print(); } catch (err) {} }, 400);
  });
  // SLIKA: isti raspored kao štampa, pretvoren u PNG za grupu na Viberu / WhatsAppu
  let pimBlob = null, pimFile = null, pimUrl = null;
  async function makeImage(k, btn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Pravim sliku…';
    try {
      const r = await prData(k), W = k === 'dan' ? 980 : 1500;
      const html = printHtml(r.title, r.L, k, true).replace('</head>', '<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script></head>');
      const fr = document.createElement('iframe');
      fr.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:1200px;border:0`;
      document.body.appendChild(fr);
      await new Promise((ok, no) => { fr.onload = ok; fr.onerror = no; fr.srcdoc = html; });
      const fw = fr.contentWindow;
      for (let i = 0; i < 50 && !fw.html2canvas; i++) await new Promise(t => setTimeout(t, 100));
      if (!fw.html2canvas) throw new Error('Alat za sliku se nije učitao — provjeri internet');
      const bd = fr.contentDocument.body; fr.style.height = bd.scrollHeight + 'px';
      const cv = await fw.html2canvas(bd, {scale: 2, backgroundColor: '#ffffff', windowWidth: W, width: W, height: bd.scrollHeight, logging: false});
      pimBlob = await new Promise(ok => cv.toBlob(ok, 'image/png')); // prije uklanjanja iframe-a, inače toBlob ne završi
      fr.remove();
      const fn = 'LAX-raspored-' + (k === 'mjesec' ? MN[r.from.getMonth()].toLowerCase() + '-' + r.from.getFullYear() : dkey(r.from)) + '.png';
      pimFile = new File([pimBlob], fn, {type: 'image/png'});
      if (pimUrl) URL.revokeObjectURL(pimUrl); pimUrl = URL.createObjectURL(pimBlob);
      $('#pimBox').innerHTML = `<img src="${pimUrl}" style="max-width:100%;display:block;margin:0 auto">`;
      $('#pimDl').href = pimUrl; $('#pimDl').download = fn;
      const canShare = !!(navigator.canShare && navigator.canShare({files: [pimFile]}));
      $('#pimShare').classList.toggle('hide', !canShare);
      $('#pimCopy').classList.toggle('hide', !(navigator.clipboard && window.ClipboardItem));
      $('#pimHint').innerHTML = (canShare ? '<b>Podijeli</b> → izaberi Viber ili WhatsApp → izaberi grupu.<br>' : '') +
        '<b>Na računaru:</b> Kopiraj sliku → otvori grupu u Viberu / WhatsAppu → zalijepi s <b>Ctrl+V</b> → pošalji.';
      closePr(); $('#pim').classList.remove('hide');
    } catch (err) { toast('Slika nije napravljena: ' + (err.message || err)); }
    finally { btn.disabled = false; btn.textContent = old; document.querySelectorAll('iframe[srcdoc]').forEach(f => f.remove()); }
  }
  $('#pimX').onclick = () => $('#pim').classList.add('hide');
  $('#pim').addEventListener('click', e => { if (e.target.id === 'pim') $('#pim').classList.add('hide'); });
  $('#pimShare').onclick = async () => {
    try { await navigator.share({files: [pimFile], title: 'LAX raspored'}); }
    catch (err) { if (err.name !== 'AbortError') toast('Dijeljenje nije uspjelo — koristi Kopiraj ili Preuzmi'); }
  };
  $('#pimCopy').onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({'image/png': pimBlob})]); toast('Slika kopirana — otvori grupu i zalijepi s Ctrl+V'); }
    catch (err) { toast('Kopiranje nije uspjelo — koristi Preuzmi'); }
  };
  // raspored u kolone kad se termini preklapaju (kao Outlook)
  function lanes(list) {
    const out = {}, L = [...list].sort((p, q) => p.s - q.s); let grp = [], ends = [], gEnd = 0;
    const flush = () => { grp.forEach(a => out[a.id].n = ends.length); grp = []; ends = []; };
    L.forEach(a => { if (grp.length && a.s >= gEnd) flush(); let k = ends.findIndex(e => e <= a.s); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = a.e; out[a.id] = {k}; grp.push(a); gEnd = Math.max(gEnd, +a.e); });
    flush(); return out;
  }
  const PCOL = ['#f6e7c9', '#dcebf7', '#e3f1e1', '#f7dfe6', '#e9e1f5', '#f9e3d3'];
  function printHtml(title, L, k, img) {
    L = [...L].sort((p, q) => p.s - q.s);
    const nm = a => { const c = clients.find(x => x.id === a.client_id); return c ? c.name : a.client_name || ''; };
    const st = staff.filter(s => s.active || L.some(a => a.staff_id === s.id));
    const col = id => PCOL[Math.max(0, st.findIndex(s => s.id === id)) % PCOL.length];
    const sn = id => (st.find(x => x.id === id) || {}).name || '';
    const cls = a => a.status === 'otkazan' || a.status === 'nije_dosla' ? ' x' : '';
    const cl = a => clients.find(x => x.id === a.client_id);
    const psem = a => { const c = cl(a); return c && c.done_ok != null ? `<span class="sm"><i class="g">${c.done_ok}</i><i class="y">${c.done_moved}</i><i class="r">${c.missed}</i></span>` : ''; };
    const legend = `<div class="leg">${st.map(s => `<span><i style="background:${col(s.id)}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    let body = '', land = k !== 'dan';
    const grid = (cols, colLabels, itemsFor, showStaff) => {
      // sati: od najranijeg do najkasnijeg radnog vremena (proširi ako termin ispada van)
      let h0 = 24, h1 = 0; cols.forEach(c => { const hh = HOURS[c.date.getDay()]; if (hh) { h0 = Math.min(h0, hh[0]); h1 = Math.max(h1, hh[1]); } });
      L.forEach(a => { h0 = Math.min(h0, a.s.getHours()); h1 = Math.max(h1, a.e.getHours() + (a.e.getMinutes() ? 1 : 0)); });
      if (h0 >= h1) { h0 = 9; h1 = 19; }
      const PH = land ? 58 : 64, H = (h1 - h0) * PH;
      const top = t => ((t.getHours() - h0) * 60 + t.getMinutes()) / 60 * PH;
      let html = `<div class="cal" style="grid-template-columns:44px repeat(${cols.length},1fr)"><div class="ch"></div>${colLabels.map(l => `<div class="ch">${l}</div>`).join('')}`;
      html += `<div class="tc" style="height:${H}px">${Array.from({length: h1 - h0}, (_, i) => `<span style="top:${i * PH}px">${pad(h0 + i)}:00</span>`).join('')}</div>`;
      cols.forEach(c => {
        const items = itemsFor(c), ln = lanes(items), hh = HOURS[c.date.getDay()];
        const closed = hh ? `<div class="off" style="top:0;height:${Math.max(0, (hh[0] - h0) * PH)}px"></div><div class="off" style="top:${(hh[1] - h0) * PH}px;bottom:0"></div>` : '<div class="off" style="top:0;bottom:0"></div>';
        html += `<div class="dc" style="height:${H}px">${Array.from({length: (h1 - h0) * 2}, (_, i) => `<div class="hl${i % 2 ? ' h' : ''}" style="top:${i * PH / 2}px"></div>`).join('')}${closed}` +
          items.map(a => { const l = ln[a.id], w = 100 / l.n, t = top(a.s), ht = Math.max(16, top(a.e) - t);
            return `<div class="ev${cls(a)}" style="top:${t}px;height:${ht - 2}px;left:calc(${l.k * w}% + 2px);width:calc(${w}% - 4px);background:${col(a.staff_id)}"><b>${hm(a.s)}–${hm(a.e)}</b> · <em>${esc(sn(a.staff_id))}</em><br><strong>${esc(nm(a))}</strong>${psem(a)}<br>${esc(a.service_name)}${a.note ? '<br><small>' + esc(a.note) + '</small>' : ''}</div>`; }).join('') + '</div>';
      });
      return html + '</div>';
    };
    if (k === 'dan') {
      const d = dayDate(day);
      body = grid(st.map(s => ({date: d, s})), st.map(s => `<i style="background:${col(s.id)}"></i>${esc(s.name)}`), c => L.filter(a => a.staff_id === c.s.id && dkey(a.s) === dkey(d)), false);
    } else if (k === 'sedmica') {
      const cols = [1, 2, 3, 4, 5, 6].map(i => ({date: dayDate(i)}));
      body = legend + grid(cols, cols.map(c => `${DN[c.date.getDay()]} ${ddmm(c.date)}`), c => L.filter(a => dkey(a.s) === dkey(c.date)), true);
    } else {
      const d = dayDate(day), first = new Date(d.getFullYear(), d.getMonth(), 1), start = monday(first.getDay() === 0 ? new Date(first.getTime() + 86400000) : first), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      let cells = '';
      for (let w = new Date(start); w <= last; w.setDate(w.getDate() + 7)) {
        for (let i = 0; i < 6; i++) {
          const c = new Date(w); c.setDate(c.getDate() + i); const inM = c.getMonth() === d.getMonth();
          const items = L.filter(a => dkey(a.s) === dkey(c));
          cells += `<div class="mc${inM ? '' : ' om'}"><div class="md">${c.getDate()}.</div>${items.map(a => `<div class="mi${cls(a)}" style="background:${col(a.staff_id)}"><b>${hm(a.s)}</b> · ${esc(sn(a.staff_id))}<br><strong>${esc(nm(a))}</strong>${psem(a)}<br>${esc(a.service_name)}</div>`).join('')}</div>`;
        }
      }
      body = legend + `<div class="mon"><div class="mh">Pon</div><div class="mh">Uto</div><div class="mh">Sri</div><div class="mh">Čet</div><div class="mh">Pet</div><div class="mh">Sub</div>${cells}</div>`;
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4 ${land ? 'landscape' : 'portrait'};margin:10mm}
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#222;font-size:10px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      h1{font-size:16px;margin:0 0 2px}.sub{color:#777;margin-bottom:8px;font-size:10px}
      .leg{display:flex;gap:14px;margin:0 0 8px;font-size:10.5px}.leg i,.ch i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;border:1px solid #bbb}
      .cal{display:grid;border:1px solid #bbb;border-radius:4px}
      .ch{padding:6px;font-weight:bold;font-size:11px;border-bottom:1px solid #bbb;border-left:1px solid #ddd;text-align:center;background:#f6f3ef}.ch:first-child{border-left:0}
      .tc{position:relative}.tc span{position:absolute;right:5px;transform:translateY(2px);color:#777;font-size:9.5px}
      .dc{position:relative;border-left:1px solid #ddd;overflow:hidden}.hl{position:absolute;left:0;right:0;border-top:1px solid #e3e3e3}.hl.h{border-top:1px dotted #eee}
      .off{position:absolute;left:0;right:0;background:repeating-linear-gradient(45deg,#f4f4f4,#f4f4f4 4px,#fff 4px,#fff 8px)}
      .ev{position:absolute;border:1px solid rgba(0,0,0,.18);border-left:3px solid rgba(0,0,0,.45);border-radius:3px;padding:2px 4px;font-size:9.5px;line-height:1.25;overflow:hidden}
      .ev b{font-weight:bold}.ev em{font-style:normal;color:#555}.ev small{color:#555}
      .x{opacity:.45;text-decoration:line-through}
      .sm{margin-left:4px;white-space:nowrap}.sm i{display:inline-block;min-width:13px;height:13px;line-height:13px;border-radius:7px;text-align:center;font-style:normal;font-size:8px;font-weight:bold;color:#fff;margin-right:2px;padding:0 2px}
      .sm .g{background:#2f8a4a}.sm .y{background:#d9a514;color:#3a2a00}.sm .r{background:#c93636}
      .ev strong,.mi strong{font-weight:bold}
      .mon{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid #bbb;border-radius:4px}
      .mh{background:#f6f3ef;font-weight:bold;text-align:center;padding:5px;border-bottom:1px solid #bbb;border-left:1px solid #ddd}.mh:first-child{border-left:0}
      .mc{min-height:92px;border-left:1px solid #ddd;border-top:1px solid #ddd;padding:3px}.mc:nth-child(6n+1){border-left:0}.mc.om{background:#fafafa;color:#aaa}
      .md{font-weight:bold;font-size:11px;margin-bottom:2px}.mi{font-size:8.8px;line-height:1.2;padding:1px 3px;border-radius:2px;margin-bottom:2px;border-left:2px solid rgba(0,0,0,.4)}
      .foot{margin-top:6px;color:#999;font-size:9px}
      ${img ? 'body{padding:18px 20px;background:#fff;font-size:11px}.ev{font-size:10.5px}.mi{font-size:9.8px}.off{background:#f3f3f3}' : ''}
    </style></head><body>
      <h1>LAX Studio — ${esc(title)}</h1><div class="sub">${img ? 'Stanje' : 'Odštampano'} ${dmy(new Date())} u ${hm(new Date())}</div>
      ${body}<div class="foot">www.lax.ba</div></body></html>`;
  }

  // osvježi plan svake minute (druga radnica je možda nešto upisala)
  setInterval(() => { if (READY && !$('#t-appts').classList.contains('hide') && $('#apm').classList.contains('hide')) loadWeek(); }, 60000);
})();
