// Pré-fabricados de cada LOTE no detalhe da obra (/engenharia/obras/:id): os itens, o Tipo e o Status chegam por uma
// API externa (ainda sem endereço nem chave: ver carregarPreFabricados em obrasData.ts); os PDFs e as revisões são
// anexados na tela. The Manuscript, 03_APLICACAO_WEB/07_ENGENHARIA_E_CRONOOBRA.md#obras.

export type PdfPreFabricado = { id: string; nome: string; tamanho: number; anexadoEm: Date; anexadoPor: string; url: string | null };
export type PreFabricado = { id: string; tipo: string; status: string; pdfs: PdfPreFabricado[] };

/**
 * Status dos pré-fabricados — PROVISÓRIO: os nomes que a API vai mandar ainda não estão definidos. Para corrigir,
 * troque só esta lista:
 * - `nome`: exatamente como vier da API (comparado sem diferença de maiúsculas/acentos);
 * - `cor`: a cor do chip (cores do tema);
 * - `concluido`: marca o status final; no grupo recolhido ele só aparece se todos os itens estiverem nele;
 * - a ordem: do mais urgente para o menos; desempata o status do grupo recolhido quando dois aparecem igual.
 * Um status que não estiver aqui aparece com o nome que veio, em chip sem cor, e perde os desempates.
 */
export const STATUS_PRE_FABRICADO: { nome: string; cor: 'success' | 'info' | 'warning' | 'default'; concluido?: boolean }[] = [
  { nome: 'Revisar', cor: 'warning' },
  { nome: 'Em análise', cor: 'info' },
  { nome: 'Pendente', cor: 'default' },
  { nome: 'Concluído', cor: 'success', concluido: true },
];

const normalizarStatus = (status: string) => status.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const configDoStatus = (status: string) =>
  STATUS_PRE_FABRICADO.find((item) => normalizarStatus(item.nome) === normalizarStatus(status));
const ordemDoStatus = (status: string) => {
  const config = configDoStatus(status);
  return config ? STATUS_PRE_FABRICADO.indexOf(config) : STATUS_PRE_FABRICADO.length;
};

/**
 * Status do grupo recolhido: o que mais aparece entre os itens que não estão concluídos (empate: o mais urgente da
 * lista). Só fica "concluído" quando todos os itens estão concluídos. Itens sem status não contam.
 */
export function statusDoGrupo(itens: PreFabricado[]): string {
  const comStatus = itens.filter((item) => item.status.trim());
  const abertos = comStatus.filter((item) => !configDoStatus(item.status)?.concluido);
  if (!abertos.length) return comStatus.length && comStatus.length === itens.length ? comStatus[0].status : '';
  const contagem = new Map<string, number>();
  for (const item of abertos) contagem.set(item.status, (contagem.get(item.status) ?? 0) + 1);
  return [...contagem].sort(([a, qa], [b, qb]) => qb - qa || ordemDoStatus(a) - ordemDoStatus(b))[0][0];
}

/** Todos os PDFs (revisões incluídas): o número do botão Revisões. */
export const totalPdfs = (itens: PreFabricado[]) => itens.reduce((total, item) => total + item.pdfs.length, 0);
/** Itens com ao menos um PDF: "N de M com PDF" no grupo recolhido. */
export const comPdf = (itens: PreFabricado[]) => itens.filter((item) => item.pdfs.length > 0).length;

export const maisRecente = (pdfs: PdfPreFabricado[]) =>
  pdfs.reduce<PdfPreFabricado | null>((atual, item) => (!atual || item.anexadoEm > atual.anexadoEm ? item : atual), null);

/** Revisões do mais novo para o mais antigo; a mais antiga é a Rev. 0. */
export const revisoes = (pdfs: PdfPreFabricado[]) => [...pdfs]
  .sort((a, b) => a.anexadoEm.getTime() - b.anexadoEm.getTime())
  .map((item, revisao) => ({ item, revisao }))
  .reverse();

/** Grupo do Tipo: o nome sem o número do fim ("Pilar 2" → "Pilar"), na ordem em que aparece. */
export function agruparPorTipo(itens: PreFabricado[]): { nome: string; itens: PreFabricado[] }[] {
  const grupos = new Map<string, PreFabricado[]>();
  for (const item of itens) {
    const nome = item.tipo.replace(/\s*\d+$/, '').trim() || item.tipo || 'Sem tipo';
    grupos.set(nome, [...(grupos.get(nome) ?? []), item]);
  }
  return [...grupos].map(([nome, doGrupo]) => ({ nome, itens: doGrupo }));
}
