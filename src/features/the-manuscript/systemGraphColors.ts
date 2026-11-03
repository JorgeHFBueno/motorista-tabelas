import type { ManuscriptSystemNode } from '../../../functions/manuscriptMetadata';

export const ENTITY_COLORS: Record<string, string> = { colecao: '#2e7d32', function: '#7b1fa2', rota: '#1565c0', externo: '#e65100' };
const DOMAIN_ORDER = ['autenticacao', 'funcionarios', 'frota', 'obras', 'atividades', 'checklists', 'combustivel', 'bombas', 'manutencao', 'fornecedores', 'engenharia', 'monday', 'erp', 'relatorios', 'friday', 'logistica', 'kiosk', 'manuscript', 'sistema'];
export const domainColor = (dominio: string | undefined) => {
  if (!dominio || dominio === 'sistema') return '#78909c';
  const position = Math.max(0, DOMAIN_ORDER.indexOf(dominio));
  return `hsl(${Math.round((position * 360) / (DOMAIN_ORDER.length - 1) * 7) % 360} 55% 45%)`;
};
export const nodeColor = (node: ManuscriptSystemNode) => (node.kind === 'ENTIDADE' ? ENTITY_COLORS[node.tipo] ?? '#546e7a' : domainColor(node.dominios[0]));
