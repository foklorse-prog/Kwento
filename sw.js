const CACHE = "kwento-v5";
const META_CACHE = "kwento-meta";
const ASSETS = [
  "./",
  "./index.html",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
];
const FONT_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap";

// Install: cache everything
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
    .then(async () => {
      const fc = await caches.open("kwento-fonts-v2");
      try {
        const cssRes = await fetch(FONT_URL, {cache:"no-store"});
        const cssText = await cssRes.text();
        await fc.put(FONT_URL, new Response(cssText, {headers:{"Content-Type":"text/css"}}));
        const matches = Array.from(cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g));
        const fontUrls = matches.map(m => m[1]);
        await Promise.all(fontUrls.map(u => fetch(u).then(res => fc.put(u, res.clone())).catch(()=>{})));
      } catch(e) {
        // best effort; fonts will still be cached on-demand via fetch handler
      }
    })
  );
});

// Activate: clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== "kwento-fonts-v2" && k !== META_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for index.html, cache-first for everything else
self.addEventListener("fetch", e => {
  const url = e.request.url;

  if(url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")){
    e.respondWith(
      caches.open("kwento-fonts-v2").then(fc =>
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
      fetch(e.request, {cache:"no-store"})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// CHECK_UPDATE: compare network vs cached index.html, notify client if different
async function checkUpdate(client) {
  try {
    const freshRes = await fetch("./index.html", {cache:"no-store"});
    const freshHtml = await freshRes.text();
    const buildMatch = freshHtml.match(/name=["']kwento-build["']\s+content=["']([^"']+)["']/i);
    const freshBuild = buildMatch ? buildMatch[1] : "";
    const meta = await caches.open(META_CACHE);
    const cachedBuildRes = await meta.match("kwento-build");
    const cachedBuild = cachedBuildRes ? await cachedBuildRes.text() : "";

    const cache = await caches.open(CACHE);
    const cached = await cache.match("./index.html");
    const cachedHtml = cached ? await cached.text() : "";
    if(freshBuild && !cachedBuild){
      await meta.put("kwento-build", new Response(freshBuild, {headers:{"Content-Type":"text/plain"}}));
      client.postMessage("UP_TO_DATE");
      return;
    }
    if(freshBuild && freshBuild === cachedBuild){
      client.postMessage("UP_TO_DATE");
      return;
    }
    if(freshHtml !== cachedHtml){
      // Store fresh version so next reload gets it
      await cache.put("./index.html", new Response(freshHtml, {headers:{"Content-Type":"text/html"}}));
      if(freshBuild){
        await meta.put("kwento-build", new Response(freshBuild, {headers:{"Content-Type":"text/plain"}}));
      }
      client.postMessage("UPDATE_READY");
    } else {
      if(freshBuild && freshBuild !== cachedBuild){
        await meta.put("kwento-build", new Response(freshBuild, {headers:{"Content-Type":"text/plain"}}));
      }
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
