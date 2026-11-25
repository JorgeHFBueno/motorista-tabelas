// Combustível (app): aviso no sino para todo adm2 ativo quando o app abre um chamado "Conflito no Montante" em
// 00-chamados (divergência entre o montante informado e o do sistema). Substitui a tela Notificações do app, que lia
// a coleção notificacoes. Regras: combustivelDivergenciaDominio.ts. Contrato: The Manuscript, avisos.md.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { comGrupo } from './avisosGrupo.js';
import { avisoDivergencia, destinatariosDivergencia, ehDivergencia, idAvisoDivergencia } from './combustivelDivergenciaDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

export const combustivelDivergencia = onDocumentCreated(
  { document: '00-chamados/{chamadoId}', region: 'southamerica-east1' },
  async event => {
    const chamado = event.data?.data();
    if (!ehDivergencia(chamado)) return;
    const id = event.params.chamadoId;
    const [adm2, motorista] = await Promise.all([
      db.collection('funcionarios').where('perfis.adm2', '==', true).get(),
      typeof chamado!.motorista === 'string' && chamado!.motorista ? db.collection('funcionarios').doc(chamado!.motorista).get() : null,
    ]);
    const nome = typeof motorista?.data()?.nome === 'string' ? (motorista!.data()!.nome as string).trim() : null;
    const aviso = avisoDivergencia(id, chamado!, nome);
    const uids = destinatariosDivergencia(adm2.docs.map(d => ({ id: d.id, data: d.data() })));
    // Grupo do acontecimento (reações): os adm2 avisados e o motorista que abriu o chamado.
    const doGrupo = comGrupo(aviso, `divergencia:${id}`, [chamado!.motorista, ...uids]);
    const gravados = await Promise.all(uids.map(uid =>
      db.collection('avisos').doc(uid).collection('itens').doc(idAvisoDivergencia(id, uid))
        .create({ ...doGrupo, criadoEm: FieldValue.serverTimestamp() })
        .then(() => true, e => { if (jaExiste(e)) return false; throw e; })));
    logger.info('combustivelDivergencia: avisos gravados', { chamado: id, destinatarios: uids.length, novos: gravados.filter(Boolean).length });
  },
);
