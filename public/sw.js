// ============================================================
// Service Worker: صفحة "مفيش اتصال" لما الموقع يتفتح والنت أو السيرفر واقع
// - بيحفظ صفحة offline.html بس (مش بيحفظ أي بيانات من البرنامج)
// - بيتدخل في فتح الصفحات بس: لو الطلب فشل، أو السيرفر رجّع 502/503/504
//   ← بيعرض offline.html (وهي بتتأكد لوحدها وترجع للبرنامج أول ما يشتغل)
// ============================================================
const CACHE = "erp-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((res) =>
        [502, 503, 504].includes(res.status)
          ? caches.match(OFFLINE_URL).then((page) => page || res)
          : res,
      )
      .catch(() =>
        caches.match(OFFLINE_URL).then((page) => page || Response.error()),
      ),
  );
});
