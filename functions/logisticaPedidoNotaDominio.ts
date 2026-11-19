// Regras puras dos avisos do Cronograma Logístico (sem Firebase; teste em test/logisticaPedidoNota.test.mjs):
// "Novo Pedido de Nota" e "Nota anexada" para o papel ADMINISTRATIVO (`atribuidos`) e o aviso de "Ag. Lista de
// Materiais" para o papel ENGENHARIA (`engenharia`), em logistica-config/pedidoNota.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';

type AnyRecord = Record<string, any>;

/** Nome da etiqueta que dispara o aviso. A programação grava o id da etiqueta; as linhas de antes, o nome. */
export const NOME_AG_NF = 'Ag. NF';
/** Id da etiqueta "Ag. NF" enquanto ninguém salvou outra lista (domain/status.ts da WEB). */
export const ID_AG_NF_PADRAO = '2';
/** A etiqueta que avisa a ENGENHARIA, e o id dela enquanto ninguém salvou outra lista. */
export const NOME_LISTA_MATERIAIS = 'Ag. Lista de Materiais';
export const ID_LISTA_MATERIAIS_PADRAO = '14';
/** Sem limite na tela (decisão de 2026-11-17); este é só o teto técnico por papel. */
export const MAX_ATRIBUIDOS = 50;
export const ROTA_CRONOGRAMA = '/logistica/cronograma';

const normal = (t: unknown) => (typeof t === 'string' ? t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() : '');

/** Ids da etiqueta com esse nome na lista salva (ou o id padrão, sem lista). */
export function idsDaEtiqueta(etiquetas: unknown, nome: string, padrao: string): Set<string> {
  if (!Array.isArray(etiquetas)) return new Set([padrao]);
  return new Set(etiquetas.filter(e => e && typeof e.id === 'string' && normal(e.nome) === normal(nome)).map(e => e.id as string));
}

/** O status é a etiqueta: pelo id ou, nas linhas de antes, pelo nome. */
export function ehStatus(status: unknown, ids: Set<string>, nome: string): boolean {
  return typeof status === 'string' && status !== '' && (ids.has(status) || normal(status) === normal(nome));
}

/** Passou para a etiqueta agora (antes era outro status, ou a linha é nova). */
export function entrouEm(antes: AnyRecord | undefined, depois: AnyRecord | undefined, ids: Set<string>, nome: string): boolean {
  return !!depois && ehStatus(depois.status, ids, nome) && !ehStatus(antes?.status, ids, nome);
}

/** Ids que valem como "Ag. NF". */
export const idsAgNf = (etiquetas: unknown) => idsDaEtiqueta(etiquetas, NOME_AG_NF, ID_AG_NF_PADRAO);
export const ehAgNf = (status: unknown, ids: Set<string>) => ehStatus(status, ids, NOME_AG_NF);
/** Passou para "Ag. NF" agora. */
export const entrouEmAgNf = (antes: AnyRecord | undefined, depois: AnyRecord | undefined, ids: Set<string>) => entrouEm(antes, depois, ids, NOME_AG_NF);
/** Ids que valem como "Ag. Lista de Materiais". */
export const idsListaMateriais = (etiquetas: unknown) => idsDaEtiqueta(etiquetas, NOME_LISTA_MATERIAIS, ID_LISTA_MATERIAIS_PADRAO);
/** Passou para "Ag. Lista de Materiais" agora. */
export const entrouEmListaMateriais = (antes: AnyRecord | undefined, depois: AnyRecord | undefined, ids: Set<string>) =>
  entrouEm(antes, depois, ids, NOME_LISTA_MATERIAIS);

/** Caminhos dos PDFs da nota: `notas` (a lista, desde 2026-11-19) e `nota` (um PDF só, de antes). */
export function caminhosDaNota(p: AnyRecord | undefined): Set<string> {
  const itens = [...(Array.isArray(p?.notas) ? p.notas : []), p?.nota];
  return new Set(itens.map(n => n?.caminho).filter((c): c is string => typeof c === 'string' && c !== ''));
}

/** A programação tem algum PDF na nota. */
export const temNota = (p: AnyRecord | undefined) => caminhosDaNota(p).size > 0;

/** Recebeu um PDF novo agora (um caminho que antes não estava); tirar um PDF não conta. */
export function recebeuNota(antes: AnyRecord | undefined, depois: AnyRecord | undefined): boolean {
  const antigos = caminhosDaNota(antes);
  return [...caminhosDaNota(depois)].some(c => !antigos.has(c));
}

/** Rota do aviso do ADMINISTRATIVO: o cronograma já na linha (a WEB centraliza e destaca a programação). */
export const rotaDaProgramacao = (programacaoId: string) => `${ROTA_CRONOGRAMA}?programacao=${encodeURIComponent(programacaoId)}`;

/** UIDs distintos da lista de um papel (até o teto técnico). */
export function uidsDoPapel(lista: unknown): string[] {
  const uids = Array.isArray(lista) ? lista.filter((u): u is string => typeof u === 'string' && u !== '') : [];
  return [...new Set(uids)].slice(0, MAX_ATRIBUIDOS);
}

/**
 * Quem recebe: os UIDs do papel, ativos e que veem a área do papel (ADMINISTRATIVO: logistica; ENGENHARIA: engenharia;
 * adm2 vê todas), menos quem fez a alteração.
 */
export function destinatariosPedidoNota(atribuidos: unknown, autor: unknown, funcionarios: Map<string, AnyRecord | undefined>, area: 'logistica' | 'engenharia' = 'logistica'): string[] {
  return uidsDoPapel(atribuidos).filter(uid => uid !== autor && veArea(funcionarios.get(uid), area));
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
    rota: rotaDaProgramacao(programacaoId), local: 'Cronograma Logístico',
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

/**
 * Aviso para a ENGENHARIA quando a programação passa para "Ag. Lista de Materiais": só quem mudou, o status e a obra
 * ("Mateus notificou a Engenharia sobre Ag. Lista de Materiais para COQ — Coqueiros"). Sem rota: só a notificação.
 */
export function avisoListaMateriais(programacaoId: string, p: AnyRecord) {
  const obra = typeof p.obra?.nome === 'string' && p.obra.nome.trim() ? p.obra.nome.trim() : 'programação sem obra';
  const quem = typeof p.atualizadoPorNome === 'string' && p.atualizadoPorNome.trim() ? p.atualizadoPorNome.trim() : 'Alguém';
  return {
    area: 'logistica', tipo: 'lista_materiais',
    titulo: `${quem} notificou a Engenharia sobre ${NOME_LISTA_MATERIAIS} para ${obra}`.slice(0, 200),
    mensagem: '',
    rota: null, local: 'Cronograma Logístico',
    origem: { colecao: 'logistica-programacoes', id: programacaoId },
    lida: false,
  };
}

/** Id estável por evento e pessoa: a nova tentativa da Function não repete o aviso. */
export const idAvisoPedidoNota = idAviso('pnf');
export const idAvisoNotaAnexada = idAviso('nta');
export const idAvisoListaMateriais = idAviso('alm');
