// Cronograma Logístico (WEB /logistica/cronograma): as pessoas atribuídas em logistica-config/pedidoNota (até 3, com
// logistica ou adm2) recebem no sino, abrindo o cronograma:
// - "Novo Pedido de Nota - Expedição XXXX" quando uma programação passa para o status "Ag. NF";
// - "Nota anexada - Expedição XXXX" quando a programação recebe o PDF da nota.
// Quem fez a alteração não recebe. Regras: logisticaPedidoNotaDominio.ts. Contrato: The Manuscript,
// 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import {
  avisoNotaAnexada, avisoPedidoNota, destinatariosPedidoNota, entrouEmAgNf, idAvisoNotaAnexada, idAvisoPedidoNota, idsAgNf, recebeuNota,
} from './logisticaPedidoNotaDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

export const logisticaPedidoNota = onDocumentWritten(
  { document: 'logistica-programacoes/{programacaoId}', region: 'southamerica-east1' },
  async event => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!depois) return;
    const mudouStatus = antes?.status !== depois.status;
    const nota = recebeuNota(antes, depois);
    if (!mudouStatus && !nota) return;
    const [status, pedido] = await Promise.all([
      mudouStatus ? db.collection('logistica-config').doc('status').get() : null,
      db.collection('logistica-config').doc('pedidoNota').get(),
    ]);
    const avisos = [
      ...(status && entrouEmAgNf(antes, depois, idsAgNf(status.data()?.etiquetas))
        ? [{ aviso: avisoPedidoNota(event.params.programacaoId, depois), id: idAvisoPedidoNota }] : []),
      ...(nota ? [{ aviso: avisoNotaAnexada(event.params.programacaoId, depois), id: idAvisoNotaAnexada }] : []),
    ];
    if (!avisos.length) return;
    const atribuidos = pedido.data()?.atribuidos;
    if (!Array.isArray(atribuidos) || !atribuidos.length) return;
    const snaps = await db.getAll(...atribuidos.filter(u => typeof u === 'string' && u).slice(0, 3).map(u => db.collection('funcionarios').doc(u)));
    const para = destinatariosPedidoNota(atribuidos, depois.atualizadoPorUid, new Map(snaps.map(s => [s.id, s.data()])));
    if (!para.length) return;
    const gravados = await Promise.all(avisos.flatMap(({ aviso, id }) => para.map(uid => db.collection('avisos').doc(uid).collection('itens').doc(id(event.id, uid))
      .create({ ...aviso, criadoEm: FieldValue.serverTimestamp() })
      .then(() => true, e => { if (jaExiste(e)) return false; throw e; }))));
    logger.info('logisticaPedidoNota: avisos gravados', {
      programacao: event.params.programacaoId, tipos: avisos.map(a => a.aviso.tipo), destinatarios: para.length, novos: gravados.filter(Boolean).length,
    });
  },
);
