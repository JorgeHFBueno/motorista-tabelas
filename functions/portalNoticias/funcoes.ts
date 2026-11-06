// Functions of the external news of the client portal: every 12 hours and "Buscar notícias externas agora" (adm2).
// They write portal-noticias with the Admin SDK (no Rules), so the callable checks the caller here.
// Contract: The Manuscript, 01_FIRESTORE/COLECOES/portal.md (portal-noticias).
import { FieldValue, Timestamp, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { db } from '../firebaseAdmin.js';
import { temCredencial } from '../credenciais.js';
import { COLECAO_NOTICIAS } from './config.js';
import { executarColeta, type ResumoColeta } from './coleta.js';
import type { NoticiaExistente, NoticiasStore } from './salvar.js';

const REGIAO = 'southamerica-east1';
const LOTE = 400;

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');
const textoOuNulo = (valor: unknown) => (typeof valor === 'string' && valor ? valor : null);

function paraExistente(doc: DocumentSnapshot<DocumentData>): NoticiaExistente {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    titulo: texto(d.titulo),
    resumo: texto(d.resumo),
    url: textoOuNulo(d.url),
    imagemUrl: textoOuNulo(d.imagemUrl),
    fonte: texto(d.fonte),
    tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
    hashDedupe: textoOuNulo(d.hashDedupe),
    relevanciaScore: typeof d.relevanciaScore === 'number' ? d.relevanciaScore : null,
    publicadoEm: d.publicadoEm instanceof Timestamp ? d.publicadoEm.toDate() : null,
    status: d.status,
    excluidoEm: d.excluidoEm,
    semExcluidoEm: !('excluidoEm' in d),
    semStatus: !('status' in d),
  };
}

const store: NoticiasStore = {
  async externasDaCategoria(categoria) {
    const snap = await db.collection(COLECAO_NOTICIAS).where('categoria', '==', categoria).where('origem', '==', 'externa').get();
    return snap.docs.map(paraExistente);
  },
  async criar(dados) {
    const ref = db.collection(COLECAO_NOTICIAS).doc();
    await ref.set({
      ...dados,
      publicadoEm: Timestamp.fromDate(dados.publicadoEm),
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    return ref.id;
  },
  async atualizar(id, dados) {
    await db.collection(COLECAO_NOTICIAS).doc(id).update({
      ...dados,
      publicadoEm: Timestamp.fromDate(dados.publicadoEm),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  },
  async rebaixar(ids) {
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = db.batch();
      for (const id of ids.slice(i, i + LOTE)) {
        lote.update(db.collection(COLECAO_NOTICIAS).doc(id), { status: 'rascunho', atualizadoEm: FieldValue.serverTimestamp() });
      }
      await lote.commit();
    }
  },
};

async function coletar(origem: 'agenda' | 'manual', uid?: string): Promise<ResumoColeta> {
  const { resumo, categorias } = await executarColeta(store);
  logger.info('portal-noticias:coleta', { origem, uid, ...resumo, categorias });
  return resumo;
}

export const portalNoticiasColeta = onSchedule(
  { schedule: 'every 12 hours', timeZone: 'America/Sao_Paulo', region: REGIAO, timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    await coletar('agenda');
  },
);

/** "Buscar notícias externas agora": active employee with engenharia or escritorio (or adm2). Returns the run summary. */
export const portalNoticiasAtualizar = onCall({ region: REGIAO, timeoutSeconds: 300, memory: '512MiB' }, async (request): Promise<ResumoColeta> => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
  const funcionario = await db.collection('funcionarios').doc(uid).get();
  if (!temCredencial(funcionario.data(), 'engenharia', 'escritorio')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
  try {
    return await coletar('manual', uid);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    logger.error('portal-noticias:coleta', { origem: 'manual', uid, mensagem });
    throw new HttpsError('internal', mensagem.slice(0, 300));
  }
});
