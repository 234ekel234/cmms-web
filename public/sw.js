/* FMI HANNI service worker: shows web push notifications and opens the page a
 * notification is about when it is tapped. Nothing else — no offline caching,
 * no fetch handler — so it never stands between the app and the network.
 *
 * The payload comes from backend helpers/webPush.js: { title, body, url, tag }.
 * `url` is always a path on this site; anything else is ignored.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
