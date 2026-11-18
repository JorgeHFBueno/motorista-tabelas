import type { Programacao, ProgramacaoEditavel } from './models';
import { mesmoNome, type EtiquetaStatus } from './status';

/**
 * Automações do Quadro, fixas no código (como as regras "quando… então…" do Friday, sem tela para editar): quando o
 * campo recebe valor (estava vazio), o Status passa para a etiqueta de mesmo nome, na mesma gravação. Trocar ou apagar
 * um valor que já existia não dispara. Sem a etiqueta na lista (renomeada ou excluída), não faz nada.
 * Os avisos no sino (Ag. NF e nota anexada) são da Function logisticaPedidoNota.
 */
export const AUTOMACOES = [
  { campo: 'expedicao', status: 'Carregar' },
  { campo: 'nota', status: 'Em viagem' },
] as const;

type CampoAutomacao = (typeof AUTOMACOES)[number]['campo'];

/**
 * Trecho de uma regra: texto corrido, nome de coluna (sublinhado no botão Regras), valor de status (com a cor da
 * etiqueta) ou aviso do sino (em itálico).
 */
export type Trecho = string | { coluna: string } | { status: string } | { aviso: string };

/**
 * Todas as regras em vigor, de mudança de status (acima) e de aviso no sino (Function logisticaPedidoNota): o botão
 * Regras lista e o raio no cabeçalho da coluna mostra a dela. `etiqueta` é a etiqueta de status de que a regra
 * depende: renomeada ou excluída, a regra não faz nada.
 */
export const REGRAS: readonly {
  coluna: string;
  quando: readonly Trecho[];
  entao: readonly (readonly Trecho[])[];
  etiqueta: string;
  papel: 'administrativo' | 'engenharia' | null;
}[] = [
  {
    coluna: 'expedicao',
    quando: ['a ', { coluna: 'Expedição' }, ' receber valor'],
    entao: [['o ', { coluna: 'Status' }, ' passa para ', { status: 'Carregar' }]],
    etiqueta: 'Carregar',
    papel: null,
  },
  {
    coluna: 'status',
    quando: ['o ', { coluna: 'Status' }, ' passar para ', { status: 'Ag. NF' }],
    entao: [['o ADMINISTRATIVO recebe o aviso ', { aviso: 'Novo Pedido de Nota' }]],
    etiqueta: 'Ag. NF',
    papel: 'administrativo',
  },
  {
    coluna: 'status',
    quando: ['o ', { coluna: 'Status' }, ' passar para ', { status: 'Ag. Lista de Materiais' }],
    entao: [['a ENGENHARIA recebe o aviso ', { aviso: '… notificou a Engenharia sobre Ag. Lista de Materiais para OBRA' }]],
    etiqueta: 'Ag. Lista de Materiais',
    papel: 'engenharia',
  },
  {
    coluna: 'nota',
    quando: ['a ', { coluna: 'Nota' }, ' receber o PDF'],
    entao: [['o ADMINISTRATIVO recebe o aviso ', { aviso: 'Nota anexada' }], ['o ', { coluna: 'Status' }, ' passa para ', { status: 'Em viagem' }]],
    etiqueta: 'Em viagem',
    papel: 'administrativo',
  },
];

export type Regra = (typeof REGRAS)[number];

/** Os trechos como texto simples (o aviso entre aspas). */
export function textoDosTrechos(trechos: readonly Trecho[]): string {
  return trechos.map((t) => (typeof t === 'string' ? t : 'coluna' in t ? t.coluna : 'status' in t ? t.status : `"${t.aviso}"`)).join('');
}

/** A regra funciona: a etiqueta de que ela depende está na lista (sem diferença de acento, caixa e espaços). */
export const regraAtiva = (regra: Regra, etiquetas: readonly EtiquetaStatus[]) => etiquetas.some((etiqueta) => mesmoNome(etiqueta.nome, regra.etiqueta));

/** Texto das automações da coluna (o raio no cabeçalho), uma por linha, ou null. */
export function automacaoDaColuna(chave: string): string | null {
  const regras = REGRAS.filter((item) => item.coluna === chave);
  return regras.length
    ? regras.map((regra) => `Automação: quando ${textoDosTrechos(regra.quando)}, ${regra.entao.map(textoDosTrechos).join(' e ')}.`).join('\n')
    : null;
}

const vazio = (valor: unknown) => valor == null || (typeof valor === 'string' && valor.trim() === '');

/** Status que a alteração leva por automação (id da etiqueta), ou null quando nenhuma dispara ou o status já é esse. */
export function statusPorAutomacao(
  antes: Pick<Programacao, CampoAutomacao | 'status'>,
  alteracao: Partial<ProgramacaoEditavel>,
  etiquetas: readonly EtiquetaStatus[],
): string | null {
  let status: string | null = null;
  for (const automacao of AUTOMACOES) {
    if (!(automacao.campo in alteracao) || !vazio(antes[automacao.campo]) || vazio(alteracao[automacao.campo])) continue;
    const etiqueta = etiquetas.find((item) => mesmoNome(item.nome, automacao.status));
    if (etiqueta) status = etiqueta.id;
  }
  return status !== null && status !== antes.status ? status : null;
}
