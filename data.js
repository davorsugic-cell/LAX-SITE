/* LAX — podaci sajta: objavljena verzija ili pregled nacrta (samo admin) */
(function () {
  var C = window.LAX_CONFIG || {}, SB = null, P = null;
  function client() {
    if (!SB && window.supabase && C.SUPABASE_URL && C.SUPABASE_ANON_KEY) SB = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    return SB;
  }
  var q = new URLSearchParams(location.search);
  try {
    if (q.get('pregled') === '1') sessionStorage.setItem('lax_pregled', '1');
    if (q.get('pregled') === '0') sessionStorage.removeItem('lax_pregled');
  } catch (e) {}
  function wantPreview() { try { return sessionStorage.getItem('lax_pregled') === '1'; } catch (e) { return false; } }

  function banner() {
    if (document.getElementById('laxPrev')) return;
    var b = document.createElement('div'); b.id = 'laxPrev';
    b.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:#a8423f;color:#fff;padding:10px 16px;border-radius:30px;font:500 13px/1.3 Jost,system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;max-width:calc(100vw - 24px)';
    b.innerHTML = '<span>PREGLED — neobjavljene izmjene</span><a href="?pregled=0" style="color:#fff;text-decoration:underline;white-space:nowrap">Izađi</a>';
    (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); }))
      .then(function () { document.body.appendChild(b); });
  }

  function ord(a) { return (a || []).sort(function (x, y) { return (x.sort || 0) - (y.sort || 0) || String(x.created_at || '').localeCompare(String(y.created_at || '')); }); }

  async function live(sb) {
    var r = await Promise.all([
      sb.from('lax_categories').select('*').eq('active', true),
      sb.from('lax_products').select('*, lax_variants(*)').eq('active', true),
      sb.from('lax_delivery').select('*').eq('active', true),
      sb.from('lax_services').select('*').eq('active', true),
      sb.from('lax_settings').select('key,value'),
      sb.from('lax_team').select('*').eq('active', true),
      sb.from('lax_news').select('*').eq('active', true)
    ]);
    if (r[6].error) r[6] = {data: []}; // novosti.sql još nije pokrenut
    var e = r.find(function (x) { return x.error; }); if (e) throw e.error;
    var settings = {}; (r[4].data || []).forEach(function (s) { settings[s.key] = s.value; });
    var products = ord(r[1].data);
    products.forEach(function (p) { p.lax_variants = ord((p.lax_variants || []).filter(function (v) { return v.active; })); });
    return { categories: ord(r[0].data), products: products, delivery: ord(r[2].data), services: ord(r[3].data), settings: settings, team: ord(r[5].data), news: r[6].data || [] };
  }

  async function load() {
    var sb = client(); if (!sb) throw new Error('Supabase nije podešen');
    if (wantPreview()) {
      var s = await sb.auth.getSession();
      if (s.data && s.data.session) {
        var a = await sb.from('lax_admins').select('user_id').eq('user_id', s.data.session.user.id).maybeSingle();
        if (a.data) { banner(); var d = await live(sb); d.preview = true; return d; }
      }
    }
    var r = await sb.from('lax_published').select('data,published_at').maybeSingle();
    if (r.error || !r.data || !r.data.data || !r.data.data.products) return live(sb); // još nije objavljeno
    var out = r.data.data;
    ['categories', 'products', 'delivery', 'services', 'team', 'news'].forEach(function (k) { out[k] = out[k] || []; });
    out.settings = out.settings || {};
    out.published_at = r.data.published_at;
    return out;
  }
  window.laxClient = client;
  window.laxData = function () { if (!P) P = load(); return P; };
})();
