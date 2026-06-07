/**
 * Service Worker — Group M
 * ══════════════════════════════════════════════════════════════════
 * نسخة محسّنة: لا تمسح cache المستخدم، ولا تتدخل في localStorage
 * ══════════════════════════════════════════════════════════════════
 */

// نغير اسم الـ cache عند كل deployment جديد تلقائياً
// (timestamp عند build-time لو متاح، وإلا ثابت)
const CACHE_VERSION = 'v3';
const CACHE_NAME = `group-m-cache-${CACHE_VERSION}`;

// الملفات اللي نكاشها (static assets فقط)
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
];

// ══════════════════════════════════════════════════════════════════
// Install — فتح cache جديد
// ══════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[SW] Installing:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting()) // تفعيل فوري
  );
});

// ══════════════════════════════════════════════════════════════════
// Activate — مسح الـ caches القديمة فقط (مش localStorage!)
// ══════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('group-m-cache-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ══════════════════════════════════════════════════════════════════
// Fetch — Network First لـ HTML، Cache First لـ Assets
// ══════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  // تجاهل non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // تجاهل chrome extensions
  if (url.origin.includes('chrome-extension')) return;

  // تجاهل GitHub API — دايماً من الشبكة
  if (url.hostname.includes('api.github.com')) return;

  // تجاهل Vercel API endpoints
  if (url.pathname.startsWith('/api/')) return;

  // HTML pages — Network First (عشان ناخد أحدث version دايماً)
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // نحدث الـ cache بالنسخة الجديدة
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // لو الشبكة مش متاحة، نرجع النسخة المكاشة
          return caches.match(event.request) || caches.match('/');
        })
    );
    return;
  }

  // Static assets — Cache First مع Network Fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // نحدث في الخلفية (Stale-While-Revalidate)
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
            }
          })
          .catch(() => {});
        return cached;
      }
      // مش موجود في cache — نجيبه من الشبكة
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ══════════════════════════════════════════════════════════════════
// Message Handler — للتواصل مع التطبيق
// ══════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // ⚠️ لا نستقبل أوامر لمسح localStorage من هنا أبداً
});
