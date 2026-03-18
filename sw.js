const CACHE_NAME = "nmtci-cache-v25";
const ASSETS = [
    "/",
    "/index.html",
    "/assets/css/styles.css",
    "/assets/js/index.js",
    "/assets/js/chapter.js",
    "/assets/js/highlight.js",
    "/assets/js/audio.js",
    "/assets/css/highlights.css",
    "/assets/js/vendor/floating-ui/core.js",
    "/assets/js/vendor/floating-ui/dom.js",
    "/offline.html",
    "/assets/img/nmtci.jpg",
    "/assets/icons/favicon-96x96.png",
    "/assets/icons/favicon.svg",
    "/chapters.json",
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                }),
            );
        }),
    );
    return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);

    if (
        requestUrl.origin.includes("fonts.googleapis.com") ||
        requestUrl.origin.includes("fonts.gstatic.com")
    ) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return (
                    cached ||
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            const cacheUpdate = caches
                                .open(CACHE_NAME)
                                .then((cache) => {
                                    return cache.put(
                                        event.request,
                                        responseToCache,
                                    );
                                });
                            event.waitUntil(cacheUpdate);
                        }
                        return networkResponse;
                    })
                );
            }),
        );
        return;
    }

    if (requestUrl.pathname.endsWith("chapters.json")) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        const cacheUpdate = caches
                            .open(CACHE_NAME)
                            .then((cache) => {
                                return cache.put(
                                    event.request,
                                    responseToCache,
                                );
                            });
                        event.waitUntil(cacheUpdate);
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request, {
                        ignoreSearch: true,
                        ignoreVary: true,
                    });
                }),
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (
                        networkResponse &&
                        networkResponse.status === 200 &&
                        (networkResponse.type === "basic" ||
                            networkResponse.type === "cors")
                    ) {
                        const responseToCache = networkResponse.clone();

                        const cacheUpdate = new Promise((resolve) => {
                            if (!event.request.url.startsWith("http")) {
                                resolve();
                                return;
                            }
                            if (responseToCache.redirected) {
                                responseToCache.blob().then((bodyBlob) => {
                                    const cleanResponse = new Response(
                                        bodyBlob,
                                        {
                                            status: responseToCache.status,
                                            statusText:
                                                responseToCache.statusText,
                                            headers: responseToCache.headers,
                                        },
                                    );
                                    caches.open(CACHE_NAME).then((cache) => {
                                        cache.put(event.request, cleanResponse);
                                        resolve();
                                    });
                                });
                            } else {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(event.request, responseToCache);
                                    resolve();
                                });
                            }
                        });

                        event.waitUntil(cacheUpdate);
                    }
                    return networkResponse;
                })
                .catch((error) => {
                    if (
                        event.request.mode === "navigate" ||
                        event.request.destination === "document"
                    ) {
                        return caches.match("/offline.html");
                    }
                });

            return cachedResponse || fetchPromise;
        }),
    );
});
