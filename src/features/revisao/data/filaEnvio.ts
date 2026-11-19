// Envio das revisões ao Firebase, igual ao ManutencaoDestinoFirebase do app: fotos no Storage (sem sobrescrever) e o
// documento numa transação que também atualiza o medidor do veículo. Uma fila só por aba, com reenvio ao abrir a tela,
// ao voltar a internet e ao voltar para o app; o envio só acontece com o app aberto (limite do iPhone).
import { doc, runTransaction, serverTimestamp, type DocumentData, type UpdateData } from 'firebase/firestore';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { useEffect, useSyncExternalStore } from 'react';
import { app, db, storage } from '../../../firebase';
import type { ChecklistAutor } from '../../checklist-mecanico/domain/rascunho';
import { CAMPOS_DE_CRIACAO, deveAtualizarMedidor, montarDocumento } from '../domain/documento';
import { EnviadorRevisao, RevisaoJaFechada, type DestinoRevisao } from '../domain/enviador';
import { novaPendente, type RevisaoRegistro } from '../domain/registro';
import {
  carregarRegistro, lerArquivo, listarPendentes, removerPendentesAte, removerRegistro, salvarPendente,
} from './armazenamentoLocal';

const destinoFirebase: DestinoRevisao = {
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

  async gravar(p) {
    const { registro } = p;
    const documento = doc(db, 'manutencoes-v2', registro.id);
    const veiculo = doc(db, 'veiculos-v2', registro.veiculo.id);
    await runTransaction(db, async (tx) => {
      const existente = (await tx.get(documento)).data();
      const dadosVeiculo = await tx.get(veiculo);
      if (existente) {
        const revisaoServidor = typeof existente.revisao === 'number' ? existente.revisao : 0;
        if (revisaoServidor >= registro.revisao) return;
        if (existente.status === 'fechada') throw new RevisaoJaFechada();
      }
      const dados = montarDocumento(p, serverTimestamp());
      if (!existente) {
        tx.set(documento, dados);
      } else {
        for (const campo of CAMPOS_DE_CRIACAO) delete dados[campo];
        tx.update(documento, dados as UpdateData<DocumentData>);
      }
      const atual = (dadosVeiculo.data()?.operacional as { quilometragemUltima?: unknown } | undefined)?.quilometragemUltima;
      if (deveAtualizarMedidor({
        medidorNoServidor: existente?.medidor,
        veiculoExiste: dadosVeiculo.exists(),
        atual: typeof atual === 'number' ? Math.trunc(atual) : null,
        valor: registro.medidor,
        corrigido: registro.medidorCorrigido,
      })) {
        tx.update(veiculo, { 'operacional.quilometragemUltima': registro.medidor, 'operacional.dataUltimaAtualizacao': serverTimestamp() });
      }
    });
  },
};

export const enviador = new EnviadorRevisao({
  armazenamento: { listarPendentes, salvarPendente, removerPendentesAte, lerArquivo, carregarRegistro, removerRegistro },
  destino: destinoFirebase,
  uidAtual: () => getAuth(app).currentUser?.uid ?? null,
});

/** "Salvar": guarda a revisão na fila e dispara o envio. */
export async function enfileirar(registro: RevisaoRegistro, autor: ChecklistAutor): Promise<void> {
  await salvarPendente(novaPendente(registro, autor, new Date()));
  void enviador.enviarPendentes({ forcar: true });
}

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
export function useFilaRevisao() {
  useEffect(() => {
    iniciarFila();
    void enviador.enviarPendentes();
  }, []);
  return useSyncExternalStore(enviador.assinar, enviador.obterEstado);
}
