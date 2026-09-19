const CACHE_PREFIX = "reading-pwa";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v1`;
const PAGE_CACHE = `${CACHE_PREFIX}-pages-v1`;
const ASSET_CACHE = `${CACHE_PREFIX}-assets-v1`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-v1`;

const CURRENT_CACHES = new Set([
  SHELL_CACHE,
  PAGE_CACHE,
  ASSET_CACHE,
  IMAGE_CACHE,
]);

const SHELL_URLS = [
  "/",
  "/posts/",
  "/en/",
  "/en/posts/",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;
  if (overflow <= 0) return;

  await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
}

async function remember(cacheName, request, response, maxEntries) {
  if (!response || !response.ok || response.type !== "basic") return response;

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  await trimCache(cacheName, maxEntries);
  return response;
}

async function networkFirstNavigation(request) {
  const pageCache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await pageCache.put(request, response.clone());
      await trimCache(PAGE_CACHE, 64);
    }
    return response;
  } catch {
    const cached =
      await pageCache.match(request, { ignoreSearch: true }) ??
      await caches.match(request, { ignoreSearch: true });

    if (cached) return cached;

    const shell = await caches.open(SHELL_CACHE);
    return shell.match("/offline.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  return remember(ASSET_CACHE, request, response, 96);
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const network = fetch(request)
    .then((response) => remember(IMAGE_CACHE, request, response, 80))
    .catch(() => undefined);

  return cached ?? network;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(name))
        .map((name) => caches.delete(name))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    url.pathname.startsWith("/_astro/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
