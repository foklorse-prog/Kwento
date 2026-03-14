const CACHE = "kwento-v1";
const ASSETS = [
  "./",
  "./index.html",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
];
const FONT_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300&display=swap";

// Install: cache everything
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
    .then(() => caches.open("kwento-fonts").then(fc => fc.add(FONT_URL).catch(()=>{})))
  );
});

// Activate: clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== "kwento-fonts").map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = e.request.url;

  if(url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")){
    e.respondWith(
      caches.open("kwento-fonts").then(fc =>
        fc.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(res => {
            fc.put(e.request, res.clone());
            return res;
          }).catch(()=>cached);
        })
      )
    );
    return;
  }

  if(url.endsWith("/") || url.endsWith("index.html") || url === self.registration.scope){
    e.respondWith(
      // Always serve fresh index.html from the network when online.
      // Crucially, we do NOT write it back to cache here — that's checkUpdate's job.
      // This keeps the cache holding the "last known" version so the comparison
      // in checkUpdate always has something meaningful to diff against.
      fetch(e.request, {cache:"no-store"})
        .then(res => res)
        .catch(() => caches.match(e.request)) // offline fallback
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// checkUpdate: fetch fresh index.html and compare against the cached version.
// Because the fetch handler above never updates the cache, the cached version
// always represents what the user last saw — so a difference means a real update.
async function checkUpdate(client) {
  try {
    const freshRes = await fetch("./index.html", {cache:"no-store"});
    const freshHtml = await freshRes.text();
    const cache = await caches.open(CACHE);
    const cached = await cache.match("./index.html");
    const cachedHtml = cached ? await cached.text() : "";

    if(freshHtml !== cachedHtml){
      // New version found — store it so the next reload serves it from cache
      // and so future checkUpdate calls see this version as the new baseline.
      await cache.put("./index.html", new Response(freshHtml, {headers:{"Content-Type":"text/html"}}));
      client.postMessage("UPDATE_READY");
    } else {
      client.postMessage("UP_TO_DATE");
    }
  } catch(e) {
    client.postMessage("OFFLINE");
  }
}

self.addEventListener("message", e => {
  if(e.data === "CHECK_UPDATE"){
    checkUpdate(e.source);
  }
});
