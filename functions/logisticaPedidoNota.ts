// Cronograma Logístico (WEB /logistica/cronograma): avisos no sino para as pessoas de cada papel em
// logistica-config/pedidoNota (sem limite na tela), menos quem fez a alteração:
// - ADMINISTRATIVO (`atribuidos`, com logistica ou adm2): "Novo Pedido de Nota - Expedição XXXX" quando a programação
//   passa para o status "Ag. NF", e "Nota anexada - Expedição XXXX" quando ela recebe o PDF da nota (abrem o cronograma);
// - ENGENHARIA (`engenharia`, com engenharia ou adm2): "Fulano notificou a Engenharia sobre Ag. Lista de Materiais para
//   OBRA" quando a programação passa para "Ag. Lista de Materiais" (só a notificação, sem tela).
// Também põe na fila do robô do ERP (logistica-pedidos-nota, lida pela cronoLogApi) a programação que passa para "Ag. NF"
// sem nota, com ou sem atribuídos (2026-11-27).
// Regras: logisticaPedidoNotaDominio.ts. Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { comGrupo } from './avisosGrupo.js';
import {
  avisoListaMateriais, avisoNotaAnexada, avisoPedidoNota, destinatariosPedidoNota, deveEnfileirar, entrouEmAgNf, entrouEmListaMateriais,
  idAvisoListaMateriais, idAvisoNotaAnexada, idAvisoPedidoNota, idsAgNf, idsListaMateriais, recebeuNota, temNota, uidsDoPapel,
} from './logisticaPedidoNotaDominio.js';

const jaExiste = (e: unknown) => {
  const err = e as { code?: unknown; message?: unknown };
  return err?.code === 6 || err?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err?.message ?? ''));
};

/**
 * Pedido de nota na fila do robô (logistica-pedidos-nota/{programação}): `pedido`, com quem pediu. Não mexe no que o
 * robô já assumiu (`gerando`) nem repete na nova tentativa do mesmo evento; o resto (concluído, erro, cancelado) volta a
 * ser pedido.
 */
async function enfileirarPedidoNota(id: string, p: Record<string, any>, eventoId: string) {
  const ref = db.collection('logistica-pedidos-nota').doc(id);
  const enfileirou = await db.runTransaction(async t => {
    if (!deveEnfileirar((await t.get(ref)).data(), eventoId)) return false;
    t.set(ref, {
      schemaVersion: 1, programacaoId: id, status: 'pedido', evento: eventoId,
      pedidoPor: { uid: String(p.atualizadoPorUid ?? ''), nome: String(p.atualizadoPorNome ?? '') },
      pedidoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (enfileirou) logger.info('logisticaPedidoNota: pedido de nota na fila do robô', { programacao: id });
}

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
    const etiquetas = status?.data()?.etiquetas;
    const id = event.params.programacaoId;
    const papeis = { administrativo: pedido.data()?.atribuidos, engenharia: pedido.data()?.engenharia };
    const agNf = !!status && entrouEmAgNf(antes, depois, idsAgNf(etiquetas));
    if (agNf && !temNota(depois)) await enfileirarPedidoNota(id, depois, event.id);
    const avisos = [
      ...(agNf
        ? [{ aviso: avisoPedidoNota(id, depois), idDoAviso: idAvisoPedidoNota, lista: papeis.administrativo, area: 'logistica' as const }] : []),
      ...(nota ? [{ aviso: avisoNotaAnexada(id, depois), idDoAviso: idAvisoNotaAnexada, lista: papeis.administrativo, area: 'logistica' as const }] : []),
      ...(status && entrouEmListaMateriais(antes, depois, idsListaMateriais(etiquetas))
        ? [{ aviso: avisoListaMateriais(id, depois), idDoAviso: idAvisoListaMateriais, lista: papeis.engenharia, area: 'engenharia' as const }] : []),
    ].filter(a => uidsDoPapel(a.lista).length);
    if (!avisos.length) return;
    const uids = [...new Set(avisos.flatMap(a => uidsDoPapel(a.lista)))];
    const snaps = await db.getAll(...uids.map(u => db.collection('funcionarios').doc(u)));
    const funcionarios = new Map(snaps.map(s => [s.id, s.data()]));
    const gravacoes = avisos.flatMap(({ aviso, idDoAviso, lista, area }) => {
      const para = destinatariosPedidoNota(lista, depois.atualizadoPorUid, funcionarios, area);
      // Grupo do acontecimento (reações): quem recebe e quem mudou a linha.
      const doGrupo = comGrupo(aviso, `${aviso.tipo}:${event.id}`, [depois.atualizadoPorUid, ...para]);
      return para.map(uid =>
        db.collection('avisos').doc(uid).collection('itens').doc(idDoAviso(event.id, uid))
          .create({ ...doGrupo, criadoEm: FieldValue.serverTimestamp() })
          .then(() => true, e => { if (jaExiste(e)) return false; throw e; }));
    });
    if (!gravacoes.length) return;
    const gravados = await Promise.all(gravacoes);
    logger.info('logisticaPedidoNota: avisos gravados', {
      programacao: id, tipos: avisos.map(a => a.aviso.tipo), destinatarios: gravacoes.length, novos: gravados.filter(Boolean).length,
    });
  },
);
