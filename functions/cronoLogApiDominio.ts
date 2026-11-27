// Regras da API do CronoLog (Cronograma Logístico, cronoLogApi.ts), sem Firestore, para serem testadas: a chave, a fila
// de pedidos de nota (logistica-pedidos-nota, um documento por programação), o PDF que o robô traz para a Nota e a
// observação com a equipe marcada quando ele não consegue.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/cronolog-chaves-api.md, 01_FIRESTORE/COLECOES/logistica.md e
// 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
import { createHash } from 'node:crypto';
import { veArea } from './credenciais.js';
import { ehAgNf, idsDaEtiqueta, temNota, uidsDoPapel } from './logisticaPedidoNotaDominio.js';

type AnyRecord = Record<string, any>;

/** Chave: "lgcr_" + 40 letras e números (gerada em Cadastros → APIs, seção CronoLog, só adm2). */
export const formatoChaveCronoLog = (chave: unknown): chave is string => typeof chave === 'string' && /^lgcr_[A-Za-z0-9]{40}$/.test(chave);
/** O banco guarda só o SHA-256 da chave (id do documento em cronolog-chaves-api), nunca a chave. */
export const hashChaveCronoLog = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Quem a chave representa: chave não revogada de um funcionário ativo que vê a área Logística (ou adm2). */
export function pessoaDaChaveCronoLog(registro: AnyRecord | undefined, funcionario: AnyRecord | undefined): { uid: string; nome: string; adm2: boolean } | null {
  if (!registro || registro.revogada_em || typeof registro.uid !== 'string' || !registro.uid) return null;
  if (!veArea(funcionario, 'logistica')) return null;
  return { uid: registro.uid, nome: String(funcionario.nome ?? registro.nome ?? ''), adm2: (funcionario.perfis as AnyRecord | undefined)?.adm2 === true };
}

/** Pedido que não pode ser atendido como veio (vira 400 com a mensagem). */
export class EntradaInvalida extends Error {}
/** O status atual não permite o passo pedido (vira 409). */
export class StatusFora extends Error {}

/**
 * Fila do robô: a Function logisticaPedidoNota põe a programação em `pedido` quando ela passa para Ag. NF sem nota. O
 * robô assume (`gerando`), gera a nota no ERP pela Expedição e manda o PDF (→ `concluido`), ou conta o erro (→ `erro`,
 * com a observação marcando o ADMINISTRATIVO). `cancelado`: a linha saiu de Ag. NF, recebeu nota à mão ou foi excluída
 * antes de o robô assumir.
 */
export const STATUS_PEDIDO_NOTA = ['pedido', 'gerando', 'concluido', 'erro', 'cancelado'] as const;
export type StatusPedidoNota = typeof STATUS_PEDIDO_NOTA[number];
/** Os que GET /pedidos-nota lista: os que esperam o robô e os que estão com ele (o robô que reinicia acha os seus). */
export const COM_O_ROBO: StatusPedidoNota[] = ['pedido', 'gerando'];
/** De onde o PDF da nota é aceito. */
export const RECEBEM_NOTA: StatusPedidoNota[] = ['pedido', 'gerando'];
const PASSOS: Partial<Record<StatusPedidoNota, StatusPedidoNota[]>> = { pedido: ['gerando', 'erro'], gerando: ['erro'] };
export const LIMITE_MENSAGEM = 1500;
/** O mesmo teto do PDF da nota na WEB e nas Rules do Storage. */
export const LIMITE_PDF = 25 * 1024 * 1024;
/** O mesmo teto de PDFs na nota (MAX_NOTAS da WEB). */
export const MAX_NOTAS = 10;
/** Teto de marcados numa observação (Rules e WEB). */
export const MAX_MARCADOS = 20;

/** Id de logistica-programacoes (o mesmo id na fila). */
export const programacaoIdValido = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const dataIso = (v: unknown): string | null => {
  const d = v && typeof (v as AnyRecord).toDate === 'function' ? (v as AnyRecord).toDate() : v instanceof Date ? v : null;
  return d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/** POST /pedidos-nota/{id}: { "status": "gerando" } assume; { "status": "erro", "mensagem": "…" } conta o erro. */
export function passoDoPedidoNota(atual: unknown, corpo: unknown): { status: StatusPedidoNota; mensagem?: string } {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new EntradaInvalida('Envie um JSON com "status".');
  const { status, mensagem, ...resto } = corpo as AnyRecord;
  if (Object.keys(resto).length) throw new EntradaInvalida(`Campos desconhecidos: ${Object.keys(resto).join(', ')}.`);
  if (status !== 'gerando' && status !== 'erro') throw new EntradaInvalida('"status" deve ser "gerando" ou "erro" (o PDF vai em POST /pedidos-nota/{id}/nota).');
  if (mensagem !== undefined && typeof mensagem !== 'string') throw new EntradaInvalida('"mensagem" deve ser texto.');
  const textoMensagem = texto(mensagem);
  if (status === 'erro' && !textoMensagem) throw new EntradaInvalida('O status "erro" precisa do motivo em "mensagem".');
  if (status === 'gerando' && textoMensagem) throw new EntradaInvalida('"mensagem" só vai com o status "erro".');
  if (textoMensagem.length > LIMITE_MENSAGEM) throw new EntradaInvalida(`A mensagem passa de ${LIMITE_MENSAGEM} caracteres.`);
  const possiveis = PASSOS[atual as StatusPedidoNota] ?? [];
  if (!possiveis.includes(status)) {
    throw new StatusFora(`O pedido de nota está em "${String(atual)}": ${possiveis.length ? `só pode passar para ${possiveis.join(' ou ')}` : 'o robô não muda mais nada nele'}.`);
  }
  return { status, ...(textoMensagem ? { mensagem: textoMensagem } : {}) };
}

/** A programação ainda pede nota: existe, está em Ag. NF e não tem PDF na nota. */
export const aindaPedeNota = (programacao: AnyRecord | undefined, etiquetas: unknown) =>
  !!programacao && ehAgNf(programacao.status, idsDaEtiqueta(etiquetas, 'Ag. NF', '2')) && !temNota(programacao);

/** O pedido como o robô o recebe: o que ele precisa para achar a venda no ERP (a Expedição) e para conferir. */
export function pedidoParaRobo(id: string, fila: AnyRecord, programacao: AnyRecord | undefined) {
  const p = programacao ?? {};
  return {
    id, status: texto(fila.status), expedicao: texto(p.expedicao), cod: typeof p.cod === 'number' ? p.cod : null,
    item: texto(p.item), obra: texto(p.obra?.nome) || null, inicio: texto(p.inicio) || null, fim: texto(p.fim) || null,
    pedidoPor: texto(fila.pedidoPor?.nome), pedidoEm: dataIso(fila.pedidoEm), atualizadoEm: dataIso(fila.atualizadoEm),
    mensagem: texto(fila.mensagem) || null,
  };
}

/** O corpo é um PDF (começa com "%PDF-"), de 1 byte até 25 MB. */
export function conferirPdf(dados: unknown): Buffer {
  if (!Buffer.isBuffer(dados) || !dados.length) throw new EntradaInvalida('Envie o PDF no corpo (Content-Type: application/pdf).');
  if (dados.length > LIMITE_PDF) throw new EntradaInvalida('PDF maior que 25 MB.');
  if (dados.subarray(0, 5).toString('latin1') !== '%PDF-') throw new EntradaInvalida('O corpo não é um PDF.');
  return dados;
}

/** Nome do arquivo: o `nome` da rota (sem barras, até 200, terminado em .pdf) ou "NF Expedição <n>.pdf". */
export function nomeDoPdf(nome: unknown, expedicao: unknown): string {
  const limpo = texto(nome).replace(/[/\\\u0000-\u001f]/g, '_').slice(0, 196);
  const base = limpo || `NF Expedição ${texto(expedicao) || 'sem número'}`.slice(0, 196);
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** Id da etiqueta "Em viagem" (o primeiro PDF da nota leva a ela, como a automação da WEB), ou null sem ela na lista. */
export function idEmViagem(etiquetas: unknown): string | null {
  return [...idsDaEtiqueta(etiquetas, 'Em viagem', '1')][0] ?? null;
}

/**
 * Alteração da programação com o PDF do robô: o item no fim de `notas` (a lista da WEB, sem mexer no `nota` de antes)
 * e, se a linha não tinha PDF, o Status Em viagem (a automação da WEB). A assinatura e o atualizadoEm vão na gravação.
 */
export function alteracaoComNota(programacao: AnyRecord, nota: { caminho: string; url: string; nome: string; tamanho: number }, etiquetas: unknown) {
  const notas = (Array.isArray(programacao.notas) ? programacao.notas : [])
    .filter((n: AnyRecord) => n && typeof n.caminho === 'string' && typeof n.url === 'string')
    .map(({ caminho, url, nome, tamanho }: AnyRecord) => ({ caminho, url, nome, tamanho }));
  const antiga = programacao.nota && typeof programacao.nota.caminho === 'string' && !notas.some((n: AnyRecord) => n.caminho === programacao.nota.caminho) ? 1 : 0;
  if (notas.length + antiga >= MAX_NOTAS) throw new StatusFora(`A nota já tem ${MAX_NOTAS} PDFs, o máximo.`);
  const status = temNota(programacao) ? null : idEmViagem(etiquetas);
  return { notas: [...notas, nota], ...(status !== null && status !== programacao.status ? { status } : {}) };
}

/** Quem a observação de erro marca: o ADMINISTRATIVO do Atribuir (logistica-config/pedidoNota), menos o autor. */
export const marcadosDoErro = (atribuidos: unknown, autor: string) => uidsDoPapel(atribuidos).filter((u) => u !== autor && !u.includes('/')).slice(0, MAX_MARCADOS);

/** Texto da observação de erro: o motivo e, na última linha, as marcas @{uid} (o texto cabe nos 2000 das Rules). */
export function textoDoErro(mensagem: string, marcados: string[]): string {
  const marcas = marcados.map((u) => `@{${u}}`).join(' ');
  const corpo = `Robô do ERP não gerou a nota: ${mensagem}`.slice(0, 2000 - marcas.length - 2);
  return marcas ? `${corpo}\n\n${marcas}` : corpo;
}
