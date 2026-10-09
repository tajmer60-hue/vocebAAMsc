/* Service worker офлайн-режима для «10 000 слов».
   v2.1.0 — исправлено: ошибки сети/404 больше НЕ кэшируются и НЕ показываются
   вместо приложения. При любом сбое сети отдаём закэшированную копию тренажёра. */
'use strict';
var V = 'vocab10k-v2.2.0';
var CORE = ['./', './index.html', './manifest.webmanifest', './icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(V).then(function (c) {
      // кэшируем по одному: один неудачный файл не должен ломать установку
      return Promise.all(CORE.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== V; })
                           .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function offlinePage() {
  return new Response(
    '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Нет сети</title></head>' +
    '<body style="font:16px -apple-system,Arial,sans-serif;background:#0e1119;color:#e9edf7;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
    '<div>📡 Нет связи с сервером, и копии страницы ещё нет в кэше.<br>' +
    '<button onclick="location.reload()" style="margin-top:14px;padding:10px 22px;border:0;' +
    'border-radius:12px;background:#5b8cff;color:#fff;font-size:15px;font-weight:600">' +
    'Повторить</button></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация (открытие страниц): сначала сеть, но показываем ТОЛЬКО успешный ответ.
  // Любая ошибка (404, 503, обрыв сети) -> отдаём закэшированную копию приложения.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var cp = res.clone();
          caches.open(V).then(function (c) { c.put('./index.html', cp); });
          return res;
        }
        // сервер ответил ошибкой (например, 404 во время пере публикации) — не показываем её
        return caches.match('./index.html').then(function (hit) { return hit || res; });
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) { return hit || offlinePage(); });
      })
    );
    return;
  }

  // Остальные файлы: сначала кэш, потом сеть с докэшированием успешных ответов.
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var cp = res.clone();
          caches.open(V).then(function (c) { c.put(e.request, cp); });
        }
        return res;
      }).catch(function () {
        if (e.request.destination === 'document') {
          return caches.match('./index.html').then(function (hit2) { return hit2 || offlinePage(); });
        }
        return Response.error();
      });
    })
  );
});
