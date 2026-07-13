// Service worker disabled - was causing cache conflicts with live API data
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
  )
  self.clients.claim()
})
self.addEventListener('fetch', () => {})
