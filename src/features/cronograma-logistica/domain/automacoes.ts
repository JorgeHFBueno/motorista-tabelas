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
 * Todas as regras em vigor, de mudança de status (acima) e de aviso no sino (Function logisticaPedidoNota): o botão
 * Regras lista e o raio no cabeçalho da coluna mostra a dela. `etiqueta` é a etiqueta de status de que a regra
 * depende: renomeada ou excluída, a regra não faz nada.
 */
export const REGRAS = [
  { coluna: 'expedicao', quando: 'a Expedição receber valor', entao: ['o Status passa para Carregar'], etiqueta: 'Carregar' },
  { coluna: 'status', quando: 'o Status passar para Ag. NF', entao: ['os atribuídos recebem o aviso "Novo Pedido de Nota"'], etiqueta: 'Ag. NF' },
  { coluna: 'nota', quando: 'a Nota receber o PDF', entao: ['os atribuídos recebem o aviso "Nota anexada"', 'o Status passa para Em viagem'], etiqueta: 'Em viagem' },
] as const;

export type Regra = (typeof REGRAS)[number];

/** A regra funciona: a etiqueta de que ela depende está na lista (sem diferença de acento, caixa e espaços). */
export const regraAtiva = (regra: Regra, etiquetas: readonly EtiquetaStatus[]) => etiquetas.some((etiqueta) => mesmoNome(etiqueta.nome, regra.etiqueta));

/** Texto da automação da coluna (o raio no cabeçalho), ou null. */
export function automacaoDaColuna(chave: string): string | null {
  const regra = REGRAS.find((item) => item.coluna === chave);
  return regra ? `Automação: quando ${regra.quando}, ${regra.entao.join(' e ')}.` : null;
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
