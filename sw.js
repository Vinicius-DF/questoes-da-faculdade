const CACHE_NAME = 'questoes-offline-v1';
const PRECACHE_ASSETS = [
  '',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// Instalação do Service Worker e pre-cache dos arquivos básicos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pré-cacheando arquivos essenciais...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Força o Service Worker a se tornar ativo imediatamente
      return self.skipWaiting();
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // Reivindica o controle de todos os clientes imediatamente
      return self.clients.claim();
    })
  );
});

// Interceptação de requisições e estratégias de cache inteligente
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Apenas interceptar requisições HTTP/HTTPS (ignora chrome-extension, etc)
  if (!url.protocol.startsWith('http')) return;

  // Ignorar chamadas de API ou requisições de métodos diferentes de GET
  if (request.method !== 'GET') return;

  // Estratégia para arquivos HTML: Network-First (Rede Primeiro, senão Cache)
  // Isso garante que o usuário sempre veja a versão mais atualizada se tiver internet,
  // mas o app abra perfeitamente a partir do cache se estiver offline.
  if (request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Salva uma cópia da página atualizada no cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Se falhar (offline), busca a página do cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Se nem a rota específica nem o index.html estiverem no cache (improvável), fallback para root
            return caches.match('/');
          });
        })
    );
    return;
  }

  // Estratégia para Ativos Estáticos (JS, CSS, imagens, fontes, CDNs): Cache-First (Cache Primeiro, senão Rede)
  // Isso acelera muito o carregamento e garante o funcionamento offline de todos os scripts e estilos.
  const isStaticAsset = 
    url.pathname.includes('/assets/') || 
    url.pathname.endsWith('.js') || 
    url.pathname.endsWith('.css') || 
    url.pathname.endsWith('.png') || 
    url.pathname.endsWith('.jpg') || 
    url.pathname.endsWith('.jpeg') || 
    url.pathname.endsWith('.svg') || 
    url.pathname.endsWith('.json') || 
    url.pathname.endsWith('.woff2') ||
    url.host.includes('fonts.googleapis.com') ||
    url.host.includes('fonts.gstatic.com') ||
    url.host.includes('cdn.tailwindcss.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Se já está no cache, retorna instantaneamente
          return cachedResponse;
        }

        // Caso contrário, busca na rede, armazena no cache e retorna
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Para qualquer outra requisição (ex: telemetria, requisições de dados em tempo real): Network-Only (Rede apenas)
  event.respondWith(fetch(request));
});
