// Aba Atividade do /testes/mki (pedido do responsável, 2026-11-26, substitui o agendamento por mestre e período da
// manhã): Cadastros são os itens que a obra usa ou faz, por categoria (Insumos, Pré-fabricados, Concreto, Ferramentas,
// Máquinas e Tarefas), cada um com descrição e quantidade; os Pré-fabricados são as peças do Plannix dos LOTEs e não se
// criam aqui. Pacotes são a "receita": o usuário leva itens dos cadastros para o pacote, com a quantidade que o pacote
// usa. Por enquanto o pacote não tem mestre nem data (virão depois). Poucas travas, com avisos: usar mais do que o
// cadastrado ou a mesma peça em dois pacotes só avisa. Só teste: dados fictícios em memória.
import type { PreFabricado } from '../../obras/preFabricados';

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

/** Item dos cadastros. Pré-fabricado: uma peça do Plannix (`lote`, `etapa`), quantidade 1, ou um item ainda sem projeto. */
export type ItemCadastro = { id: string; categoria: CategoriaCadastro; descricao: string; quantidade: number; unidade: string; lote?: string; etapa?: string };
/** Item no pacote: o do cadastro e quanto o pacote usa dele. */
export type ItemDoPacote = { item: string; quantidade: number };
export type Pacote = { id: string; nome: string; itens: ItemDoPacote[] };

/** As peças do Plannix como itens de Pré-fabricados: uma por código; item sem projeto (sem códigos) entra inteiro. */
export function preFabricadosDosLotes(lotes: { chave: string; itens: PreFabricado[] | null }[]): ItemCadastro[] {
  return lotes.flatMap((lote) => (lote.itens ?? []).flatMap((item): ItemCadastro[] => (item.pecas.length
    ? item.pecas.map((peca) => ({ id: `pf:${lote.chave}:${peca.codigo}`, categoria: 'prefabricados', descricao: `${item.tipo} · ${peca.codigo}`, quantidade: 1, unidade: 'peça', lote: lote.chave, etapa: peca.etapa }))
    : [{ id: `pf:${lote.chave}:${item.id}`, categoria: 'prefabricados', descricao: item.tipo, quantidade: item.quantidade, unidade: 'peças', lote: lote.chave, etapa: '' }])));
}

/** Quanto do item os pacotes usam (menos o pacote `exceto`, quando dado). */
export const usoDoItem = (pacotes: Pacote[], item: string, exceto?: string) =>
  pacotes.filter((pacote) => pacote.id !== exceto).reduce((total, pacote) => total + pacote.itens.filter((i) => i.item === item).reduce((soma, i) => soma + i.quantidade, 0), 0);
/** Quanto do item ainda não está em pacote nenhum (nunca negativo). */
export const livreDoItem = (item: ItemCadastro, pacotes: Pacote[]) => Math.max(0, item.quantidade - usoDoItem(pacotes, item.id));
/** Os outros pacotes que já usam o item. */
export const outrosPacotesDoItem = (pacotes: Pacote[], item: string, exceto: string) =>
  pacotes.filter((pacote) => pacote.id !== exceto && pacote.itens.some((i) => i.item === item));

/**
 * Leva o item ao pacote com o que ainda está livre (1 se não sobrou nada: avisa, não trava). Item que já está no pacote
 * fica como está.
 */
export function adicionarAoPacote(pacotes: Pacote[], pacoteId: string, item: ItemCadastro): Pacote[] {
  const quantidade = livreDoItem(item, pacotes) || 1;
  return pacotes.map((pacote) => (pacote.id !== pacoteId || pacote.itens.some((i) => i.item === item.id) ? pacote : { ...pacote, itens: [...pacote.itens, { item: item.id, quantidade }] }));
}
export const alterarQuantidade = (pacotes: Pacote[], pacoteId: string, item: string, quantidade: number) =>
  pacotes.map((pacote) => (pacote.id !== pacoteId ? pacote : { ...pacote, itens: pacote.itens.map((i) => (i.item === item ? { ...i, quantidade } : i)) }));
export const removerDoPacote = (pacotes: Pacote[], pacoteId: string, item: string) =>
  pacotes.map((pacote) => (pacote.id !== pacoteId ? pacote : { ...pacote, itens: pacote.itens.filter((i) => i.item !== item) }));
/** Item excluído dos cadastros sai também dos pacotes. */
export const tirarDosPacotes = (pacotes: Pacote[], item: string) =>
  pacotes.map((pacote) => ({ ...pacote, itens: pacote.itens.filter((i) => i.item !== item) }));

/** Aviso do item no pacote quando os pacotes usam mais do que o cadastrado (a peça do Plannix: está em outro pacote). */
export function avisoDoItem(pacotes: Pacote[], pacoteId: string, item: ItemCadastro): string | null {
  const total = usoDoItem(pacotes, item.id);
  if (total <= item.quantidade) return null;
  const outros = outrosPacotesDoItem(pacotes, item.id, pacoteId).map((pacote) => pacote.nome).join(', ');
  if (item.unidade === 'peça' && outros) return `A peça também está em ${outros}.`;
  return `Os pacotes usam ${formatarQuantidade(total)} de ${formatarQuantidade(item.quantidade)} ${item.unidade} do cadastro${outros ? ` (também em ${outros})` : ''}.`;
}

export const formatarQuantidade = (valor: number) => valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
