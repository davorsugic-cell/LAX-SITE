// LAX Studio — prozor "Zakažite termin" (Pozovite / Viber / WhatsApp)
(function () {
  var PHONE = '+38766864406', PHONE_TXT = '066 864-406';
  var MSG = 'Pozdrav, želim zakazati termin u LAX Studiju.';
  var css = '' +
    '.bk-ov{position:fixed;inset:0;background:rgba(43,36,32,.55);z-index:200;display:none;align-items:center;justify-content:center;padding:16px}' +
    '.bk-ov.on{display:flex}' +
    '.bk{position:relative;width:min(420px,100%);background:#f7f1ea;border-radius:26px;padding:30px 26px 24px;box-shadow:0 30px 70px rgba(0,0,0,.3);text-align:center;font-family:"Jost",system-ui,sans-serif;color:#2b2420;animation:bkIn .25s ease}' +
    '@keyframes bkIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}' +
    '.bk-x{position:absolute;right:14px;top:14px;width:40px;height:40px;border-radius:50%;border:1px solid #e4d6c5;background:#fbf7f2;font-size:22px;line-height:1;cursor:pointer;color:#2b2420}' +
    '.bk-e{font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:#a8803f;margin-bottom:8px}' +
    '.bk h3{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:34px;line-height:1.05;margin:0 0 6px}' +
    '.bk p{color:#7a6c60;font-size:15px;margin:0 0 20px}' +
    '.bk a.o{display:flex;align-items:center;gap:14px;padding:15px 20px;border-radius:18px;margin-top:10px;color:#fff;text-decoration:none;text-align:left;transition:transform .15s,box-shadow .15s}' +
    '.bk a.o:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.15)}' +
    '.bk a.o svg{width:28px;height:28px;flex:none}' +
    '.bk a.o b{display:block;font-weight:500;font-size:17px;letter-spacing:.02em}' +
    '.bk a.o small{display:block;font-size:13px;opacity:.85}' +
    '.bk a.o .ar{margin-left:auto;font-size:22px;opacity:.8}' +
    '.bk .t{background:linear-gradient(135deg,#c9a467,#a8803f 45%,#8a6630)}' +
    '.bk .v{background:#7360f2}' +
    '.bk .w{background:#25d366}' +
    '.bk .ig{display:inline-block;margin-top:16px;font-size:13px;color:#8a6630;text-decoration:underline}' +
    '@media (max-width:560px){.bk-ov{align-items:flex-end;padding:0}.bk{border-radius:26px 26px 0 0;padding-bottom:30px}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var I = {
    tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
    vib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c4.8 0 8.5 2.6 8.5 7.6 0 5-3.7 7.4-8.5 7.4-.8 0-1.6-.1-2.3-.2L6.5 20v-3.3C4.4 15.5 3.5 13.4 3.5 10.1c0-5 3.7-7.6 8.5-7.6z"/><path d="M9.2 7.2c.4-.3 1-.3 1.2.2l.6 1.3c.2.4 0 .8-.3 1.1l-.3.3c.4 1 1.2 1.8 2.2 2.2l.3-.3c.3-.3.7-.5 1.1-.3l1.3.6c.5.2.5.8.2 1.2-.6.8-1.6 1-2.5.6-1.9-.8-3.4-2.3-4.2-4.2-.4-.9-.2-1.9.4-2.7z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 8.2c.3-.4.9-.4 1.1.1l.6 1.3c.2.4 0 .8-.3 1.1l-.3.3c.4 1 1.2 1.8 2.2 2.2l.3-.3c.3-.3.7-.5 1.1-.3l1.3.6c.5.2.5.8.1 1.1-.6.7-1.5.9-2.4.5-1.8-.7-3.2-2.2-3.9-3.9-.3-.9-.2-1.8.2-2.5z"/></svg>'
  };
  var enc = encodeURIComponent(MSG);
  var ov = document.createElement('div');
  ov.className = 'bk-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'bkT');
  ov.innerHTML = '<div class="bk"><button class="bk-x" aria-label="Zatvori">×</button>' +
    '<div class="bk-e">LAX Studio</div><h3 id="bkT">Zakažite termin</h3><p>Izaberite kako nas želite kontaktirati</p>' +
    '<a class="o t" href="tel:' + PHONE + '">' + I.tel + '<span><b>Pozovite</b><small>' + PHONE_TXT + '</small></span><span class="ar">›</span></a>' +
    '<a class="o v" href="viber://chat?number=%2B' + PHONE.slice(1) + '&draft=' + enc + '">' + I.vib + '<span><b>Viber</b><small>Pošaljite poruku</small></span><span class="ar">›</span></a>' +
    '<a class="o w" href="https://wa.me/' + PHONE.slice(1) + '?text=' + enc + '" target="_blank" rel="noopener">' + I.wa + '<span><b>WhatsApp</b><small>Pošaljite poruku</small></span><span class="ar">›</span></a>' +
    '<a class="ig" href="https://ig.me/m/laxstudiobl" target="_blank" rel="noopener">ili pišite na Instagram</a></div>';
  document.body.appendChild(ov);

  var last = null;
  function open(e) { if (e) e.preventDefault(); last = document.activeElement; ov.classList.add('on'); document.body.style.overflow = 'hidden'; ov.querySelector('.o').focus(); }
  function close() { ov.classList.remove('on'); document.body.style.overflow = ''; if (last && last.focus) last.focus(); }
  ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.bk-x')) close(); });
  ov.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setTimeout(close, 300); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('on')) close(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-book]');
    if (b) open(e);
  });
  window.LAXBook = { open: open, close: close };
})();
