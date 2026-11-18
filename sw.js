/* PB287 Service Worker — ให้คู่มือ เบอร์ฉุกเฉิน และแผนที่ที่เคยเปิด ใช้งานได้แม้ไม่มีอินเทอร์เน็ต
 * เปลี่ยน VERSION ทุกครั้งที่แก้ไฟล์ในเว็บ เพื่อให้เครื่องผู้ใช้โหลดของใหม่
 */
const VERSION = 'pb287-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const CDN_CACHE = `${VERSION}-cdn`;
const TILE_CACHE = 'pb287-tiles';
const MAX_TILES = 400;

const SHELL = [
    '/',
    '/index.html',
    '/js/app.js',
    '/js/cloud.js',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/Photo/Seal_of_the_Ministry_of_Public_Health_of_Thailand.svg'
];
const CDN = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
    'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'www.gstatic.com'];
// ห้ามแคช API ของ Firebase (Firestore มีแคชออฟไลน์ของตัวเอง)
const BYPASS_HOSTS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'www.googleapis.com', 'firebaseinstallations.googleapis.com'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const shell = await caches.open(SHELL_CACHE);
        await shell.addAll(SHELL);
        const cdn = await caches.open(CDN_CACHE);
        await Promise.all(CDN.map(async (url) => {
            try {
                const res = await fetch(url, { mode: url.includes('tailwindcss') ? 'no-cors' : 'cors' });
                if (res.ok || res.type === 'opaque') await cdn.put(url, res);
            } catch (e) { /* ข้ามได้ จะเก็บตอนใช้งานจริง */ }
        }));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = [SHELL_CACHE, CDN_CACHE, TILE_CACHE];
        for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
        await self.clients.claim();
    })());
});

async function trimTiles() {
    const cache = await caches.open(TILE_CACHE);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (BYPASS_HOSTS.includes(url.hostname)) return;

    // หน้าเว็บ: เอาของใหม่จากเน็ตก่อน ถ้าออฟไลน์ใช้ของในแคช
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                (await caches.open(SHELL_CACHE)).put('/index.html', res.clone());
                return res;
            } catch (e) {
                return (await caches.match('/index.html')) || Response.error();
            }
        })());
        return;
    }

    // ไฟล์ในเว็บเรา: ใช้ของในแคชทันที แล้วอัปเดตเบื้องหลัง
    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL_CACHE);
            const cached = await cache.match(req, { ignoreSearch: true });
            const network = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
            return cached || (await network) || Response.error();
        })());
        return;
    }

    // ไลบรารีจาก CDN: แคชก่อน
    if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith((async () => {
            const cache = await caches.open(CDN_CACHE);
            const cached = await cache.match(req);
            if (cached) return cached;
            try {
                const res = await fetch(req);
                if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
                return res;
            } catch (e) { return Response.error(); }
        })());
        return;
    }

    // แผ่นแผนที่ OSM ที่เคยเปิด: แคชไว้สูงสุด MAX_TILES แผ่น
    if (url.hostname === 'tile.openstreetmap.org') {
        event.respondWith((async () => {
            const cache = await caches.open(TILE_CACHE);
            const cached = await cache.match(req);
            if (cached) return cached;
            try {
                const res = await fetch(req);
                if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trimTiles(); }
                return res;
            } catch (e) { return Response.error(); }
        })());
    }
});
