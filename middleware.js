// LAX — stranica "Uskoro" do otvaranja sajta (Vercel Routing Middleware)
// Do datuma OTVARANJE posjetioci vide /uskoro; admin, bodovi i fajlovi rade normalno.
// Pregled pravog sajta prije otvaranja: https://www.lax.ba/?pregled=<PREGLED_KLJUC>  (pamti se 30 dana)

const OTVARANJE = Date.parse('2026-12-01T00:00:00+01:00');
const PREGLED_KLJUC = 'lax-pregled-7k2m';

export const config = {
  // sve osim admina, kartice bodova i statičkih fajlova
  matcher: ['/((?!admin|bodovi|uskoro|_vercel|.*\\.(?:png|jpe?g|webp|gif|ico|svg|css|js|xml|txt|json|webmanifest|woff2?)$).*)', '/uskoro']
};

// isto što rade next()/rewrite() iz @vercel/functions, bez dodatnog paketa
const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });
const rewrite = (url) => new Response(null, { headers: { 'x-middleware-rewrite': String(url) } });

export default function middleware(request) {
  const url = new URL(request.url);
  const otvoreno = Date.now() >= OTVARANJE;

  if (url.pathname === '/uskoro') {
    return otvoreno ? Response.redirect(new URL('/', url), 307) : next();
  }
  if (otvoreno) return next();

  if (url.searchParams.get('pregled') === PREGLED_KLJUC) {
    url.searchParams.delete('pregled');
    return new Response(null, {
      status: 307,
      headers: {
        Location: url.pathname + (url.search || ''),
        'Set-Cookie': `lax_pregled=${PREGLED_KLJUC}; Path=/; Max-Age=2592000; SameSite=Lax; Secure; HttpOnly`,
        'Cache-Control': 'no-store'
      }
    });
  }
  const cookie = request.headers.get('cookie') || '';
  if (cookie.includes(`lax_pregled=${PREGLED_KLJUC}`)) return next();

  return rewrite(new URL('/uskoro', url));
}
