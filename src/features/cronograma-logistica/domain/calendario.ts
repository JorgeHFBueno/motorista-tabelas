import type { CivilDate, Programacao } from './models';
import { periodoDe } from './conflitos';
import { diferencaDias } from './semanas';

export interface Barra {
  programacao: Programacao;
  /** Índices (inclusivos) dos dias do calendário cobertos pela barra. */
  de: number;
  ate: number;
  faixa: number;
  /** A programação começa antes ou termina depois do alcance do calendário. */
  cortadaAntes: boolean;
  cortadaDepois: boolean;
}

/** Barras de uma linha do calendário, recortadas aos dias exibidos e empilhadas em faixas quando se sobrepõem. */
export function barrasDaLinha(programacoes: readonly Programacao[], dias: readonly CivilDate[]): { barras: Barra[]; faixas: number } {
  const primeiro = dias[0];
  const ultimo = dias.at(-1)!;
  const visiveis = programacoes
    .map((programacao) => ({ programacao, periodo: periodoDe(programacao) }))
    .filter((item): item is { programacao: Programacao; periodo: { inicio: CivilDate; fim: CivilDate } } =>
      item.periodo !== null && item.periodo.fim >= primeiro && item.periodo.inicio <= ultimo)
    .sort((a, b) => a.periodo.inicio.localeCompare(b.periodo.inicio) || a.periodo.fim.localeCompare(b.periodo.fim) || a.programacao.posicao - b.programacao.posicao);
  const fimDasFaixas: number[] = [];
  const barras = visiveis.map(({ programacao, periodo }) => {
    const de = Math.max(0, diferencaDias(primeiro, periodo.inicio));
    const ate = Math.min(dias.length - 1, diferencaDias(primeiro, periodo.fim));
    let faixa = fimDasFaixas.findIndex((fim) => fim < de);
    if (faixa === -1) faixa = fimDasFaixas.length;
    fimDasFaixas[faixa] = ate;
    return { programacao, de, ate, faixa, cortadaAntes: periodo.inicio < primeiro, cortadaDepois: periodo.fim > ultimo };
  });
  return { barras, faixas: Math.max(1, fimDasFaixas.length) };
}
