/* Sprunky's offline cache. The game page is fetched fresh when there is internet (so updates arrive) and from the cache when there is not. */
const V = 'sprunkys-v13';
const CORE = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const BIG = ['voice-maya.json', 'voice-maya.mp3'];
const box = () => caches.open(V);
self.addEventListener('install', e => {
  /* the small files must all arrive; the voice files are tried here too and, if that fails, saved the first time the game asks for them */
  e.waitUntil(box().then(c => c.addAll(CORE).then(() => c.addAll(BIG).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sprunkys-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const store = (key, res) => {
  if (!res || !(res.ok || res.type === 'opaque')) return Promise.resolve();
  const copy = res.clone();
  return box().then(c => c.put(key, copy)).catch(() => {});
};
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !/^https?:/.test(req.url)) return;
  const url = new URL(req.url), own = url.origin === location.origin;
  if (req.mode === 'navigate' || (own && /\/(index\.html)?$/.test(url.pathname))) {
    /* the page: fresh copy first, the saved copy after 4 seconds or with no internet */
    const saved = () => box().then(c => c.match('./'));
    const net = fetch(req).then(res => ({ res, w: res.ok ? store('./', res) : null }));
    e.waitUntil(net.then(x => x.w).catch(() => {}));
    e.respondWith(new Promise(done => {
      let settled = false;
      const give = r => { if (!settled && r) { settled = true; done(r); } };
      const timer = setTimeout(() => saved().then(give), 4000);
      net.then(x => { clearTimeout(timer); give(x.res); }, () => { clearTimeout(timer); saved().then(r => give(r || Response.error())); });
    }));
    return;
  }
  /* everything else (voice files, icons, fonts): the saved copy first */
  e.respondWith(box().then(c => c.match(req, { ignoreSearch: own })).then(r => {
    if (r) return r;
    const ask = url.hostname === 'fonts.googleapis.com' && req.mode === 'no-cors' ? new Request(req.url, { mode: 'cors', credentials: 'omit' }) : req;
    const net = fetch(ask).then(res => ({ res, w: store(req.url, res) }));
    e.waitUntil(net.then(x => x.w).catch(() => {}));
    return net.then(x => x.res);
  }));
});
