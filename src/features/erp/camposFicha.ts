import type { ReactNode } from 'react';
import type { ColunaItem } from './ListaItens';

// Definição das fichas do ERP (Clientes e Fornecedores, Produtos) como as do ERP do Samuel (server/src/erp/cadastros/*.ts):
// campos na ordem do Elevor, com `junto` (vai à direita da linha anterior) e `anexo` (na mesma célula). As peças que
// desenham a ficha ficam em FichaCampos.tsx.

export type TipoCampo = 'texto' | 'data' | 'opcoes' | 'radio' | 'caixa' | 'longo' | 'numero' | 'moeda' | 'percentual';
export type Campo = {
  rotulo: string;
  tipo?: TipoCampo;
  opcoes?: string[];
  /** px medidos no Elevor ou o tamanho padrão do ERP. */
  largura?: number | 'curto' | 'medio' | 'cheio';
  /** Vai na coluna da direita da linha anterior. */
  junto?: true;
  /** Vai na mesma célula do campo anterior, depois deste texto (Nº:, UF:). */
  anexo?: string;
  secao?: string;
  /** Só num tipo da ficha (na pessoa: F Física, J Jurídica). */
  so?: string;
  /** Botões ao lado do campo (desligados na demonstração). */
  botoes?: ReactNode[];
  ajuda?: string;
  /** Campo com controle próprio da ficha (CPF/CNPJ, Cidade). */
  especial?: string;
  /** Só leitura, como no ERP do Samuel (campo do Elevor que o ERP não guarda). */
  desabilitado?: true;
};
export type Lista = { lista: string; colunas: ColunaItem[]; estreita?: true; semCabecalho?: true; botao?: string; inicial?: string };
export type Item = Campo | Lista;
/** Uma linha da ficha: grupos de campos, um por par rótulo/controle. */
export type Linha = Campo[][];

export const ehLista = (i: Item | Linha): i is Lista => !Array.isArray(i) && 'lista' in i;
export const cols = (...rotulos: string[]): ColunaItem[] => rotulos.map((rotulo) => ({ rotulo, data: rotulo.startsWith('Data') || rotulo === 'Validade' ? true : undefined }));

/** Linhas da aba: `junto` vai à direita da linha anterior (até `porLinha` pares), `anexo` na mesma célula; o que não é do tipo sai. */
export function montar(itens: Item[], tipo?: string, porLinha = 2): Array<Linha | Lista> {
  const linhas: Array<Linha | Lista> = [];
  for (const item of itens) {
    if (ehLista(item)) { linhas.push(item); continue; }
    if (item.so && item.so !== tipo) continue;
    const ultima = linhas[linhas.length - 1];
    const linha = ultima && !ehLista(ultima) ? ultima : null;
    if (item.anexo !== undefined && linha) linha[linha.length - 1].push(item);
    else if (item.junto && linha && linha.length < porLinha) linha.push([item]);
    else linhas.push([[item]]);
  }
  return linhas;
}

export const classeLargura = (c: Campo) => {
  const l = c.largura ?? (['data', 'numero', 'moeda', 'percentual'].includes(c.tipo ?? '') ? 'curto' : 'medio');
  return typeof l === 'number' ? { className: 'campo', style: { width: l, maxWidth: '100%', flex: 'none' as const } } : { className: `campo ${l}` };
};
