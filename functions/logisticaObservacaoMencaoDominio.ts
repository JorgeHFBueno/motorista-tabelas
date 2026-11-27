// Regras puras do aviso de marcação (@) nas observações do Cronograma Logístico (sem Firebase; teste em
// test/logisticaObservacaoMencao.test.mjs). Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md e avisos.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';
import { ROTA_CRONOGRAMA } from './logisticaPedidoNotaDominio.js';

type AnyRecord = Record<string, any>;

/** Teto de marcados numa observação (o mesmo das Rules e da WEB). */
export const MAX_MARCADOS = 20;

/** UIDs marcados, sem repetir e sem vazios (até o teto). */
export function marcadosDa(observacao: AnyRecord | undefined): string[] {
  const lista = Array.isArray(observacao?.marcados) ? observacao!.marcados : [];
  return [...new Set(lista.filter((u: unknown): u is string => typeof u === 'string' && u !== '' && !u.includes('/')))].slice(0, MAX_MARCADOS);
}

/** Quem recebe: os marcados ativos que veem a área Logística (adm2 vê todas), menos o autor. */
export function destinatariosDaMarcacao(marcados: string[], autor: unknown, funcionarios: Map<string, AnyRecord | undefined>): string[] {
  return marcados.filter(uid => uid !== autor && veArea(funcionarios.get(uid), 'logistica'));
}

/** Texto com as marcas @{uid} trocadas por @Nome ("alguém" quando o UID não tem nome). */
export function textoComNomes(texto: unknown, nome: (uid: string) => string | undefined): string {
  return typeof texto === 'string' ? texto.replace(/@\{([^{}\s]+)\}/g, (_m, uid: string) => `@${nome(uid) || 'alguém'}`) : '';
}

/** Rota do aviso: o cronograma na linha, com o painel aberto nas Observações. */
export const rotaDasObservacoes = (programacaoId: string) =>
  `${ROTA_CRONOGRAMA}?programacao=${encodeURIComponent(programacaoId)}&aba=observacoes`;

/**
 * Aviso de marcação, sem o criadoEm (hora do servidor, posta na gravação): "mencionou você em <item>", o trecho da
 * observação com os nomes, quem escreveu e a rota da linha nas Observações.
 */
export function avisoDeMarcacao(a: { observacaoId: string; observacao: AnyRecord; programacao: AnyRecord | undefined; nome: (uid: string) => string | undefined }) {
  const item = typeof a.programacao?.item === 'string' && a.programacao.item.trim() ? a.programacao.item.trim() : 'uma programação';
  const expedicao = typeof a.programacao?.expedicao === 'string' && a.programacao.expedicao.trim() ? ` (Expedição ${a.programacao.expedicao.trim()})` : '';
  const autor = a.observacao.autor ?? {};
  const anexos = Array.isArray(a.observacao.anexos) ? a.observacao.anexos.length : 0;
  const texto = textoComNomes(a.observacao.texto, a.nome).trim() || (anexos ? `${anexos} arquivo(s) anexado(s)` : '');
  return {
    area: 'logistica', tipo: 'mencao',
    titulo: `mencionou você em ${item}${expedicao}`.slice(0, 200),
    mensagem: texto.slice(0, 300),
    rota: rotaDasObservacoes(String(a.observacao.programacaoId)),
    local: 'Cronograma Logístico',
    deUid: typeof autor.uid === 'string' ? autor.uid : null,
    deNome: typeof autor.nome === 'string' ? autor.nome.trim().slice(0, 120) : '',
    origem: { colecao: 'logistica-observacoes', id: a.observacaoId },
    lida: false,
  };
}

/** Id estável por observação e pessoa: a nova tentativa da Function não repete o aviso. */
export const idAvisoMarcacao = (observacaoId: string, uid: string) =>
  `lom_${createHash('sha256').update(`${observacaoId}|${uid}`).digest('hex').slice(0, 28)}`;
