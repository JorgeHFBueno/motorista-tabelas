// Regras da API dos Pré-Fabricados (preFabricadosApi.ts), sem Firestore, para serem testadas: a chave, o Nº Pedido e os
// PDFs atuais de cada item do LOTE, como o detalhe da obra (/engenharia/obras/:id) os mostra (src/features/obras/
// preFabricados.ts: maisRecente e revisoes).
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/prefabricados-chaves-api.md e 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';

type AnyRecord = Record<string, any>;

/** Chave: "enpf_" + 40 letras e números (gerada em Cadastros → APIs, seção Pré-Fabricados, só adm2). */
export const formatoChavePreFabricados = (chave: unknown): chave is string => typeof chave === 'string' && /^enpf_[A-Za-z0-9]{40}$/.test(chave);
/** O banco guarda só o SHA-256 da chave (id do documento em prefabricados-chaves-api), nunca a chave. */
export const hashChavePreFabricados = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Quem a chave representa: chave não revogada de um funcionário ativo que vê a área Engenharia (ou adm2). */
export function pessoaDaChavePreFabricados(registro: AnyRecord | undefined, funcionario: AnyRecord | undefined): { uid: string; nome: string; adm2: boolean } | null {
  if (!registro || registro.revogada_em || typeof registro.uid !== 'string' || !registro.uid) return null;
  if (!veArea(funcionario, 'engenharia')) return null;
  return { uid: registro.uid, nome: String(funcionario.nome ?? registro.nome ?? ''), adm2: (funcionario.perfis as AnyRecord | undefined)?.adm2 === true };
}

/** Pedido que não pode ser atendido como veio (vira 400 com a mensagem). */
export class EntradaInvalida extends Error {}

/** Nº Pedido da rota (o mesmo número do Cód. Auxiliar da obra no Plannix): letras, números, ponto, hífen e barra baixa. */
export function pedidoDaRota(valor: string): string {
  let pedido = '';
  try { pedido = decodeURIComponent(valor).trim(); } catch { /* fica vazio e é recusado abaixo */ }
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(pedido)) throw new EntradaInvalida('Nº Pedido inválido.');
  return pedido;
}

/** Id do documento em obras-pre-fabricados-pdfs. */
export const pdfIdValido = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const dataIso = (v: unknown): string | null => {
  const d = v && typeof (v as AnyRecord).toDate === 'function' ? (v as AnyRecord).toDate() : v instanceof Date ? v : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
const tempo = (v: unknown) => (dataIso(v) ? Date.parse(dataIso(v)!) : 0);
const comparar = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare;

export type PdfDoItem = {
  item: string; produto: string; nome: string;
  /** 'console': o segundo PDF do item (o do console), com revisões próprias; 'principal': o PDF do item. */
  parte: 'principal' | 'console';
  /** PDF atual do item: o anexado por último. Rev. 0 é o primeiro; cada revisão soma um. */
  pdfId: string; revisao: number; revisoes: number; arquivo: string; tamanho: number; anexadoEm: string | null; anexadoPor: string;
};

/**
 * PDFs atuais dos itens do LOTE (documentos de obras-pre-fabricados-pdfs da obra): um por item ("produto|nome") e parte
 * (principal e Console), o mais recente, com o número da revisão como na tela (Rev. 0 é o mais antigo). Ordem: produto,
 * nome e parte (o principal antes do Console).
 */
export function pdfsAtuaisDoLote(docs: { id: string; data: AnyRecord | undefined }[], loteId: string): PdfDoItem[] {
  const porItem = new Map<string, { item: string; parte: PdfDoItem['parte']; lista: { id: string; data: AnyRecord }[] }>();
  for (const { id, data } of docs) {
    if (!data || data.lote !== loteId || !texto(data.item)) continue;
    const parte = data.parte === 'console' ? 'console' : 'principal';
    const chave = `${data.item}\u0000${parte}`;
    const atual = porItem.get(chave) ?? { item: data.item, parte, lista: [] };
    porItem.set(chave, { ...atual, lista: [...atual.lista, { id, data }] });
  }
  return [...porItem.values()].map(({ item, parte, lista }) => {
    const ordem = [...lista].sort((a, b) => tempo(a.data.anexadoEm) - tempo(b.data.anexadoEm) || a.id.localeCompare(b.id));
    const atual = ordem[ordem.length - 1];
    const [produto, ...resto] = item.split('|');
    return {
      item, produto, nome: resto.join('|'), parte,
      pdfId: atual.id, revisao: ordem.length - 1, revisoes: ordem.length, arquivo: texto(atual.data.nome), tamanho: Number(atual.data.tamanho) || 0,
      anexadoEm: dataIso(atual.data.anexadoEm), anexadoPor: texto(atual.data.anexadoPor?.nome),
    };
  }).sort((a, b) => comparar(a.produto, b.produto) || comparar(a.nome, b.nome) || Number(a.parte === 'console') - Number(b.parte === 'console'));
}

/**
 * Sincronizar com o Plannix (2026-11-25): a fila do robô em plannix-sincronizacoes, um documento por LOTE
 * ({obraId}__{lote}). A tela pede, aprova a prévia e cancela (Rules); o robô avança o resto por POST /sincronizacoes/{id}:
 * pedido → simulando → previa (com o texto da prévia) e, depois da aprovação, aprovado → gravando → concluido; qualquer
 * passo do robô pode terminar em erro (com a mensagem).
 */
export const STATUS_SINCRONIZACAO = ['pedido', 'simulando', 'previa', 'aprovado', 'gravando', 'concluido', 'erro', 'cancelado'] as const;
export type StatusSincronizacao = typeof STATUS_SINCRONIZACAO[number];
/** Status em que a sincronização espera o robô: GET /sincronizacoes lista só estes. */
export const ESPERANDO_O_ROBO: StatusSincronizacao[] = ['pedido', 'aprovado'];
const PASSOS_DO_ROBO: Partial<Record<StatusSincronizacao, StatusSincronizacao[]>> = {
  pedido: ['simulando', 'erro'],
  simulando: ['previa', 'erro'],
  aprovado: ['gravando', 'erro'],
  gravando: ['concluido', 'erro'],
};
export const LIMITE_PREVIA = 20000;
export const LIMITE_MENSAGEM = 2000;

/** Id do documento em plannix-sincronizacoes: {obraId}__{lote}. */
export const sincronizacaoIdValido = (id: string) => /^[A-Za-z0-9_-]{1,100}__[A-Za-z0-9_-]{1,100}$/.test(id);

/** O status atual não permite o passo pedido (vira 409). */
export class StatusFora extends Error {}

/**
 * O que o robô grava no POST: o status seguinte (só os passos de PASSOS_DO_ROBO), a prévia (obrigatória em 'previa', só
 * nele) e a mensagem (obrigatória em 'erro'; opcional nos outros).
 */
export function passoDoRobo(atual: unknown, corpo: unknown): { status: StatusSincronizacao; previa?: string; mensagem?: string } {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new EntradaInvalida('Envie um JSON com "status".');
  const { status, previa, mensagem, ...resto } = corpo as AnyRecord;
  if (Object.keys(resto).length) throw new EntradaInvalida(`Campos desconhecidos: ${Object.keys(resto).join(', ')}.`);
  if (!STATUS_SINCRONIZACAO.includes(status)) throw new EntradaInvalida(`"status" deve ser um de: ${STATUS_SINCRONIZACAO.join(', ')}.`);
  if (previa !== undefined && (status !== 'previa' || typeof previa !== 'string')) throw new EntradaInvalida('"previa" só vai, como texto, com o status "previa".');
  if (mensagem !== undefined && typeof mensagem !== 'string') throw new EntradaInvalida('"mensagem" deve ser texto.');
  const textoPrevia = texto(previa);
  const textoMensagem = texto(mensagem);
  if (status === 'previa' && !textoPrevia) throw new EntradaInvalida('O status "previa" precisa do texto da prévia em "previa".');
  if (status === 'erro' && !textoMensagem) throw new EntradaInvalida('O status "erro" precisa do motivo em "mensagem".');
  if (textoPrevia.length > LIMITE_PREVIA) throw new EntradaInvalida(`A prévia passa de ${LIMITE_PREVIA} caracteres.`);
  if (textoMensagem.length > LIMITE_MENSAGEM) throw new EntradaInvalida(`A mensagem passa de ${LIMITE_MENSAGEM} caracteres.`);
  const possiveis = PASSOS_DO_ROBO[atual as StatusSincronizacao] ?? [];
  if (!possiveis.includes(status)) {
    throw new StatusFora(`A sincronização está em "${String(atual)}": o robô ${possiveis.length ? `só pode passar para ${possiveis.join(' ou ')}` : 'não muda mais nada nela'}.`);
  }
  return { status, ...(textoPrevia ? { previa: textoPrevia } : {}), ...(textoMensagem ? { mensagem: textoMensagem } : {}) };
}

/** A sincronização como o robô a recebe: datas em ISO, pessoas pelo nome. */
export function sincronizacaoParaRobo(id: string, d: AnyRecord, nomes: { obra?: string; lote?: string } = {}) {
  return {
    id, obraId: texto(d.obraId), obra: nomes.obra ?? '', lote: texto(d.lote), loteNome: nomes.lote ?? '', pedido: texto(d.pedido),
    plannix: Number(d.plannix) || null, status: texto(d.status),
    pedidoPor: texto(d.pedidoPor?.nome), pedidoEm: dataIso(d.pedidoEm),
    aprovadoPor: texto(d.aprovadoPor?.nome) || null, aprovadoEm: dataIso(d.aprovadoEm),
    previa: texto(d.previa) || null, mensagem: texto(d.mensagem) || null, atualizadoEm: dataIso(d.atualizadoEm),
  };
}
