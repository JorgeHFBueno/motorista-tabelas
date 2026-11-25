// Sincronizar com o Plannix (pedido do responsável, 2026-11-25): no detalhe da obra, o botão de cada LOTE põe um pedido
// na fila do robô do Samuel (plannix-sincronizacoes, um documento por LOTE: {obraId}__{lote}). O robô, numa máquina da
// Ledur, consulta a fila pela preFabricadosApi, simula e devolve a prévia; alguém aprova aqui e o robô grava no Plannix.
// The Manuscript, 01_FIRESTORE/COLECOES/plannix-sincronizacoes.md.

export type StatusSincronizacao = 'pedido' | 'simulando' | 'previa' | 'aprovado' | 'gravando' | 'concluido' | 'erro' | 'cancelado';
export type SincronizacaoPlannix = {
  id: string;
  lote: string;
  status: StatusSincronizacao;
  pedidoPor: string;
  pedidoEm: Date | null;
  aprovadoPor: string;
  previa: string;
  mensagem: string;
  atualizadoEm: Date | null;
};

export const idDaSincronizacao = (obraId: string, lote: string) => `${obraId}__${lote}`;

/** Rótulo e cor de cada status (cores da identidade; sem roxo). */
export const STATUS_DA_SINCRONIZACAO: Record<StatusSincronizacao, { rotulo: string; cor: 'default' | 'info' | 'warning' | 'success' | 'error' }> = {
  pedido: { rotulo: 'Aguardando o robô', cor: 'info' },
  simulando: { rotulo: 'Robô simulando', cor: 'info' },
  previa: { rotulo: 'Prévia pronta', cor: 'warning' },
  aprovado: { rotulo: 'Aprovada, aguardando o robô', cor: 'info' },
  gravando: { rotulo: 'Gravando no Plannix', cor: 'info' },
  concluido: { rotulo: 'Sincronizada', cor: 'success' },
  erro: { rotulo: 'Erro', cor: 'error' },
  cancelado: { rotulo: 'Cancelada', cor: 'default' },
};

/** Terminada (concluída, com erro ou cancelada): pode pedir de novo. Sem sincronização também pode. */
export const podePedir = (s: SincronizacaoPlannix | undefined) => !s || ['concluido', 'erro', 'cancelado'].includes(s.status);
/** Cancelar só antes de gravar (as Rules recusam depois). */
export const podeCancelar = (s: SincronizacaoPlannix | undefined) => Boolean(s && ['pedido', 'simulando', 'previa'].includes(s.status));

const STATUS = Object.keys(STATUS_DA_SINCRONIZACAO);
const texto = (v: unknown) => (typeof v === 'string' ? v : '');
const data = (v: unknown) => (v && typeof (v as { toDate?: unknown }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null);

/** Documento de plannix-sincronizacoes para a tela; status desconhecido fica fora. */
export function sincronizacaoDoDocumento(id: string, d: Record<string, unknown>): SincronizacaoPlannix | null {
  if (!STATUS.includes(String(d.status))) return null;
  const nome = (v: unknown) => texto((v as { nome?: unknown } | undefined)?.nome);
  return {
    id, lote: texto(d.lote), status: d.status as StatusSincronizacao,
    pedidoPor: nome(d.pedidoPor), pedidoEm: data(d.pedidoEm), aprovadoPor: nome(d.aprovadoPor),
    previa: texto(d.previa), mensagem: texto(d.mensagem), atualizadoEm: data(d.atualizadoEm),
  };
}
