// Colunas do Quadro: ordenar, largura, fixar e ocultar, como no Friday. Preferência de cada pessoa, neste navegador.
import type { CSSProperties } from 'react';

export type ChaveColuna =
  | 'cod' | 'item' | 'periodo' | 'motorista' | 'auxiliar' | 'veiculos' | 'obra' | 'status'
  | 'expedicao' | 'nota' | 'adiamento' | 'criadoPor' | 'modificadoPor';

export interface DefColuna {
  chave: ChaveColuna;
  titulo: string;
  largura: number;
  ordenavel: boolean;
  /** O Item não some: é por ele que se abre e arrasta a linha. */
  ocultavel: boolean;
}

export const COLUNAS: readonly DefColuna[] = [
  { chave: 'cod', titulo: 'Cod', largura: 110, ordenavel: true, ocultavel: true },
  { chave: 'item', titulo: 'Item', largura: 320, ordenavel: true, ocultavel: false },
  { chave: 'periodo', titulo: 'Período', largura: 250, ordenavel: true, ocultavel: true },
  { chave: 'motorista', titulo: 'Motorista', largura: 170, ordenavel: true, ocultavel: true },
  { chave: 'auxiliar', titulo: 'Auxiliar', largura: 170, ordenavel: true, ocultavel: true },
  { chave: 'veiculos', titulo: 'Veículos', largura: 260, ordenavel: true, ocultavel: true },
  { chave: 'obra', titulo: 'Obra', largura: 200, ordenavel: true, ocultavel: true },
  { chave: 'status', titulo: 'Status', largura: 150, ordenavel: true, ocultavel: true },
  { chave: 'expedicao', titulo: 'Expedição', largura: 180, ordenavel: true, ocultavel: true },
  { chave: 'nota', titulo: 'Nota', largura: 150, ordenavel: false, ocultavel: true },
  { chave: 'adiamento', titulo: 'Adiamento', largura: 150, ordenavel: false, ocultavel: true },
  { chave: 'criadoPor', titulo: 'Criado por', largura: 160, ordenavel: true, ocultavel: true },
  { chave: 'modificadoPor', titulo: 'Modificado por', largura: 160, ordenavel: true, ocultavel: true },
];

export const LARGURA_MIN = 70;
export const LARGURA_MAX = 600;

export interface PrefsColunas {
  larguras: Partial<Record<ChaveColuna, number>>;
  fixas: ChaveColuna[];
  ocultas: ChaveColuna[];
  ordem: { chave: ChaveColuna; dir: 1 | -1 } | null;
}

export const PREFS_VAZIAS: PrefsColunas = { larguras: {}, fixas: [], ocultas: [], ordem: null };

const def = (chave: unknown) => COLUNAS.find((coluna) => coluna.chave === chave);

/** Preferência lida do navegador: descarta o que não é coluna conhecida ou não pode (ocultar o Item, ordenar Nota). */
export function prefsLimpas(valor: unknown): PrefsColunas {
  const bruto = (valor ?? {}) as Partial<Record<keyof PrefsColunas, unknown>>;
  const chaves = (lista: unknown, aceita: (coluna: DefColuna) => boolean) =>
    [...new Set(Array.isArray(lista) ? lista : [])].flatMap((chave) => { const coluna = def(chave); return coluna && aceita(coluna) ? [coluna.chave] : []; });
  const larguras: PrefsColunas['larguras'] = {};
  for (const [chave, largura] of Object.entries((bruto.larguras ?? {}) as Record<string, unknown>)) {
    const coluna = def(chave);
    if (coluna && typeof largura === 'number' && Number.isFinite(largura)) larguras[coluna.chave] = Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, largura)));
  }
  const ordem = bruto.ordem as { chave?: unknown; dir?: unknown } | null | undefined;
  const colunaOrdem = def(ordem?.chave);
  return {
    larguras,
    fixas: chaves(bruto.fixas, () => true),
    ocultas: chaves(bruto.ocultas, (coluna) => coluna.ocultavel),
    ordem: colunaOrdem?.ordenavel && (ordem?.dir === 1 || ordem?.dir === -1) ? { chave: colunaOrdem.chave, dir: ordem.dir } : null,
  };
}

export interface ColunaVisivel extends DefColuna {
  /** Largura em uso (a da pessoa ou a padrão). */
  largura: number;
  /** Distância da borda esquerda quando fixada; null quando rola com a tabela. */
  esquerda: number | null;
  ultimaFixa: boolean;
}

/** Colunas na tela: as fixadas primeiro (na ordem do quadro), paradas ao rolar para o lado; sem as ocultas. */
export function colunasVisiveis(prefs: PrefsColunas): ColunaVisivel[] {
  const visiveis = COLUNAS.filter((coluna) => !prefs.ocultas.includes(coluna.chave));
  const fixas = visiveis.filter((coluna) => prefs.fixas.includes(coluna.chave));
  const livres = visiveis.filter((coluna) => !prefs.fixas.includes(coluna.chave));
  let esquerda = 0;
  return [
    ...fixas.map((coluna, indice) => {
      const largura = prefs.larguras[coluna.chave] ?? coluna.largura;
      const visivel = { ...coluna, largura, esquerda, ultimaFixa: indice === fixas.length - 1 };
      esquerda += largura;
      return visivel;
    }),
    ...livres.map((coluna) => ({ ...coluna, largura: prefs.larguras[coluna.chave] ?? coluna.largura, esquerda: null, ultimaFixa: false })),
  ];
}

/** Classe e posição de uma célula de coluna fixada (parada ao rolar para o lado). */
export function fixacao(coluna: ColunaVisivel): { className: string; style?: CSSProperties } {
  if (coluna.esquerda === null) return { className: '' };
  return { className: `lg-fixa${coluna.ultimaFixa ? ' lg-ultima-fixa' : ''}`, style: { left: coluna.esquerda } };
}

export type ValorOrdem = string | number | null;

/** Ordena pelo valor da coluna; vazios sempre no fim; empate fica na ordem da semana (posição). */
export function ordenarPor<T extends { id: string; posicao: number }>(linhas: readonly T[], valor: (linha: T) => ValorOrdem, dir: 1 | -1): T[] {
  const vazio = (v: ValorOrdem) => v === null || v === '';
  return linhas
    .map((linha) => ({ linha, v: valor(linha) }))
    .sort((a, b) => {
      if (vazio(a.v) || vazio(b.v)) return vazio(a.v) === vazio(b.v) ? a.linha.posicao - b.linha.posicao : vazio(a.v) ? 1 : -1;
      const comparacao = typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), 'pt-BR', { sensitivity: 'base', numeric: true });
      return comparacao * dir || a.linha.posicao - b.linha.posicao || a.linha.id.localeCompare(b.linha.id);
    })
    .map(({ linha }) => linha);
}
