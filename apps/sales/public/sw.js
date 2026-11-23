// UPLIF Go service worker. It never stores pages, API calls or Supabase responses, because those are tenant data.
// It keeps static build files and icons, plus the offline shell: one public page with no account data. Without
// signal the shell opens and draws the screen from the copy the app saved in the browser (IndexedDB).
const VERSION = "v3";
const STATIC_CACHE = `uplif-static-${VERSION}`;
const SHELL_CACHE = `uplif-shell-${VERSION}`;
const SHELL_URL = "/offline";
const OFFLINE_URL = "/offline.html"; // last resort, for pages the shell cannot stand in for (sign-in)

const isStaticAsset = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

/** Fetches the shell page and every file it needs, then drops shell files that are no longer used. */
async function refreshShell() {
  const res = await fetch(SHELL_URL, { cache: "reload" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const base = new URL(SHELL_URL, self.location.origin);
  const files = new Set();
  for (const m of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)) files.add(new URL(m[1], base).href);
  // Fonts and images are named inside the style sheets.
  for (const css of [...files].filter((u) => u.split("?")[0].endsWith(".css"))) {
    try {
      const text = await (await fetch(css)).text();
      for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        if (m[1].startsWith("data:")) continue;
        const u = new URL(m[1], css);
        if (u.origin === self.location.origin && u.pathname.startsWith("/_next/static/")) files.add(u.href);
      }
    } catch {}
  }
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(SHELL_URL, res);
  await Promise.all([...files].map(async (u) => { if (!(await cache.match(u))) { try { await cache.add(u); } catch {} } }));
  for (const req of await cache.keys()) {
    const u = req.url;
    if (u !== new URL(SHELL_URL, base).href && !files.has(u)) await cache.delete(req);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
      refreshShell().catch(() => {}),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("uplif-") && k !== STATIC_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "refresh-shell") event.waitUntil(refreshShell().catch(() => {}));
});

const cachedAsset = (request) => caches.match(request, { cacheName: SHELL_CACHE }).then((hit) => hit || caches.match(request));

async function openPage(request, url) {
  try {
    return await fetch(request);
  } catch {
    if (url.pathname === SHELL_URL) {
      const shell = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE, ignoreSearch: true });
      if (shell) return shell;
    } else if (url.pathname !== "/login" && !url.pathname.startsWith("/auth/")) {
      // No signal: open the shell, which draws this screen from the copy saved on the phone.
      if (await caches.match(SHELL_URL, { cacheName: SHELL_CACHE, ignoreSearch: true })) {
        return Response.redirect(`${SHELL_URL}?to=${encodeURIComponent(url.pathname)}`, 302);
      }
    }
    return caches.match(OFFLINE_URL);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and other hosts go straight to the network.

  if (request.mode === "navigate") {
    event.respondWith(openPage(request, url));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      cachedAsset(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Phone alerts. The message carries no details, only that something is waiting; the app shows the rest.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title : "UPLIF Go";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "uplif-update",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
