// Pacotes de Trabalho do /testes/mki (pedido do responsável, 2026-11-26): na aba Mestres do detalhe da obra, agendar o
// que vai (ou pode) ser montado, juntando o CronoObra (mestres e períodos) e os LOTEs (peças do Plannix). Fluxo: categoria
// → atividade (ex.: Super Estrutura → Montagem Longarinas) → as peças da atividade por LOTE, das mais completas às menos
// completas → as escolhidas → um mestre → um período. Só teste: dados fictícios em memória; o mapa atividade → peças
// ainda é uma proposta (por produto e nome no Plannix).
// Ajustes do responsável (2026-11-26): a peça montada fica no fim da lista, como Montada, marcada à mão aqui na sequência
// Expedida (Plannix) → Agendada (no pacote) → Montada, ou de volta a Expedida (sai do pacote); a Fundação é serviço na
// obra, sem peças do Plannix: o pacote marca o que o mestre foi fazer em quais LOTEs; poucas travas, com avisos.
import { ETAPAS_PLANNIX, etapaPlannix, type PreFabricado } from '../../obras/preFabricados';

/** `filtro`: os itens do Plannix da atividade; sem filtro, é serviço na obra (o pacote leva LOTEs, sem peças). */
export type Atividade = { id: string; nome: string; categoria: string; filtro?: (item: Pick<PreFabricado, 'grupo' | 'tipo'>) => boolean };

const produto = (...nomes: string[]) => (item: Pick<PreFabricado, 'grupo'>) => nomes.includes(item.grupo.trim().toUpperCase());
const viga = (prefixo: string) => (item: Pick<PreFabricado, 'grupo' | 'tipo'>) => item.grupo.trim().toUpperCase() === 'VIGA' && item.tipo.trim().toUpperCase().startsWith(prefixo);

/** Lista parcial de atividades (2026-11-26), por categoria; cada uma diz quais itens do Plannix entram (a Fundação, nenhum). */
export const CATEGORIAS: { nome: string; atividades: Atividade[] }[] = [
  {
    nome: 'Fundação',
    atividades: [
      { id: 'sapata-corrida', nome: 'Sapata Corrida', categoria: 'Fundação' },
      { id: 'sapata-isolada', nome: 'Sapata Isolada', categoria: 'Fundação' },
      { id: 'bloco-estacas', nome: 'Bloco de Estacas', categoria: 'Fundação' },
      { id: 'estacas', nome: 'Estacas', categoria: 'Fundação' },
    ],
  },
  {
    nome: 'Super Estrutura',
    atividades: [
      { id: 'longarinas', nome: 'Montagem Longarinas', categoria: 'Super Estrutura', filtro: viga('VL') },
      { id: 'vigas', nome: 'Montagem Vigas', categoria: 'Super Estrutura', filtro: viga('VT') },
      { id: 'guarda-rodas', nome: 'Montagem Guarda Rodas', categoria: 'Super Estrutura', filtro: produto('GUARDA RODA') },
      { id: 'guarda-corpo', nome: 'Montagem Guarda Corpo', categoria: 'Super Estrutura', filtro: produto('GUARDA CORPO') },
    ],
  },
  {
    nome: 'Mesoestruturas',
    atividades: [
      { id: 'meso-vigas', nome: 'Vigas', categoria: 'Mesoestruturas', filtro: viga('VM') },
      { id: 'pilares-centrais', nome: 'Pilares Centrais', categoria: 'Mesoestruturas', filtro: produto('PILAR') },
      { id: 'cortinas', nome: 'Lances de Cortinas', categoria: 'Mesoestruturas', filtro: produto('CORTINA') },
    ],
  },
];
export const ATIVIDADES = CATEGORIAS.flatMap((categoria) => categoria.atividades);
export const atividadePorId = (id: string) => ATIVIDADES.find((atividade) => atividade.id === id);

const EXPEDIDA = ETAPAS_PLANNIX.findIndex((etapa) => etapa.nome === 'EXPEDIDA');
const MONTADA = ETAPAS_PLANNIX.findIndex((etapa) => etapa.nome === 'MONTADA');

/**
 * Quanto a peça está pronta para montar, de 0 (Não Projetado, Projetada ou etapa desconhecida) a 1 (Expedida), pela
 * ordem das etapas do Plannix. Montada também é 1 (e vai para o fim da lista).
 */
export function completude(etapa: string): number {
  const { ordem } = etapaPlannix(etapa);
  if (ordem < 0) return 0;
  if (ordem >= ETAPAS_PLANNIX.length) return 0;
  return Math.min(ordem, EXPEDIDA) / EXPEDIDA;
}
export const montada = (etapa: string) => etapaPlannix(etapa).ordem === MONTADA;

/** `montada`: Montada no Plannix ou marcada aqui num pacote. */
export type PecaDaAtividade = { lote: string; item: string; tipo: string; codigo: string; etapa: string; completude: number; montada: boolean };
/** `completude`: a média das peças ainda não montadas; `pendentes`: quantas são. */
export type LoteDaAtividade = { lote: string; nome: string; completude: number; pendentes: number; pecas: PecaDaAtividade[]; aguardandoProjeto: number };

const comparar = new Intl.Collator('pt-BR', { numeric: true }).compare;

/**
 * As peças da atividade por LOTE: as não montadas das mais completas às menos completas (empate: item e código) e, no
 * fim, as montadas (no Plannix ou aqui, `montadasAqui`). Os LOTEs vão do mais completo ao menos, pela média das peças
 * não montadas; LOTE sem peça pendente vai para o fim. Itens sem projeto no Plannix (sem códigos) contam em
 * `aguardandoProjeto`; LOTE sem nenhuma peça da atividade fica fora. Atividade de serviço (sem filtro): nenhuma peça.
 */
export function pecasDaAtividade(
  lotes: { chave: string; nome: string; itens: PreFabricado[] | null }[],
  atividade: Pick<Atividade, 'filtro'>,
  montadasAqui: ReadonlySet<string> = new Set(),
): LoteDaAtividade[] {
  const { filtro } = atividade;
  if (!filtro) return [];
  return lotes.flatMap((lote) => {
    const itens = (lote.itens ?? []).filter(filtro);
    const pecas = itens
      .flatMap((item) => item.pecas.map((peca) => ({
        lote: lote.chave, item: item.id, tipo: item.tipo, codigo: peca.codigo, etapa: peca.etapa, completude: completude(peca.etapa),
        montada: montada(peca.etapa) || montadasAqui.has(chavePeca(lote.chave, peca.codigo)),
      })))
      .sort((a, b) => Number(a.montada) - Number(b.montada) || b.completude - a.completude || comparar(a.tipo, b.tipo) || comparar(a.codigo, b.codigo));
    const aguardandoProjeto = itens.filter((item) => !item.pecas.length).reduce((total, item) => total + item.quantidade, 0);
    if (!pecas.length && !aguardandoProjeto) return [];
    const pendentes = pecas.filter((peca) => !peca.montada);
    const media = pendentes.length ? pendentes.reduce((total, peca) => total + peca.completude, 0) / pendentes.length : 0;
    return [{ lote: lote.chave, nome: lote.nome, completude: media, pendentes: pendentes.length, pecas, aguardandoProjeto }];
  }).sort((a, b) => Number(!a.pendentes) - Number(!b.pendentes) || b.completude - a.completude || comparar(a.nome, b.nome));
}

/** Período em dias civis, `AAAA-MM-DD` (início e fim inclusive). */
export type Periodo = { inicio: string; fim: string };
/** Peça no pacote: Agendada até ser marcada Montada (ou voltar a Expedida, saindo do pacote). */
export type PecaDoPacote = { lote: string; codigo: string; tipo: string; montada?: boolean };
/**
 * Pacote de trabalho. Montagem: as peças. Serviço (Fundação): `lotes`, sem peças, e `concluido` quando o mestre fez.
 * `observacao`: o que vai ser feito, livre.
 */
export type Pacote = Periodo & { id: string; atividade: string; mestre: string; pecas: PecaDoPacote[]; lotes?: string[]; observacao?: string; concluido?: boolean };
/** Alocação do mestre na obra no CronoObra (o LOTE e o período). */
export type Alocacao = Periodo & { mestre: string; lote: string };

export const chavePeca = (lote: string, codigo: string) => `${lote}:${codigo}`;
/** Peça → pacote em que já está agendada (uma peça entra num pacote só). */
export const pecasAgendadas = (pacotes: Pacote[]) =>
  new Map(pacotes.flatMap((pacote) => pacote.pecas.map((peca) => [chavePeca(peca.lote, peca.codigo), pacote] as const)));

/** Peças marcadas Montada aqui (em algum pacote). */
export const montadasNosPacotes = (pacotes: Pacote[]) =>
  new Set(pacotes.flatMap((pacote) => pacote.pecas.filter((peca) => peca.montada).map((peca) => chavePeca(peca.lote, peca.codigo))));
/** LOTEs do pacote: os das peças e, no serviço, os escolhidos. */
export const lotesDoPacote = (pacote: Pacote) => [...new Set([...pacote.pecas.map((peca) => peca.lote), ...(pacote.lotes ?? [])])];

/**
 * Marca à mão uma peça do pacote: 'montada' (Agendada → Montada), 'agendada' (desfaz a Montada) ou 'expedida' (não foi
 * montada: sai do pacote e fica livre de novo). Pacote de montagem que fica sem peças sai junto.
 */
export function marcarPeca(pacotes: Pacote[], pacoteId: string, chave: string, para: 'montada' | 'agendada' | 'expedida'): Pacote[] {
  return pacotes.flatMap((pacote) => {
    if (pacote.id !== pacoteId) return [pacote];
    const daPeca = (peca: PecaDoPacote) => chavePeca(peca.lote, peca.codigo) === chave;
    if (para === 'expedida') {
      const pecas = pacote.pecas.filter((peca) => !daPeca(peca));
      return pecas.length || pacote.lotes?.length ? [{ ...pacote, pecas }] : [];
    }
    return [{ ...pacote, pecas: pacote.pecas.map((peca) => (daPeca(peca) ? { ...peca, montada: para === 'montada' } : peca)) }];
  });
}

export const periodoValido = (p: Periodo) => /^\d{4}-\d{2}-\d{2}$/.test(p.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(p.fim) && p.inicio <= p.fim;
export const sobrepoe = (a: Periodo, b: Periodo) => a.inicio <= b.fim && b.inicio <= a.fim;
/** Pacotes do mesmo mestre que cruzam o período (o mestre estaria em dois lugares). */
export const conflitosDoMestre = (pacotes: Pacote[], mestre: string, periodo: Periodo) =>
  pacotes.filter((pacote) => pacote.mestre === mestre && sobrepoe(pacote, periodo));
/** O período cabe inteiro numa alocação do mestre nesta obra no CronoObra? */
export const dentroDaAlocacao = (alocacoes: Alocacao[], mestre: string, periodo: Periodo) =>
  alocacoes.some((alocacao) => alocacao.mestre === mestre && alocacao.inicio <= periodo.inicio && periodo.fim <= alocacao.fim);

const dia = (data: string) => Date.UTC(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)));
/** Dias do período, contando o início e o fim. */
export const diasDoPeriodo = (p: Periodo) => Math.round((dia(p.fim) - dia(p.inicio)) / 86_400_000) + 1;
/** `AAAA-MM-DD` somado de `n` dias. */
export const somarDias = (data: string, n: number) => new Date(dia(data) + n * 86_400_000).toISOString().slice(0, 10);
export const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
