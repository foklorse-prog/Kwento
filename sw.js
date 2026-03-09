const CACHE = "kwento-v1";
const ASSETS = [
  "./",
  "./index.html",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
];

// Install: cache everything
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
});

// Activate: clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener("fetch", e => {
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
