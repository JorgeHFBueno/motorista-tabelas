// Aba Atividade do /testes/mki (pedido do responsável, 2026-11-26; ajustes da Engenharia no mesmo dia): o fluxo é
// Cadastros → Serviços → Pacotes. Cadastros são os itens da obra por categoria (Insumos, Pré-fabricados, Concreto,
// Ferramentas, Máquinas e Tarefas), com descrição e grupo; os Pré-fabricados são os tipos de peça dos LOTEs no Plannix
// (P01, VL…), com a quantidade de peças e quantas foram expedidas, e não se criam aqui. Um Serviço tem nome, descrição
// e itens dos cadastros. Um Pacote junta serviços e itens soltos dos cadastros; na Logística › Mestres, o pacote se
// vincula à alocação do mestre no CronoObra. Só os pré-fabricados têm quantidade (peças); usar mais peças do que o LOTE
// tem só avisa. Só teste: dados fictícios em memória.
import { ETAPAS_PLANNIX, etapaPlannix, type PreFabricado } from '../../obras/preFabricados';

export type CategoriaCadastro = 'insumos' | 'prefabricados' | 'concreto' | 'ferramentas' | 'maquinas' | 'tarefas';
export const CATEGORIAS_CADASTRO: { id: CategoriaCadastro; nome: string }[] = [
  { id: 'insumos', nome: 'Insumos' },
  { id: 'prefabricados', nome: 'Pré-fabricados' },
  { id: 'concreto', nome: 'Concreto' },
  { id: 'ferramentas', nome: 'Ferramentas' },
  { id: 'maquinas', nome: 'Máquinas' },
  { id: 'tarefas', nome: 'Tarefas' },
];
export const nomeDaCategoria = (id: CategoriaCadastro) => CATEGORIAS_CADASTRO.find((categoria) => categoria.id === id)?.nome ?? id;

/** Item dos cadastros. Pré-fabricado: um tipo de peça do LOTE (`lote`), com `quantidade` de peças e `expedidas`. */
export type ItemCadastro = { id: string; categoria: CategoriaCadastro; descricao: string; grupo: string; quantidade?: number; expedidas?: number; lote?: string };
/** Item num serviço ou pacote; `quantidade` só no pré-fabricado (quantas peças). */
export type ItemNoConjunto = { item: string; quantidade?: number };
export type Servico = { id: string; nome: string; descricao: string; itens: ItemNoConjunto[] };
export type Pacote = { id: string; nome: string; servicos: string[]; itens: ItemNoConjunto[] };

export const ehPreFabricado = (item: Pick<ItemCadastro, 'categoria'>) => item.categoria === 'prefabricados';

const EXPEDIDA = ETAPAS_PLANNIX.findIndex((etapa) => etapa.nome === 'EXPEDIDA');
/** Expedida ou depois (Montada); etapa desconhecida não conta. */
const expedida = (etapa: string) => {
  const { ordem } = etapaPlannix(etapa);
  return ordem >= EXPEDIDA && ordem < ETAPAS_PLANNIX.length;
};

/** Os tipos de peça dos LOTEs como itens de Pré-fabricados: grupo é o produto do Plannix; sem projeto, 0 expedidas. */
export function preFabricadosDosLotes(lotes: { chave: string; itens: PreFabricado[] | null }[]): ItemCadastro[] {
  return lotes.flatMap((lote) => (lote.itens ?? []).map((item): ItemCadastro => ({
    id: `pf:${lote.chave}:${item.id}`,
    categoria: 'prefabricados',
    descricao: item.tipo,
    grupo: item.grupo,
    quantidade: item.pecas.length || item.quantidade,
    expedidas: item.pecas.filter((peca) => expedida(peca.etapa)).length,
    lote: lote.chave,
  })));
}

const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base' }).compare;
/** Os grupos já usados na categoria, para sugerir nas próximas criações (sem repetir por maiúsculas; vale a 1ª grafia). */
export function gruposDaCategoria(itens: ItemCadastro[], categoria: CategoriaCadastro) {
  const grupos = new Map<string, string>();
  for (const item of itens) {
    const grupo = item.grupo.trim();
    if (item.categoria === categoria && grupo && !grupos.has(grupo.toLocaleLowerCase('pt-BR'))) grupos.set(grupo.toLocaleLowerCase('pt-BR'), grupo);
  }
  return [...grupos.values()].sort(comparar);
}

/** Leva o item à lista (uma vez só); o pré-fabricado entra com `pecas` peças (mínimo 1). */
export const adicionarItem = (itens: ItemNoConjunto[], item: ItemCadastro, pecas = 1): ItemNoConjunto[] =>
  (itens.some((i) => i.item === item.id) ? itens : [...itens, ehPreFabricado(item) ? { item: item.id, quantidade: Math.max(1, pecas) } : { item: item.id }]);
export const alterarQuantidade = (itens: ItemNoConjunto[], item: string, quantidade: number) =>
  itens.map((i) => (i.item === item ? { ...i, quantidade } : i));
export const removerItem = (itens: ItemNoConjunto[], item: string) => itens.filter((i) => i.item !== item);

/** Peças do tipo que o pacote usa: soltas e pelos serviços dele. */
export function pecasNoPacote(pacote: Pacote, servicos: Servico[], item: string) {
  const soma = (lista: ItemNoConjunto[]) => lista.filter((i) => i.item === item).reduce((total, i) => total + (i.quantidade ?? 0), 0);
  return soma(pacote.itens) + pacote.servicos.reduce((total, id) => total + soma(servicos.find((s) => s.id === id)?.itens ?? []), 0);
}
/** Peças do tipo usadas por todos os pacotes (o serviço sozinho é modelo: só conta dentro de um pacote). */
export const pecasUsadas = (pacotes: Pacote[], servicos: Servico[], item: string) =>
  pacotes.reduce((total, pacote) => total + pecasNoPacote(pacote, servicos, item), 0);
export const pecasLivres = (item: ItemCadastro, pacotes: Pacote[], servicos: Servico[]) =>
  Math.max(0, (item.quantidade ?? 0) - pecasUsadas(pacotes, servicos, item.id));

/** Aviso quando os pacotes usam mais peças do tipo do que o LOTE tem (não trava). */
export function avisoDasPecas(pacotes: Pacote[], servicos: Servico[], item: ItemCadastro): string | null {
  const usadas = pecasUsadas(pacotes, servicos, item.id);
  if (!ehPreFabricado(item) || usadas <= (item.quantidade ?? 0)) return null;
  const onde = pacotes.filter((pacote) => pecasNoPacote(pacote, servicos, item.id) > 0).map((pacote) => pacote.nome).join(', ');
  return `Os pacotes usam ${usadas} de ${item.quantidade} peças (${onde}).`;
}

/** Em quantos serviços e pacotes (direto, sem contar o serviço do pacote) o item está. */
export const usosDoItem = (servicos: Servico[], pacotes: Pacote[], item: string) => ({
  servicos: servicos.filter((s) => s.itens.some((i) => i.item === item)).length,
  pacotes: pacotes.filter((p) => p.itens.some((i) => i.item === item)).length,
});

/** Item excluído dos cadastros sai dos serviços e dos pacotes. */
export const tirarItem = (servicos: Servico[], pacotes: Pacote[], item: string) => ({
  servicos: servicos.map((s) => ({ ...s, itens: removerItem(s.itens, item) })),
  pacotes: pacotes.map((p) => ({ ...p, itens: removerItem(p.itens, item) })),
});
/** Serviço excluído sai dos pacotes. */
export const tirarServico = (pacotes: Pacote[], servico: string) =>
  pacotes.map((p) => ({ ...p, servicos: p.servicos.filter((id) => id !== servico) }));
