// Cronograma Logístico (WEB /logistica/cronograma): quando uma programação passa para o status "Ag. NF", as pessoas
// atribuídas em logistica-config/pedidoNota (até 3, com logistica ou adm2) recebem no sino o aviso
// "Novo Pedido de Nota - Expedição XXXX", que abre o cronograma. Quem mudou o status não recebe.
// Regras: logisticaPedidoNotaDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { avisoPedidoNota, destinatariosPedidoNota, entrouEmAgNf, idAvisoPedidoNota, idsAgNf } from './logisticaPedidoNotaDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

export const logisticaPedidoNota = onDocumentWritten(
  { document: 'logistica-programacoes/{programacaoId}', region: 'southamerica-east1' },
  async event => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!depois || antes?.status === depois.status) return;
    const [status, pedido] = await Promise.all([
      db.collection('logistica-config').doc('status').get(),
      db.collection('logistica-config').doc('pedidoNota').get(),
    ]);
    if (!entrouEmAgNf(antes, depois, idsAgNf(status.data()?.etiquetas))) return;
    const atribuidos = pedido.data()?.atribuidos;
    if (!Array.isArray(atribuidos) || !atribuidos.length) return;
    const snaps = await db.getAll(...atribuidos.filter(u => typeof u === 'string' && u).slice(0, 3).map(u => db.collection('funcionarios').doc(u)));
    const para = destinatariosPedidoNota(atribuidos, depois.atualizadoPorUid, new Map(snaps.map(s => [s.id, s.data()])));
    if (!para.length) return;
    const aviso = avisoPedidoNota(event.params.programacaoId, depois);
    const gravados = await Promise.all(para.map(uid => db.collection('avisos').doc(uid).collection('itens').doc(idAvisoPedidoNota(event.id, uid))
      .create({ ...aviso, criadoEm: FieldValue.serverTimestamp() })
      .then(() => true, e => { if (jaExiste(e)) return false; throw e; })));
    logger.info('logisticaPedidoNota: avisos gravados', { programacao: event.params.programacaoId, destinatarios: para.length, novos: gravados.filter(Boolean).length });
  },
);
