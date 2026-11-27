// Cronograma Logístico (WEB /logistica/cronograma): quem é marcado com @ numa observação recebe no sino "Fulano
// mencionou você em <item>", com o trecho; o clique abre a linha com o painel nas Observações. Só quem está ativo e vê
// a área Logística (ou adm2), menos o autor. Observação sem marcados: nenhuma leitura. Na edição pelo autor, só quem
// entrou agora em `marcados` (logisticaObservacaoMencaoEditada); edição sem marcado novo: nenhuma leitura.
// Regras: logisticaObservacaoMencaoDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { comGrupo } from './avisosGrupo.js';
import { avisoDeMarcacao, destinatariosDaMarcacao, idAvisoMarcacao, marcadosDa, marcadosNovos } from './logisticaObservacaoMencaoDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

/**
 * Avisa `novos` (os marcados da criação, ou quem entrou na edição). Lê a programação e todos os marcados do texto, para
 * o trecho trazer os nomes de quem já estava marcado.
 */
async function avisarMarcados(observacaoId: string, observacao: DocumentData, novos: string[], origem: string) {
  const [programacao, ...snaps] = await db.getAll(
    db.collection('logistica-programacoes').doc(String(observacao.programacaoId)),
    ...[...new Set([...marcadosDa(observacao), ...novos])].map(u => db.collection('funcionarios').doc(u)),
  );
  const funcionarios = new Map(snaps.map(s => [s.id, s.data()]));
  const autor = observacao.autor?.uid;
  const para = destinatariosDaMarcacao(novos, autor, funcionarios);
  if (!para.length) return;
  const nome = (uid: string) => {
    const n = funcionarios.get(uid)?.nome;
    return typeof n === 'string' && n.trim() ? n.trim() : undefined;
  };
  // Grupo do acontecimento (reações): quem escreveu e quem foi marcado.
  const aviso = comGrupo(avisoDeMarcacao({ observacaoId, observacao, programacao: programacao.data(), nome }), `mencao:${observacaoId}`, [autor, ...para]);
  const gravados = await Promise.all(para.map(uid =>
    db.collection('avisos').doc(uid).collection('itens').doc(idAvisoMarcacao(observacaoId, uid))
      .create({ ...aviso, criadoEm: FieldValue.serverTimestamp() })
      .then(() => true, e => { if (jaExiste(e)) return false; throw e; })));
  logger.info(`${origem}: avisos gravados`, {
    observacao: observacaoId, marcados: novos.length, destinatarios: para.length, novos: gravados.filter(Boolean).length,
  });
}

export const logisticaObservacaoMencao = onDocumentCreated(
  { document: 'logistica-observacoes/{observacaoId}', region: 'southamerica-east1' },
  async event => {
    const observacao = event.data?.data();
    const marcados = marcadosDa(observacao);
    if (!observacao || !marcados.length) return;
    await avisarMarcados(event.params.observacaoId, observacao, marcados, 'logisticaObservacaoMencao');
  },
);

export const logisticaObservacaoMencaoEditada = onDocumentUpdated(
  { document: 'logistica-observacoes/{observacaoId}', region: 'southamerica-east1' },
  async event => {
    const observacao = event.data?.after.data();
    const marcados = marcadosNovos(event.data?.before.data(), observacao);
    if (!observacao || !marcados.length) return;
    await avisarMarcados(event.params.observacaoId, observacao, marcados, 'logisticaObservacaoMencaoEditada');
  },
);
