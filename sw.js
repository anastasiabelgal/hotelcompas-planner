// Минимальный service worker — только чтобы Chrome/Android считал сайт устанавливаемым.
// Реального офлайн-кэширования нет: доска живёт на Firebase realtime-данных,
// показывать «протухшую» кэш-версию без сети было бы хуже, чем просто не открыться.

self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});

// Страницы (index.html, quiz.html) всегда проверяем на сервере: иначе после обновления
// браузер до 10 минут показывает старую версию из HTTP-кэша GitHub Pages.
self.addEventListener('fetch', function(event){
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request, { cache: 'no-cache' }));
    return;
  }
  event.respondWith(fetch(event.request));
});
