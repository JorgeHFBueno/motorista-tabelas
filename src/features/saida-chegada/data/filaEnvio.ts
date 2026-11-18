// A fila de envio da tela: uma por aba, com reenvio ao abrir, ao voltar a internet e ao voltar para o app. O envio só
// acontece com o app aberto (limite do navegador; no app Flutter também é assim).
import { getAuth } from 'firebase/auth';
import { useEffect, useSyncExternalStore } from 'react';
import { app } from '../../../firebase';
import { EnviadorAtividades } from '../domain/enviador';
import { listarPendentes, removerPendente, salvarPendente } from './armazenamentoLocal';
import { destinoFirebase } from './atividadesFirestore';

export const enviador = new EnviadorAtividades({
  armazenamento: { listarPendentes, salvarPendente, removerPendente },
  destino: destinoFirebase,
  uidAtual: () => getAuth(app).currentUser?.uid ?? null,
});

let iniciada = false;

/** Liga uma vez os gatilhos de reenvio e pede armazenamento persistente (o navegador pode apagar dados de sites). */
function iniciarFila() {
  if (iniciada) return;
  iniciada = true;
  window.addEventListener('online', () => void enviador.enviarPendentes({ forcar: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void enviador.enviarPendentes();
  });
  // Fechar a aba com envio pendente: o navegador pergunta se quer sair.
  window.addEventListener('beforeunload', (e) => {
    const { pendentes, enviando } = enviador.obterEstado();
    if (pendentes.length > 0 || enviando) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  navigator.storage?.persist?.().catch(() => undefined);
}

/** Estado da fila para a tela; ao montar, liga os gatilhos e tenta enviar o que estiver pendente. */
export function useFilaEnvio() {
  useEffect(() => {
    iniciarFila();
    void enviador.enviarPendentes();
  }, []);
  return useSyncExternalStore(enviador.assinar, enviador.obterEstado);
}
