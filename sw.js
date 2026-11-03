// Service worker: gör appen tillgänglig offline.
// Höj CACHE_VERSION (och APP_VERSION i js/version.js) vid varje publicering,
// annars ser telefonen inte att det finns en ny version.

const CACHE_VERSION = 'v1.1.0';
const CACHE = `matlogg-${CACHE_VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/ai/common.js',
  'js/ai/gemini.js',
  'js/ai/provider.js',
  'js/app.js',
  'js/basfoods.js',
  'js/db.js',
  'js/foods.js',
  'js/goals.js',
  'js/nutrition.js',
  'js/off.js',
  'js/parser.js',
  'js/portions.js',
  'js/recipes.js',
  'js/text.js',
  'js/ui.js',
  'js/version.js',
  'js/views/day.js',
  'js/views/item-editor.js',
  'js/views/items-list.js',
  'js/views/log.js',
  'js/views/recipes.js',
  'js/views/settings.js',
  'data/livsmedel.json',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('matlogg-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Appens egna filer: från cache först (snabbt och offline). Annat (t.ex. AI-anrop senare): nätverk.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
