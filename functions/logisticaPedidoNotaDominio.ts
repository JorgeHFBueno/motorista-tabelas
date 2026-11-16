// Regras puras dos avisos "Novo Pedido de Nota" e "Nota anexada" do Cronograma Logístico (sem Firebase; teste em
// test/logisticaPedidoNota.test.mjs). Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';

type AnyRecord = Record<string, any>;

/** Nome da etiqueta que dispara o aviso. A programação grava o id da etiqueta; as linhas de antes, o nome. */
export const NOME_AG_NF = 'Ag. NF';
/** Id da etiqueta "Ag. NF" enquanto ninguém salvou outra lista (domain/status.ts da WEB). */
export const ID_AG_NF_PADRAO = '2';
export const MAX_ATRIBUIDOS = 3;
export const ROTA_CRONOGRAMA = '/logistica/cronograma';

const normal = (t: unknown) => (typeof t === 'string' ? t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() : '');

/** Ids que valem como "Ag. NF": o da etiqueta com esse nome na lista salva (ou o padrão, sem lista). */
export function idsAgNf(etiquetas: unknown): Set<string> {
  if (!Array.isArray(etiquetas)) return new Set([ID_AG_NF_PADRAO]);
  return new Set(etiquetas.filter(e => e && typeof e.id === 'string' && normal(e.nome) === normal(NOME_AG_NF)).map(e => e.id as string));
}

/** O status é "Ag. NF": pelo id da etiqueta ou, nas linhas de antes, pelo nome. */
export function ehAgNf(status: unknown, ids: Set<string>): boolean {
  return typeof status === 'string' && status !== '' && (ids.has(status) || normal(status) === normal(NOME_AG_NF));
}

/** Passou para "Ag. NF" agora (antes era outro status, ou a linha é nova). */
export function entrouEmAgNf(antes: AnyRecord | undefined, depois: AnyRecord | undefined, ids: Set<string>): boolean {
  return !!depois && ehAgNf(depois.status, ids) && !ehAgNf(antes?.status, ids);
}

/** A programação tem o PDF da nota. */
export const temNota = (p: AnyRecord | undefined) => typeof p?.nota?.caminho === 'string' && p.nota.caminho !== '';

/** Recebeu o PDF agora (antes não tinha); trocar o PDF não conta. */
export function recebeuNota(antes: AnyRecord | undefined, depois: AnyRecord | undefined): boolean {
  return temNota(depois) && !temNota(antes);
}

/** Atribuídos válidos: até 3 UIDs distintos, ativos e com a área logistica ou adm2, menos quem fez a alteração. */
export function destinatariosPedidoNota(atribuidos: unknown, autor: unknown, funcionarios: Map<string, AnyRecord | undefined>): string[] {
  const uids = Array.isArray(atribuidos) ? atribuidos.filter((u): u is string => typeof u === 'string' && u !== '') : [];
  return [...new Set(uids)].slice(0, MAX_ATRIBUIDOS).filter(uid => uid !== autor && veArea(funcionarios.get(uid), 'logistica'));
}

function aviso(programacaoId: string, p: AnyRecord, tipo: string, titulo: string, acao: string) {
  const expedicao = typeof p.expedicao === 'string' && p.expedicao.trim() ? p.expedicao.trim() : '(sem número)';
  const obra = typeof p.obra?.nome === 'string' ? p.obra.nome.trim() : '';
  const item = typeof p.item === 'string' ? p.item.trim() : '';
  const quem = typeof p.atualizadoPorNome === 'string' ? p.atualizadoPorNome.trim() : '';
  return {
    area: 'logistica', tipo,
    titulo: `${titulo} - Expedição ${expedicao}`.slice(0, 200),
    mensagem: [item, obra, quem && `${acao} por ${quem}`].filter(Boolean).join(' · ').slice(0, 300),
    rota: ROTA_CRONOGRAMA, local: 'Cronograma Logístico',
    origem: { colecao: 'logistica-programacoes', id: programacaoId },
    lida: false,
  };
}

/** Aviso no sino do sistema (avisos/{uid}/itens), sem o criadoEm (hora do servidor, posta na gravação). */
export const avisoPedidoNota = (programacaoId: string, p: AnyRecord) => aviso(programacaoId, p, 'pedido_nota', 'Novo Pedido de Nota', 'pedido');

/** Aviso de que o PDF da nota foi anexado (a linha vai para Em viagem pela WEB). */
export const avisoNotaAnexada = (programacaoId: string, p: AnyRecord) => aviso(programacaoId, p, 'nota_anexada', 'Nota anexada', 'anexada');

const idAviso = (prefixo: string) => (eventoId: string, uid: string) =>
  `${prefixo}_${createHash('sha256').update(`${eventoId}|${uid}`).digest('hex').slice(0, 28)}`;

/** Id estável por evento e pessoa: a nova tentativa da Function não repete o aviso. */
export const idAvisoPedidoNota = idAviso('pnf');
export const idAvisoNotaAnexada = idAviso('nta');
