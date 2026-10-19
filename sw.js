// 晚餐轉盤離線快取（Service Worker）
// 網頁：先抓最新版（4 秒內沒回應就用快取）；樣式與字型等 CDN 檔案：先用快取、背景更新
const CACHE = 'dinner-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const CDN_PRECACHE = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&display=swap'
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE).then(c => Promise.all([
        ...CORE.map(u => c.add(u).catch(() => null)),
        // 樣式與圖示字型（跨網域）先存起來，第一次開過後離線也有完整版面
        ...CDN_PRECACHE.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(res => c.put(u, res)).catch(() => null))
    ])));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('dinner-') && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function networkFirst(request) {
    return new Promise(resolve => {
        let settled = false;
        const fallback = () => caches.match(request, { ignoreSearch: true })
            .then(r => r || caches.match('./index.html'))
            .then(r => r || caches.match('./'))
            .then(r => { if (!settled && r) { settled = true; resolve(r); } return r; });
        const timer = setTimeout(fallback, 4000);
        fetch(request).then(res => {
            clearTimeout(timer);
            if (res && res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(request, copy));
            }
            if (!settled) { settled = true; resolve(res); }
        }).catch(() => {
            clearTimeout(timer);
            fallback().then(r => { if (!settled) { settled = true; resolve(r || Response.error()); } });
        });
    });
}

function staleWhileRevalidate(request) {
    return caches.open(CACHE).then(cache => cache.match(request).then(cached => {
        const update = fetch(request).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
            return res;
        }).catch(() => cached);
        return cached || update;
    }));
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (url.pathname.endsWith('/restaurants.json')) return;   // 不存在時讓網頁改用內嵌資料，不做快取
        event.respondWith(networkFirst(req));
    } else if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(req));
    }
});
