// /testes/mkii (pedido do responsável, 2026-11-26): o serviço como modelo para várias obras, no formato da "composição"
// dos orçamentos de obra (SINAPI e TCPO; "assembly" no RSMeans). A Biblioteca da Ledur tem os cadastros e os
// serviços-modelo; cada modelo diz a unidade do serviço (m³, m, peça…) e os itens com o coeficiente por unidade (ex.:
// 1,05 m³ de concreto por m³ de sapata). Na obra, aplica-se o modelo com uma quantidade: os itens saem calculados
// (coeficiente × quantidade), com os pré-fabricados do LOTE escolhidos ali. O pacote junta serviços da obra (o "pacote
// de trabalho" da equipe) e se vincula ao mestre alocado. Só teste: dados fictícios em memória.

export type CategoriaCatalogo = 'insumos' | 'concreto' | 'ferramentas' | 'maquinas' | 'tarefas';
export const CATEGORIAS_CATALOGO: { id: CategoriaCatalogo; nome: string }[] = [
  { id: 'insumos', nome: 'Insumos' },
  { id: 'concreto', nome: 'Concreto' },
  { id: 'ferramentas', nome: 'Ferramentas' },
  { id: 'maquinas', nome: 'Máquinas' },
  { id: 'tarefas', nome: 'Tarefas' },
];
export const nomeDaCategoria = (id: CategoriaCatalogo) => CATEGORIAS_CATALOGO.find((c) => c.id === id)?.nome ?? id;

/** Item da Biblioteca (vale para todas as obras): descrição e grupo. */
export type ItemCatalogo = { id: string; categoria: CategoriaCatalogo; descricao: string; grupo: string };
/** Item do modelo: quanto se usa por unidade do serviço. */
export type ItemDoModelo = { item: string; coeficiente: number; unidade: string };
export type ServicoModelo = { id: string; nome: string; unidade: string; descricao: string; itens: ItemDoModelo[] };

/** Tipo de peça de um LOTE da obra no Plannix. */
export type PreFabricadoDaObra = { id: string; lote: string; tipo: string; quantidade: number; expedidas: number };
/** O modelo aplicado na obra: quantidade na unidade do modelo, LOTE e as peças do Plannix que entram. */
export type ServicoDaObra = { id: string; obra: string; modelo: string; quantidade: number; lote: string; pecas: { preFabricado: string; quantidade: number }[]; observacao: string };
export type Pacote = { id: string; obra: string; nome: string; servicos: string[]; alocacao: string };

const comparar = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare;
export const formatar = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Os grupos já usados na categoria (sem repetir por maiúsculas; vale a primeira grafia), para sugerir. */
export function gruposDaCategoria(itens: ItemCatalogo[], categoria: CategoriaCatalogo) {
  const grupos = new Map<string, string>();
  for (const item of itens) {
    const grupo = item.grupo.trim();
    if (item.categoria === categoria && grupo && !grupos.has(grupo.toLocaleLowerCase('pt-BR'))) grupos.set(grupo.toLocaleLowerCase('pt-BR'), grupo);
  }
  return [...grupos.values()].sort(comparar);
}

/** Os itens do serviço na obra: coeficiente do modelo × quantidade aplicada. */
export function itensCalculados(servico: Pick<ServicoDaObra, 'modelo' | 'quantidade'>, modelos: ServicoModelo[]) {
  const modelo = modelos.find((m) => m.id === servico.modelo);
  return (modelo?.itens ?? []).map((i) => ({ item: i.item, unidade: i.unidade, quantidade: i.coeficiente * servico.quantidade }));
}

/** Lista de materiais (e máquinas, ferramentas, tarefas) somada dos serviços, por item e unidade. */
export function listaDeMateriais(servicos: Pick<ServicoDaObra, 'modelo' | 'quantidade'>[], modelos: ServicoModelo[]) {
  const soma = new Map<string, { item: string; unidade: string; quantidade: number }>();
  for (const s of servicos) {
    for (const i of itensCalculados(s, modelos)) {
      const chave = `${i.item}|${i.unidade}`;
      const atual = soma.get(chave);
      soma.set(chave, { ...i, quantidade: (atual?.quantidade ?? 0) + i.quantidade });
    }
  }
  return [...soma.values()];
}

/** Peças do tipo que os serviços da obra usam. */
export const pecasUsadas = (servicos: ServicoDaObra[], preFabricado: string, exceto?: string) =>
  servicos.filter((s) => s.id !== exceto).reduce((total, s) => total + s.pecas.filter((p) => p.preFabricado === preFabricado).reduce((t, p) => t + p.quantidade, 0), 0);

/** Aviso quando os serviços da obra usam mais peças do tipo do que o LOTE tem (não trava). */
export function avisoDasPecas(servicos: ServicoDaObra[], pf: PreFabricadoDaObra): string | null {
  const usadas = pecasUsadas(servicos, pf.id);
  return usadas > pf.quantidade ? `Os serviços da obra usam ${usadas} de ${pf.quantidade} peças de ${pf.tipo}.` : null;
}

/** As obras que usam o modelo (a prova de que ele é um modelo para várias obras). */
export const obrasDoModelo = (modelo: string, servicos: ServicoDaObra[]) =>
  [...new Set(servicos.filter((s) => s.modelo === modelo).map((s) => s.obra))];

/** Modelo excluído: sai das obras (os serviços aplicados e, deles, os pacotes). */
export function tirarModelo(modelo: string, servicos: ServicoDaObra[], pacotes: Pacote[]) {
  const saem = new Set(servicos.filter((s) => s.modelo === modelo).map((s) => s.id));
  return { servicos: servicos.filter((s) => !saem.has(s.id)), pacotes: pacotes.map((p) => ({ ...p, servicos: p.servicos.filter((id) => !saem.has(id)) })) };
}
/** Item excluído da Biblioteca sai dos modelos. */
export const tirarItemDosModelos = (item: string, modelos: ServicoModelo[]) =>
  modelos.map((m) => ({ ...m, itens: m.itens.filter((i) => i.item !== item) }));
