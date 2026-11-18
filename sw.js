// Service worker mínimo: permite instalar o site como app.
// Não guarda dados da loja no aparelho: tudo é buscado na internet a cada uso.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
