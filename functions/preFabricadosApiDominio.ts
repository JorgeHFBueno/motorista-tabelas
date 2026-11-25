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
