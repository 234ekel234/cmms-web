/* FMI HANNI service worker.
 *
 * 1. Opening the app without signal (offline release 1). Pages and the app's
 *    own files are kept on the device so a page opened before opens again in a
 *    plant room with no bars. The *data* on those pages is kept separately, per
 *    person, by lib/offlineData.ts — nothing here stores anyone's jobs: the
 *    pages are the same shell for everybody and fetch their data afterwards.
 *
 *      /_next/static/*      the app's code; named by content, so kept as-is
 *      pages (navigations)   network first; the saved copy when there is none;
 *                            /offline.html for a page never opened
 *      other files here      icons, manifest: saved copy at once, refreshed
 *                            in the background
 *
 *    The API is another site (cmms-api.) and is never touched here. Neither
 *    are Next's in-app navigation requests (RSC): offline they fail, and Next
 *    then loads the page in full, which comes from the saved pages above.
 *
 * 2. Web push: shows notifications and opens the page one is about. The
 *    payload comes from backend helpers/webPush.js: { title, body, url, tag }.
 *
 * Bump VERSION when the caching rules change; old caches are deleted.
 */

const VERSION = "v1";
const PAGES = `hanni-pages-${VERSION}`;
const ASSETS = `hanni-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const NAV_TIMEOUT_MS = 6000;
const MAX_PAGES = 150;
// The app's files from a few releases back; older ones are dropped first.
const MAX_ASSETS = 600;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await (await caches.open(PAGES)).addAll([OFFLINE_URL]).catch(() => {});
    await (await caches.open(ASSETS)).addAll(["/brand/hanni-icon.svg", "/brand/hanni-icon-reverse.svg"]).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const name of await caches.keys()) {
      if (name.startsWith("hanni-") && !keep.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const isRsc = (req, url) => req.headers.get("RSC") === "1" || url.searchParams.has("_rsc") || req.headers.get("Next-Router-Prefetch");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the API and fonts: not ours to cache
  if (isRsc(req, url)) return;

  if (req.mode === "navigate") {
    event.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.pathname === "/sw.js") return;
  event.respondWith(staleWhileRevalidate(req));
});

async function page(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    if (res.ok && res.type === "basic") {
      await cache.put(req.url, res.clone());
      trim(cache, MAX_PAGES);
    }
    return res;
  } catch {
    return (await cache.match(req.url)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    trim(cache, MAX_ASSETS);
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) {
    if (new URL(keys[i].url).pathname !== OFFLINE_URL) await cache.delete(keys[i]);
  }
}

/* Saving pages ahead of time. The Today page sends the pages of the technician's
 * jobs and rounds ({ type: "warm", urls }) so they open offline even if they
 * were never visited; each page's code files are saved with it, or the page
 * would load as an empty shell. */
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(warm(event.data.urls.slice(0, 60)));
});

async function warm(urls) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  for (const raw of urls) {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin) continue;
      const res = await fetch(url.href, { credentials: "same-origin" });
      if (!res.ok) continue;
      const html = await res.clone().text();
      await pages.put(url.href, res);
      const files = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
      for (const f of files) {
        if (!(await assets.match(f))) {
          const r = await fetch(f).catch(() => null);
          if (r && r.ok) await assets.put(f, r);
        }
      }
    } catch {
      // offline again, or the page moved: try next time
    }
  }
  trim(pages, MAX_PAGES);
  trim(assets, MAX_ASSETS);
}

/* ── Web push ─────────────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "FMI HANNI";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/brand/hanni-192.png",
      badge: "/brand/hanni-badge.png",
      // Same job, same event: the newer one replaces the older, but still alerts.
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue;
      try {
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      } catch {
        // A window this worker does not control cannot be navigated; open one.
        break;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
