// Минимальный service worker — только чтобы Chrome/Android считал сайт устанавливаемым.
// Реального офлайн-кэширования нет: доска живёт на Firebase realtime-данных,
// показывать «протухшую» кэш-версию без сети было бы хуже, чем просто не открыться.

self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event){
  event.respondWith(fetch(event.request));
});
