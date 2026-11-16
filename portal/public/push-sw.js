/* Push dos avisos do sistema (avisos/{uid}/itens), enviado pela Function avisosPush pelo Firebase Cloud Messaging
 * (só dados: avisoId, titulo, mensagem, url). É o service worker do portal, registrado em src/services/notifications/push.service.ts.
 * Cópia de public/push-sw.js da WEB, com o ícone do portal.
 * - Com o sistema visível, não mostra nada: o sino do cabeçalho já mostra o aviso.
 * - O clique abre a url do aviso (a rota com ?aviso=<id>, que a tela marca como lido). */
const ICONE_AVISO = '/LdL.png';

self.addEventListener('push', (event) => {
  let dados = {};
  try { dados = (event.data && event.data.json().data) || {}; } catch (e) { dados = {}; }
  if (!dados.titulo) return;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (janelas.some((janela) => janela.visibilityState === 'visible')) return;
    await self.registration.showNotification(dados.titulo, {
      body: dados.mensagem || '',
      tag: dados.avisoId,
      icon: ICONE_AVISO,
      data: { url: dados.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((janela) => janela.url.startsWith(self.location.origin));
    if (aberta) {
      await aberta.focus();
      try { await aberta.navigate(url); return; } catch (e) { /* janela fora do controle deste service worker */ }
    }
    await self.clients.openWindow(url);
  })());
});
