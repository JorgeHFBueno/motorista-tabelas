import type { ChaveColuna } from './colunas';

/**
 * De onde cada coluna que puxa dados os tira (aba Colunas do botão Regras). Os quadros do Friday são os mesmos da
 * Function logisticaPessoasFriday (functions/logisticaPessoas.ts); o nome é o do quadro no Friday, e o link abre o
 * quadro. Contrato: The Manuscript, 03_APLICACAO_WEB/15_LOGISTICA.md.
 */
export type Origem =
  | { tipo: 'quadro'; id: string; nome: string; detalhe: string }
  | { tipo: 'colecao'; nome: string; detalhe: string }
  | { tipo: 'outro'; detalhe: string };

export const ORIGENS: readonly { chave: ChaveColuna | 'criadoModificado'; titulo: string; origem: Origem }[] = [
  { chave: 'cod', titulo: 'Cod', origem: { tipo: 'outro', detalhe: 'Gerado pelo sistema: o número da semana e um contador da semana (LOG-…).' } },
  {
    chave: 'motorista', titulo: 'Motorista',
    origem: { tipo: 'quadro', id: '1793804494102624', nome: 'Motoristas e log.', detalhe: 'Os itens do quadro.' },
  },
  {
    chave: 'auxiliar', titulo: 'Auxiliar',
    origem: { tipo: 'quadro', id: '1793804423534753', nome: 'Banco de Currículos - RH Ledur', detalhe: 'Os itens do quadro, com a coluna "Função Desejada".' },
  },
  {
    chave: 'veiculos', titulo: 'Veículos',
    origem: { tipo: 'colecao', nome: 'veiculos-v2', detalhe: 'Os ativos (cadastro da Frota). Na lista, embaixo do nome: cadastro.empresa | capacidades.cargaLiquida | capacidades.munck.' },
  },
  { chave: 'obra', titulo: 'Obra', origem: { tipo: 'colecao', nome: 'obras-v2', detalhe: 'As não finalizadas (contratos do quadro GESTÃO DE OBRAS).' } },
  {
    chave: 'local', titulo: 'Local',
    origem: { tipo: 'outro', detalhe: 'Link do Google Maps colado, ou a coordenada do LOTE da obra (obras-v2); cidade e estado pelo OpenStreetMap.' },
  },
  { chave: 'status', titulo: 'Status', origem: { tipo: 'colecao', nome: 'logistica-config/status', detalhe: 'As etiquetas, editáveis na própria coluna.' } },
  { chave: 'nota', titulo: 'Nota', origem: { tipo: 'outro', detalhe: 'Os PDFs enviados (até 10), guardados no Storage (logistica/notas/).' } },
  { chave: 'criadoModificado', titulo: 'Criado por / Modificado por', origem: { tipo: 'colecao', nome: 'funcionarios', detalhe: 'Quem gravou, pelo nome no cadastro.' } },
];

/** Colunas preenchidas na própria célula, sem puxar de outro lugar. */
export const PREENCHIDAS_NA_CELULA = ['Item', 'Período', 'Expedição', 'Adiamento (gerado ao adiar)'] as const;

/** Endereço do quadro no Friday. */
export const linkDoQuadro = (id: string) => `/friday/quadros/${id}`;
