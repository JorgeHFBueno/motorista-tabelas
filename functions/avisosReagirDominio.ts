// Regras puras da reação aos avisos (sem Firebase; teste em test/avisosReagir.test.mjs).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md ("Reações").
import { createHash } from 'node:crypto';

type AnyRecord = Record<string, any>;

/** Os emojis da fileira do menu "Reagir" (decisão do responsável de 2026-11-25). */
export const EMOJIS = ['👍', '👀', '✅', '❤️', '🙏', '😂', '❌', '😡', '🫡'] as const;
export const emojiValido = (e: unknown): e is string => typeof e === 'string' && (EMOJIS as readonly string[]).includes(e);

/** O aviso aceita reação: tem grupo e quem reage está entre os envolvidos. */
export function aceitaReacao(aviso: AnyRecord | undefined, uid: string): boolean {
  return !!aviso && typeof aviso.grupo === 'string' && aviso.grupo !== '' && Array.isArray(aviso.envolvidos) && aviso.envolvidos.includes(uid);
}

/** Quem recebe o aviso da reação: todos os envolvidos (quem gerou e quem recebeu), menos quem reagiu. */
export function destinatariosReacao(envolvidos: unknown, reator: string): string[] {
  const lista = Array.isArray(envolvidos) ? envolvidos.filter((u): u is string => typeof u === 'string' && u !== '') : [];
  return [...new Set(lista)].filter(u => u !== reator);
}

/**
 * Aviso da reação, sem o criadoEm. O título vem depois do nome de quem reagiu ("Jorge reagiu 👍"); o detalhe é o
 * aviso original: o título dele, ou o trecho quando o título é relativo a quem recebeu ("mencionou você em…").
 * Não tem grupo: não se reage a uma reação.
 */
export function avisoDeReacao(original: AnyRecord, reator: { uid: string; nome: string }, emoji: string) {
  const titulo = typeof original.titulo === 'string' ? original.titulo.trim() : '';
  const mensagem = typeof original.mensagem === 'string' ? original.mensagem.trim() : '';
  const detalhe = typeof original.deNome === 'string' && original.deNome.trim() && mensagem ? mensagem : titulo;
  return {
    area: typeof original.area === 'string' ? original.area : 'sistema',
    tipo: 'reacao',
    titulo: `reagiu ${emoji}`,
    mensagem: detalhe.slice(0, 300),
    rota: typeof original.rota === 'string' ? original.rota : null,
    local: typeof original.local === 'string' ? original.local : null,
    deUid: reator.uid,
    deNome: reator.nome.slice(0, 120),
    origem: { colecao: 'avisos', id: String(original.grupo) },
    lida: false,
  };
}

/** Id estável do aviso de reação por grupo, quem reagiu e quem recebe: a nova tentativa não repete. */
export const idAvisoReacao = (grupo: string, reator: string, para: string) =>
  `rea_${createHash('sha256').update(`${grupo}|${reator}|${para}`).digest('hex').slice(0, 28)}`;
