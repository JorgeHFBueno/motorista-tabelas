// Envio dos checklists ao Firebase, igual ao ChecklistDestinoFirebase do app: arquivos no Storage (sem sobrescrever)
// e o documento numa transação que também atualiza o medidor do veículo. Uma fila só por aba, com reenvio ao abrir a
// tela, ao voltar a internet e ao voltar para o app; o envio só acontece com o app aberto (limite do iPhone).
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { useEffect, useSyncExternalStore } from 'react';
import { app, db, storage } from '../../../firebase';
import { deveAtualizarMedidor, montarDocumento } from '../domain/documento';
import { EnviadorChecklist, type DestinoChecklist } from '../domain/enviador';
import type { ChecklistPendente } from '../domain/rascunho';
import {
  apagarArquivosDoChecklist, lerArquivo, listarPendentes, removerPendente, salvarPendente,
} from './armazenamentoLocal';

const destinoFirebase: DestinoChecklist = {
  async arquivoExiste(caminho) {
    try {
      await getMetadata(ref(storage, caminho));
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'storage/object-not-found') return false;
      throw error;
    }
  },

  async enviarArquivo(caminho, arquivo) {
    await uploadBytes(ref(storage, caminho), arquivo, { contentType: 'image/jpeg' });
  },

  async gravar(pendente: ChecklistPendente) {
    const { rascunho } = pendente;
    const checklist = doc(db, 'checklists-v2', rascunho.id);
    const veiculo = doc(db, 'veiculos-v2', rascunho.veiculo.id);
    await runTransaction(db, async (tx) => {
      if ((await tx.get(checklist)).exists()) return;
      const dadosVeiculo = await tx.get(veiculo);
      tx.set(checklist, montarDocumento(pendente, serverTimestamp()));
      const atual = (dadosVeiculo.data()?.operacional as { quilometragemUltima?: unknown } | undefined)?.quilometragemUltima;
      // Só baixa o medidor com a correção confirmada pelo mecânico; sem ela, outro registro pode ter chegado antes.
      if (deveAtualizarMedidor({
        veiculoExiste: dadosVeiculo.exists(),
        atual: typeof atual === 'number' ? Math.trunc(atual) : null,
        valor: rascunho.medidor,
        corrigido: rascunho.medidorCorrigido,
      })) {
        tx.update(veiculo, { 'operacional.quilometragemUltima': rascunho.medidor, 'operacional.dataUltimaAtualizacao': serverTimestamp() });
      }
    });
  },
};

export const enviador = new EnviadorChecklist({
  armazenamento: { listarPendentes, salvarPendente, removerPendente, lerArquivo, apagarArquivosDoChecklist },
  destino: destinoFirebase,
  uidAtual: () => getAuth(app).currentUser?.uid ?? null,
});

let iniciada = false;

/** Liga uma vez os gatilhos de reenvio e pede armazenamento persistente (o iPhone pode apagar dados de sites). */
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
    if (pendentes > 0 || enviando) {
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
