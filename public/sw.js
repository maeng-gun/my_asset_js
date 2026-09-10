const CACHE_NAME = 'portfolio-offline-v2';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 오프라인 페이지를 미리 캐시에 저장합니다 (PWA 필수 조건)
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 사용자가 페이지 이동(navigate)을 할 때만 개입합니다.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          // 항상 네트워크를 우선으로 시도합니다.
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (error) {
          // 네트워크 오류(오프라인) 발생 시, 캐시해둔 오프라인 페이지를 보여줍니다.
          console.log('네트워크 오류로 오프라인 페이지를 반환합니다.', error);
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(OFFLINE_URL);
          return cachedResponse;
        }
      })()
    );
  }
});
