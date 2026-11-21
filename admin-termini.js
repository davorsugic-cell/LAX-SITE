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
  const first = n => String(n || '').split(' ')[0];
  const dmy = v => { const d = new Date(v); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + '.'; };

  let WHO = {admin: false, staff: null}, READY = false;
  let staff = [], services = [], clients = [], rewards = [], appts = [];
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
    drawWeek();
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
            <div class="t">${hm(a.s)} – ${hm(a.e)}</div><div class="u">${esc(a.service_name)}</div>
            <div class="k">${esc(c ? c.name : a.client_name || '')}${c ? ` · <span class="pts">♥ ${c.points}</span>` : ''}</div>
            <div class="tags" ${h < 80 ? 'style="top:6px;bottom:auto"' : ''}>${a.needs_cabin ? '<span class="cab">KABINA</span>' : ''}<span class="sts">${STN[a.status]}</span></div></div>`;
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
  let cur = null;
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
      $('#apmPts').innerHTML = `♥ ${c.points} bodova` + (can ? ` — može iskoristiti: ${esc(can.name)}` : '');
    } else $('#apmPts').textContent = v ? 'Novi klijent — upiši telefon ispod.' : '';
  }
  function remindLink() {
    const c = clients.find(x => x.id === cur.client_id), b = $('#apmRemind');
    if (!cur.id || !c || !c.phone || cur.status !== 'zakazan') return b.classList.add('hide');
    const msg = `Ćao ${first(c.name)}! Podsjećamo te na termin u LAX Studiju ${DN[cur.s.getDay()].toLowerCase()} ${ddmm(cur.s)} u ${hm(cur.s)} (${cur.service_name}). Vidimo se! 💛`;
    const n = intl(c.phone), t = encodeURIComponent(msg);
    $('#apmRV').href = 'viber://chat?number=%2B' + n + '&draft=' + t;
    $('#apmRW').href = 'https://wa.me/' + n + '?text=' + t;
    $('#apmRS').href = 'sms:+' + n + '?&body=' + t;
    b.classList.remove('hide');
  }
  $('#apmClient').addEventListener('input', clientInfo);
  $('#apmSvc').onchange = () => {
    const s = services.find(x => x.id === $('#apmSvc').value); if (!s) return;
    $('#apmMin').value = s.duration_min || 60; $('#apmPrice').value = s.price ?? '';
  };
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
        await reloadClients(); c = clients.find(x => x.id === r.data.id);
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
      toast(cur.id ? 'Termin izmijenjen' : 'Termin zakazan'); closeAp(); loadWeek();
    } catch (err) { $('#apmWarn').innerHTML = '<b>' + esc(err.message || err) + '</b>'; $('#apmWarn').classList.remove('hide'); }
    finally { btn.disabled = false; }
  }
  $('#apmStatus').addEventListener('click', async e => {
    const b = e.target.closest('[data-st]'); if (!b || !cur.id) return;
    const pr = $('#apmPrice').value === '' ? null : +$('#apmPrice').value;
    const {data, error} = await sb.rpc('lax_set_status', {p_id: cur.id, p_status: b.dataset.st, p_price: pr});
    if (error) return toast('Greška: ' + error.message);
    toast(b.dataset.st === 'zavrsen' ? (data.points ? `Završeno · +${data.points} bodova${data.double ? ' (dopuna ×2)' : ''}` : 'Završeno') : 'Status: ' + STN[b.dataset.st]);
    closeAp(); await reloadClients(); loadWeek();
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
  function drawClientDL() { $('#clDL').innerHTML = clients.map(c => `<option value="${esc(c.name + (c.phone ? ' · ' + c.phone : ''))}">`).join(''); }
  function drawClients() {
    if (!$('#clList')) return;
    const q = ($('#clQ').value || '').trim().toLowerCase(), L = clients.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§'));
    $('#clList').innerHTML = L.length ? `<div class="clh"><span>Ime</span><span>Telefon</span><span>Bodovi</span><span>Zadnja posjeta</span><span></span></div>` + L.map(c => `<div class="card clrow" data-cl="${c.id}">
      <b>${esc(c.name)}</b><span>${esc(c.phone || '—')}</span><span class="pts">♥ ${c.points}</span><span>${c.last_visit ? dmy(c.last_visit) : '—'}</span><button class="btn">Otvori</button></div>`).join('')
      : '<div class="card" style="text-align:center;color:var(--muted)">' + (clients.length ? 'Nema rezultata.' : 'Još nema klijenata. Dodaju se ovdje ili automatski pri zakazivanju termina.') + '</div>';
  }
  $('#clQ').addEventListener('input', drawClients);
  $('#clList').addEventListener('click', e => { const r = e.target.closest('[data-cl]'); if (r) openCl(clients.find(c => c.id === r.dataset.cl)); });
  $('#clNew').onclick = () => openCl(null);

  let cc = null;
  async function openCl(c) {
    cc = c ? {...c} : {id: null, name: '', phone: '', birthday: null, consent: false, note: ''};
    $('#clmT').textContent = c ? c.name : 'Novi klijent';
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
    const url = cardUrl(c), msg = `Ćao ${first(c.name)}! 💛 Dobrodošli u LAX program vjernosti. Svoje bodove i nagrade možeš pratiti ovdje: ${url}`;
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
    await reloadClients(); const c = clients.find(x => x.id === r.data.id); openCl(c); drawDay();
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
      ${!s.id ? '<div class="slog"><span class="lk">Prvo sačuvaj radnicu, pa joj napravi prijavu.</span></div>' : s.user_id ? `<div class="slog ok">
        <span class="lk">✓ Prijava: <b>${esc(s.email || '')}</b></span>
        <input data-s="${i}" data-k="pw" placeholder="nova lozinka (min. 8)" autocomplete="new-password"><button class="btn" data-gen="${i}">Generiši</button>
        <button class="btn" data-pw="${i}">Promijeni lozinku</button><button class="btn btn-red" data-rm="${i}">Ukloni prijavu</button></div>` : `<div class="slog">
        <span class="lk">Nema prijavu.</span>
        <input data-s="${i}" data-k="em" placeholder="email za prijavu" value="${esc(s._em || '')}" autocomplete="off">
        <input data-s="${i}" data-k="pw" placeholder="lozinka (min. 8)" value="${esc(s._pw || '')}" autocomplete="new-password"><button class="btn" data-gen="${i}">Generiši</button>
        <button class="btn btn-gold" data-mk="${i}">Napravi prijavu</button></div>`}
      ${s._done ? `<div class="slog done"><span>Pošalji radnici podatke za prijavu (Viber, SMS):</span><code>${esc(s._done)}</code><button class="btn" data-cp="${i}">Kopiraj</button></div>` : ''}
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
  const genPw = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(10)), x => a[x % a.length]).join(''); };
  $('#stList').addEventListener('click', async e => {
    const t = e.target, i = k => +t.closest('[' + k + ']').getAttribute(k);
    if (t.closest('[data-gen]')) { const s = staff[i('data-gen')]; s._pw = genPw(); const inp = t.closest('.slog').querySelector('[data-k="pw"]'); inp.value = s._pw; return; }
    if (t.closest('[data-cp]')) { navigator.clipboard.writeText(staff[i('data-cp')]._done).then(() => toast('Kopirano')); return; }
    if (t.closest('[data-mk]')) {
      const s = staff[i('data-mk')], em = (s._em || '').trim(), pw = s._pw || '';
      if (!em || pw.length < 8) return toast('Upiši email i lozinku od bar 8 znakova');
      t.disabled = true; const r = await staffUser({action: 'create', staff_id: s.id, email: em, password: pw}); t.disabled = false;
      if (r.error) {
        if (r.exists && await askConfirm('Nalog već postoji', `Nalog s emailom ${em} već postoji. Želiš li ga povezati s radnicom ${s.name}? Lozinka ostaje stara.`, 'Poveži', false)) {
          const l = await sb.rpc('lax_link_staff', {p_staff: s.id, p_email: em}); if (l.error) return toast('Greška: ' + l.error.message);
          toast('Prijava povezana'); await reloadBase(); return drawStaffAdmin();
        }
        return toast('Greška: ' + r.error);
      }
      const done = `Prijava u LAX admin: ${location.origin}/admin\nEmail: ${em}\nLozinka: ${pw}`;
      await reloadBase(); const n = staff.find(x => x.id === s.id); if (n) n._done = done; drawStaffAdmin(); toast('Prijava napravljena'); return;
    }
    if (t.closest('[data-pw]')) {
      const s = staff[i('data-pw')], pw = s._pw || '';
      if (pw.length < 8) return toast('Nova lozinka mora imati bar 8 znakova');
      const r = await staffUser({action: 'password', staff_id: s.id, password: pw}); if (r.error) return toast('Greška: ' + r.error);
      s._done = `Prijava u LAX admin: ${location.origin}/admin\nEmail: ${s.email}\nNova lozinka: ${pw}`; s._pw = ''; drawStaffAdmin(); toast('Lozinka promijenjena'); return;
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

  // osvježi plan svake minute (druga radnica je možda nešto upisala)
  setInterval(() => { if (READY && !$('#t-appts').classList.contains('hide') && $('#apm').classList.contains('hide')) loadWeek(); }, 60000);
})();
