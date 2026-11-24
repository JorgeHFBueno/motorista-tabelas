// Pré-fabricados de cada LOTE no detalhe da obra (/engenharia/obras/:id), vindos do Plannix pela Function
// plannixPreFabricados: cada item é uma peça do projeto (ex.: P01) com os códigos de controle das peças e a etapa de
// produção de cada uma; sem projeto, as linhas do Lançamento Final. O LOTE se liga à obra do Plannix pelo Nº Pedido do
// Friday (= Cód. Auxiliar no Plannix). The Manuscript, 03_APLICACAO_WEB/07_ENGENHARIA_E_CRONOOBRA.md#obras.

/** `caminho`: o arquivo no Storage (PDFs gravados); `url`: o endereço já pronto (PDFs do /testes/mki, em memória). */
export type PdfPreFabricado = { id: string; nome: string; tamanho: number; anexadoEm: Date; anexadoPor: string; url: string | null; caminho?: string };
/** Uma peça (código de controle do Plannix) e a etapa de produção em que está. */
export type PecaPreFabricado = { codigo: string; etapa: string; data: string | null };
export type PreFabricado = {
  id: string;
  /** "produto|nome" do item no Plannix: liga os PDFs gravados (`obras-pre-fabricados-pdfs.item`) ao item. */
  chave?: string;
  /** Produto no Plannix (PILAR, VIGA…): o grupo que abre e fecha. */
  grupo: string;
  /** Nome da peça no projeto (ex.: P01) ou, sem projeto, a linha do Lançamento Final. */
  tipo: string;
  /** Peças previstas: as do projeto ou a quantidade do Lançamento Final. */
  quantidade: number;
  /** Peças com código; vazio enquanto o projeto não foi cadastrado no Plannix. */
  pecas: PecaPreFabricado[];
  /** Nomes dos desenhos no Plannix (a API não entrega o arquivo). */
  desenhos: string[];
  pdfs: PdfPreFabricado[];
};

/**
 * Etapas de produção do Plannix (campo `processo` de exportaStatusProducao), da projeção à montagem. A ordem é a da
 * produção e ordena o resumo. Uma etapa que não estiver aqui aparece com o nome que veio, depois das conhecidas.
 */
export const ETAPAS_PLANNIX: { nome: string; rotulo: string; cor: 'default' | 'info' | 'primary' | 'success' }[] = [
  { nome: 'PROJETADA', rotulo: 'Projetada', cor: 'default' },
  { nome: 'PROGRAMADA', rotulo: 'Programada', cor: 'default' },
  { nome: 'CORTE DOBRA', rotulo: 'Corte e dobra', cor: 'info' },
  { nome: 'ARMACAO', rotulo: 'Armação', cor: 'info' },
  { nome: 'FORMA', rotulo: 'Forma', cor: 'info' },
  { nome: 'CONCRETAGEM', rotulo: 'Concretagem', cor: 'info' },
  { nome: 'ACABADA', rotulo: 'Acabada', cor: 'primary' },
  { nome: 'EXPEDIDA', rotulo: 'Expedida', cor: 'success' },
  { nome: 'MONTADA', rotulo: 'Montada', cor: 'success' },
];

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export function etapaPlannix(etapa: string) {
  const conhecida = ETAPAS_PLANNIX.find((item) => item.nome === normalizar(etapa));
  return {
    rotulo: conhecida?.rotulo ?? (etapa.trim() || 'Sem etapa'),
    cor: conhecida?.cor ?? 'default' as const,
    ordem: conhecida ? ETAPAS_PLANNIX.indexOf(conhecida) : ETAPAS_PLANNIX.length,
  };
}

/** Quantas peças há em cada etapa, na ordem da produção (ex.: 3 Corte e dobra · 4 Acabada · 3 Expedida). */
export function resumoEtapas(itens: PreFabricado[]) {
  const contagem = new Map<string, { rotulo: string; cor: ReturnType<typeof etapaPlannix>['cor']; ordem: number; quantidade: number }>();
  for (const peca of itens.flatMap((item) => item.pecas)) {
    const etapa = etapaPlannix(peca.etapa);
    const atual = contagem.get(etapa.rotulo) ?? { ...etapa, quantidade: 0 };
    contagem.set(etapa.rotulo, { ...atual, quantidade: atual.quantidade + 1 });
  }
  return [...contagem.values()].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo));
}

/** Peças previstas sem código ainda (projeto não cadastrado no Plannix). */
export const semProjeto = (itens: PreFabricado[]) => itens.reduce((total, item) => total + (item.pecas.length ? 0 : item.quantidade), 0);

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

/** "PILAR" → "Pilar": o nome do grupo na tela. */
const nomeDoGrupo = (grupo: string) => (grupo.trim() ? grupo.trim().charAt(0).toUpperCase() + grupo.trim().slice(1).toLowerCase() : 'Sem produto');

/** Itens agrupados pelo produto, na ordem em que aparecem. */
export function agruparPorTipo(itens: PreFabricado[]): { nome: string; itens: PreFabricado[] }[] {
  const grupos = new Map<string, PreFabricado[]>();
  for (const item of itens) {
    const nome = nomeDoGrupo(item.grupo);
    grupos.set(nome, [...(grupos.get(nome) ?? []), item]);
  }
  return [...grupos].map(([nome, doGrupo]) => ({ nome, itens: doGrupo }));
}

/** Resposta da Function plannixPreFabricados (mesmo formato de functions/plannixPreFabricados.ts). */
export type ItemPlannix = { produto: string; nome: string; secao: string; pecas: PecaPreFabricado[]; quantidade: number; desenhos: string[] };
export type LotePlannix =
  | { lote: string; pedido: string; codigo: number; sigla: string; nome: string; projeto: boolean; itens: ItemPlannix[] }
  | { lote: string; pedido: string; erro: 'nao-encontrada' }
  | { lote: string; pedido: string; erro: 'duplicada'; codigos: number[] };
/**
 * O que a lista mostra em cada LOTE: os itens, de onde vieram e o código da obra no Plannix (gravado com os PDFs), ou o
 * aviso de por que não há itens.
 */
export type PreFabricadosDoLote = { itens: PreFabricado[]; origem: string; plannix: number } | { aviso: string };

/** Chave do item do Plannix gravada com o PDF. */
export const chaveDoItem = (produto: string, nome: string) => `${produto}|${nome}`;

/** PDF gravado em obras-pre-fabricados-pdfs: o LOTE e o item a que pertence. */
export type PdfGravado = PdfPreFabricado & { caminho: string; lote: string; plannix: number; item: string };

/** Põe em cada item os PDFs gravados do mesmo LOTE e item (chave "produto|nome"). */
export function comPdfsGravados(lote: string, itens: PreFabricado[], pdfs: PdfGravado[]): PreFabricado[] {
  return itens.map((item) => ({ ...item, pdfs: pdfs.filter((pdf) => pdf.lote === lote && pdf.item === item.chave) }));
}

export const SEM_PEDIDO = 'Sem Nº Pedido: preencha a coluna "Nº Pedido/Cód. Auxiliar" deste LOTE no Friday (GESTÃO DE OBRAS).';

/**
 * Junta a resposta do Plannix aos LOTEs: cada LOTE se liga à obra do Plannix pelo Nº Pedido do Friday, que é o mesmo
 * número do Cód. Auxiliar da obra no Plannix.
 */
export function preFabricadosDoPlannix(lotes: { chave: string }[], resposta: LotePlannix[]): Record<string, PreFabricadosDoLote> {
  const porLote = new Map(resposta.map((lote) => [lote.lote, lote]));
  return Object.fromEntries(lotes.map((lote): [string, PreFabricadosDoLote] => {
    const doPlannix = porLote.get(lote.chave);
    if (!doPlannix) return [lote.chave, { aviso: SEM_PEDIDO }];
    if ('erro' in doPlannix) {
      return [lote.chave, { aviso: doPlannix.erro === 'duplicada'
        ? `O pedido ${doPlannix.pedido} está no Cód. Auxiliar de mais de uma obra do Plannix (${doPlannix.codigos.join(', ')}): deixe só na obra deste LOTE.`
        : `Pedido ${doPlannix.pedido} sem obra no Plannix: preencha o Cód. Auxiliar da obra deste LOTE no Plannix com ${doPlannix.pedido}.` }];
    }
    const origem = `Pedido ${doPlannix.pedido} · Plannix ${doPlannix.codigo} · ${doPlannix.sigla} · ${doPlannix.nome}${doPlannix.projeto ? '' : ' (sem projeto: Lançamento Final)'}`;
    const vistos = new Set<string>();
    const itens = doPlannix.itens.map((item, indice): PreFabricado => {
      const chave = chaveDoItem(item.produto, item.nome);
      const id = vistos.has(chave) ? `${doPlannix.codigo}|${chave}|${indice}` : `${doPlannix.codigo}|${chave}`;
      vistos.add(chave);
      return { id, chave, grupo: item.produto, tipo: item.nome, quantidade: item.quantidade, pecas: item.pecas, desenhos: item.desenhos, pdfs: [] };
    });
    return [lote.chave, { itens, origem, plannix: doPlannix.codigo }];
  }));
}
