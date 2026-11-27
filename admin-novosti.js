/* LAX admin — Novosti na početnoj stranici (samo admin; vidljivo nakon "Objavi izmjene") */
(function () {
  'use strict';
  const sec = document.createElement('section');
  sec.id = 't-news'; sec.className = 'hide';
  sec.innerHTML = `<div class="bar"><h2>Novosti</h2><button class="btn btn-gold" id="nwNew">+ Nova novost</button></div>
    <p class="hint">Novosti se prikazuju na početnoj stranici, odmah ispod naslova i prije usluga (do 6 najnovijih). Izdvojena ide prva.
      Novost s datumom u budućnosti pojavi se tog dana, a „Prikaži do“ je sama skloni. Na sajtu se vidi nakon <b>Objavi izmjene</b>.</p>
    <div id="nwList"><div class="card" style="color:var(--muted)">Učitavanje…</div></div>
    <input type="file" id="nwFile" accept="image/*" class="hide">`;
  const ref = document.getElementById('t-staff');
  ref.parentNode.insertBefore(sec, ref);

  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  let news = [], imgI = -1;

  async function load() {
    const {data, error} = await sb.from('lax_news').select('*').order('pinned', {ascending: false}).order('news_date', {ascending: false}).order('created_at', {ascending: false});
    if (error) { $('#nwList').innerHTML = '<div class="card">Greška: ' + esc(error.message) + (/lax_news|relation|schema/i.test(error.message) ? ' — pokreni novosti.sql' : '') + '</div>'; return; }
    news = data; draw();
  }
  function state(n) {
    const t = today();
    if (n.active === false) return ['off', 'Sakriveno'];
    if (n.show_until && n.show_until < t) return ['off', 'Isteklo'];
    if (n.news_date && n.news_date > t) return ['wait', 'Zakazano'];
    return ['on', 'Prikazano'];
  }
  function draw() {
    $('#nwList').innerHTML = news.map((n, i) => { const [k, l] = state(n); return `<div class="card nwrow ${k === 'off' ? 'off' : ''}">
      <div class="th" data-nwimg="${i}" title="Učitaj sliku">${n.image_url ? `<img src="${esc(n.image_url)}">` : '+ slika'}</div>
      <div class="nwf">
        <div class="r2"><div style="flex:1"><label class="l">Naslov *</label><input data-n="${i}" data-k="title" value="${esc(n.title || '')}" placeholder="npr. Novembarska akcija na lash lift"></div>
          <span class="nst ${k}">${l}</span></div>
        <div><label class="l">Tekst</label><textarea data-n="${i}" data-k="body" rows="3" placeholder="Kratko o novosti…">${esc(n.body || '')}</textarea></div>
        <div class="r2">
          <div><label class="l">Datum</label><input type="date" data-n="${i}" data-k="news_date" value="${esc(n.news_date || today())}"></div>
          <div><label class="l">Prikaži do (opcionalno)</label><input type="date" data-n="${i}" data-k="show_until" value="${esc(n.show_until || '')}"></div>
          <div style="flex:1;min-width:180px"><label class="l">Link (opcionalno)</label><input data-n="${i}" data-k="link_url" value="${esc(n.link_url || '')}" placeholder="/shop, #usluge ili https://…"></div>
          <div style="width:170px"><label class="l">Tekst dugmeta</label><input data-n="${i}" data-k="link_label" value="${esc(n.link_label || '')}" placeholder="Saznajte više"></div>
        </div>
        <div class="r2 acts">
          <label class="ck"><input type="checkbox" data-n="${i}" data-k="pinned" ${n.pinned ? 'checked' : ''}> ★ Izdvojeno</label>
          <label class="ck"><input type="checkbox" data-n="${i}" data-k="active" ${n.active !== false ? 'checked' : ''}> Prikaži na sajtu</label>
          ${n.image_url ? `<button class="btn" data-nwdi="${i}">Ukloni sliku</button>` : ''}
          <span style="flex:1"></span>
          <button class="btn btn-gold" data-nws="${i}">Sačuvaj</button><button class="btn btn-red" data-nwx="${i}">Obriši</button>
        </div>
      </div></div>`; }).join('') || '<div class="card" style="text-align:center;color:var(--muted)">Još nema novosti. Klikni „+ Nova novost“.</div>';
  }

  $('#nwNew').onclick = () => {
    news.unshift({title: '', body: '', news_date: today(), active: true, pinned: false});
    draw(); const f = document.querySelector('#nwList input[data-k=title]'); if (f) f.focus();
  };
  $('#nwList').addEventListener('input', e => {
    const t = e.target; if (t.dataset.n == null) return;
    news[+t.dataset.n][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
  });
  $('#nwList').addEventListener('click', async e => {
    const g = a => { const el = e.target.closest('[' + a + ']'); return el ? +el.getAttribute(a) : null; };
    let i;
    if ((i = g('data-nwimg')) != null) { imgI = i; $('#nwFile').value = ''; $('#nwFile').click(); return; }
    if ((i = g('data-nwdi')) != null) { news[i].image_url = null; draw(); toast('Slika uklonjena — klikni Sačuvaj'); return; }
    if ((i = g('data-nws')) != null) {
      const n = news[i];
      if (!String(n.title || '').trim()) return toast('Upiši naslov');
      if (n.show_until && n.news_date && n.show_until < n.news_date) return toast('„Prikaži do“ je prije datuma novosti');
      const row = {title: n.title.trim(), body: (n.body || '').trim() || null, image_url: n.image_url || null, link_url: (n.link_url || '').trim() || null,
        link_label: (n.link_label || '').trim() || null, news_date: n.news_date || today(), show_until: n.show_until || null, pinned: !!n.pinned, active: n.active !== false};
      const r = n.id ? await sb.from('lax_news').update(row).eq('id', n.id) : await sb.from('lax_news').insert(row);
      if (r.error) return toast('Greška: ' + r.error.message);
      toast('Sačuvano — na sajtu nakon „Objavi izmjene“'); if (window.pubStatus) pubStatus(); load(); return;
    }
    if ((i = g('data-nwx')) != null) {
      const n = news[i];
      if (!await askConfirm('Obrisati novost?', `„${n.title || 'bez naslova'}“ će biti trajno obrisana.`)) return;
      if (n.id) { const r = await sb.from('lax_news').delete().eq('id', n.id); if (r.error) return toast('Greška: ' + r.error.message); if (window.pubStatus) pubStatus(); }
      news.splice(i, 1); draw(); toast('Obrisano');
    }
  });
  $('#nwFile').onchange = async e => {
    const f = e.target.files[0]; if (!f || imgI < 0) return;
    try { toast('Šaljem sliku…'); news[imgI].image_url = await uploadImage(f); draw(); toast('Slika učitana — klikni Sačuvaj'); }
    catch (err) { toast('Greška: ' + err.message); }
  };
  document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.t === 'news') load(); });
})();
