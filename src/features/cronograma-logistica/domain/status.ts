/**
 * Status de uma programação: as etiquetas do quadro logístico (as mesmas do Monday). Grava-se o nome; '' é sem
 * status. Um texto fora da lista (gravado antes das etiquetas) aparece em cinza até alguém escolher outro.
 */
export interface EtiquetaStatus { nome: string; cor: string; textoEscuro?: boolean }

export const STATUS_LOGISTICA: readonly EtiquetaStatus[] = [
  { nome: 'Em viagem', cor: '#fdbc64', textoEscuro: true },
  { nome: 'Ag. NF', cor: '#ff7bd0' },
  { nome: 'Carregar', cor: '#2b76e5' },
  { nome: 'Finalizado', cor: '#33d391' },
  { nome: 'Trabalhando', cor: '#cab641' },
  { nome: 'Ag. Conf. Acesso', cor: '#ff8b8b' },
  { nome: 'Parado', cor: '#e2445c' },
  { nome: 'Lançar item ERP', cor: '#ff7f50' },
  { nome: 'AG. Produção', cor: '#175a63' },
  { nome: 'CANCELADO', cor: '#c4587a' },
  { nome: 'Ag. Conf. Cliente', cor: '#ffcb00', textoEscuro: true },
  { nome: 'Carregando', cor: '#2d9fd6' },
  { nome: 'Em Manutenção', cor: '#5c5c5c' },
  { nome: 'Ag. Lista de Materiais', cor: '#a25ddc' },
  { nome: 'AJUSTE ADM', cor: '#b8a3f5' },
];

export const COR_SEM_STATUS = '#797e93';

export function etiquetaDoStatus(status: string): EtiquetaStatus {
  return STATUS_LOGISTICA.find((etiqueta) => etiqueta.nome === status) ?? { nome: status, cor: COR_SEM_STATUS };
}
