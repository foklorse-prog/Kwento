const CACHE = "kwento-v1";
const ASSETS = [
  "./",
  "./index.html",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
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

// Fetch: serve from cache, fall back to network
self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Fonts: cache-first, then network, store for offline
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
  // Everything else: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Message: when app sends "CHECK_UPDATE", fetch fresh index.html
// and compare to cached version. If different, update cache and notify app.
self.addEventListener("message", e => {
  if(e.data === "CHECK_UPDATE"){
    fetch("./index.html", {cache:"no-store"})
      .then(res => res.text())
      .then(async freshHtml => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match("./index.html");
        const cachedHtml = cached ? await cached.text() : "";
        if(freshHtml !== cachedHtml){
          // Update ALL assets silently in background
          await cache.addAll(ASSETS.filter(a => !a.includes("unpkg"))); // update app files
          const freshRes = new Response(freshHtml, {headers:{"Content-Type":"text/html"}});
          await cache.put("./index.html", freshRes);
          // Tell the app there's an update ready
          e.source.postMessage("UPDATE_READY");
        } else {
          e.source.postMessage("UP_TO_DATE");
        }
      })
      .catch(() => e.source.postMessage("OFFLINE"));
  }
});
