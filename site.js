// LAX Studio — zajednička skripta za stranice usluga
(function () {
  // ---- Radno vrijeme (vrijeme u Banjoj Luci) ----
  var H = {1:[12,19],2:[12,19],3:[12,19],4:[9,16],5:[9,16],6:[9,15],0:null};
  var DAN = ['nedjelja','ponedjeljak','utorak','srijeda','četvrtak','petak','subota'];
  var DANOM = ['nedjeljom','ponedjeljkom','utorkom','srijedom','četvrtkom','petkom','subotom'];
  var U_DAN = ['u nedjelju','u ponedjeljak','u utorak','u srijedu','u četvrtak','u petak','u subotu'];
  function hh(n){ return String(n).padStart(2,'0') + ':00'; }
  function nowBL(){
    var p = {}; new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sarajevo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false})
      .formatToParts(new Date()).forEach(function(x){ p[x.type] = x.value; });
    return { d: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday), m: (+p.hour % 24) * 60 + (+p.minute) };
  }
  function nextOpen(d){ for (var i = 1; i <= 7; i++){ var n = (d + i) % 7; if (H[n]) return {n:n, i:i}; } }
  function status(){
    var t0 = nowBL(), d = t0.d, m = t0.m, t = H[d], nx = nextOpen(d);
    var kad = nx.i === 1 ? 'sutra (' + DAN[nx.n] + ')' : U_DAN[nx.n];
    if (!t) return {cls:'closed', txt:'Danas je ' + DAN[d] + ' — <b>' + DANOM[d] + ' ne radimo</b>. Vidimo se ' + kad + ' od ' + hh(H[nx.n][0]) + '.'};
    if (m < t[0]*60) return {cls:'soon', txt:'Danas (' + DAN[d] + ') radimo <b>' + hh(t[0]) + ' – ' + hh(t[1]) + '</b> · otvaramo u ' + hh(t[0])};
    if (m < t[1]*60) return {cls:'open-now', txt:'<b>Sada smo otvoreni</b> · danas (' + DAN[d] + ') radimo do ' + hh(t[1])};
    return {cls:'closed', txt:'Za danas smo zatvorili · otvaramo ' + kad + ' u <b>' + hh(H[nx.n][0]) + '</b>'};
  }
  function render(){
    var s = status(), tb = document.getElementById('topbar');
    if (tb){ tb.className = 'topbar ' + s.cls; document.getElementById('tbText').innerHTML = s.txt + ' <a href="#lokacija">Radno vrijeme i lokacija</a>'; }
    var d = nowBL().d;
    document.querySelectorAll('[data-hours] tr').forEach(function(r){ r.classList.toggle('today', +r.dataset.d === d); });
  }
  render(); setInterval(render, 60000);

  // ---- Cjenovnik iz baze ----
  var box = document.getElementById('cjenovnik');
  if (!box) return;
  var cat = box.dataset.cat, C = window.LAX_CONFIG || {};
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function km(n){ return Number(n).toLocaleString('bs-BA',{maximumFractionDigits:2}) + ' KM'; }
  function empty(){ box.innerHTML = '<p class="muted">Za cijene i slobodne termine pozovite nas ili pišite na Viber / WhatsApp.</p>'; }
  if (!window.laxData || !C.SUPABASE_URL || /OVDJE|VAS-PROJEKAT/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY)) return empty();
  laxData().then(function(D){
    var list = (D.services || []).filter(function(x){ return x.category === cat; }), show = D.settings.services_show_prices !== false;
    if (!list.length) return empty();
    box.innerHTML = list.map(function(x){
      var showP = show && x.show_price && x.price != null;
      var meta = [x.description, x.duration_min ? x.duration_min + ' min' : ''].filter(Boolean).join(' · ');
      return '<div class="pl-i"><div><b>' + esc(x.name) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + '</div>' +
        (showP ? '<div class="pr">' + (x.price_from ? 'od ' : '') + km(x.price) + '</div>' : '<div class="pr na">Cijena na upit</div>') + '</div>';
    }).join('');
  }).catch(empty);
})();
