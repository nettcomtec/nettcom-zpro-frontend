// Killswitch — desregistra Service Workers antigos do Quasar/PWA Vue e limpa caches.
// Necessário durante a migração Vue -> Next.js.
// Mantido por pelo menos 90 dias após o lançamento; remoção via comando explícito.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {}
      try {
        await self.registration.unregister();
      } catch (_) {}
      try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((c) => {
          try { c.navigate(c.url); } catch (_) {}
        });
      } catch (_) {}
    })()
  );
});

self.addEventListener("fetch", () => {
  // Não interceptar nada — deixa todas as requisições passarem direto para a rede.
});
