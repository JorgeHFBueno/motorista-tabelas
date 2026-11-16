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

/** O raio no cabeçalho da coluna: o que acontece sozinho. */
const DESCRICOES: Partial<Record<string, string>> = {
  expedicao: 'Automação: quando a Expedição receber valor, o Status passa para Carregar.',
  status: 'Automação: quando o Status passar para Ag. NF, os atribuídos recebem o aviso "Novo Pedido de Nota".',
  nota: 'Automação: quando a Nota receber o PDF, os atribuídos recebem o aviso "Nota anexada" e o Status passa para Em viagem.',
};

/** Texto da automação da coluna (o raio no cabeçalho), ou null. */
export function automacaoDaColuna(chave: string): string | null {
  return DESCRICOES[chave] ?? null;
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
