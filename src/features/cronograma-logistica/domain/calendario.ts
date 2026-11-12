import type { CivilDate, Programacao } from './models';
import { periodoDe } from './conflitos';
import { diferencaDias } from './semanas';
import { textoCodigo } from './codigo';

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

export type LinhasPor = 'cod' | 'motorista' | 'veiculo';

/** Nomes atuais dos cadastros (o retrato gravado quando o cadastro não existe mais). */
export interface NomesCalendario {
  nomePessoa: (id: string, retrato: string) => string;
  nomeVeiculo: (id: string, retrato: string) => string;
}

export interface LinhaCalendario { chave: string; nome: string; programacoes: Programacao[] }

/**
 * Linhas do calendário: por Cod, uma por programação, na ordem do código (semana, depois a ordem na semana; sem
 * código no fim); por motorista ou veículo, uma por recurso, em ordem alfabética, com "Sem …" no fim. Por veículo,
 * a programação com mais de um veículo aparece na linha de cada um. Só entram as que têm período nos dias exibidos.
 */
export function linhasDoCalendario(programacoes: readonly Programacao[], dias: readonly CivilDate[], por: LinhasPor, nomes: NomesCalendario): LinhaCalendario[] {
  const primeiro = dias[0];
  const ultimo = dias.at(-1)!;
  const noAlcance = programacoes.filter((programacao) => {
    const periodo = periodoDe(programacao);
    return periodo !== null && periodo.fim >= primeiro && periodo.inicio <= ultimo;
  });
  if (por === 'cod') {
    return [...noAlcance]
      .sort((a, b) => (a.cod === null) !== (b.cod === null)
        ? (a.cod === null ? 1 : -1)
        : a.semanaId.localeCompare(b.semanaId) || (a.cod ?? 0) - (b.cod ?? 0) || a.posicao - b.posicao || a.id.localeCompare(b.id))
      .map((programacao) => ({ chave: programacao.id, nome: programacao.cod === null ? 'Sem código' : textoCodigo(programacao.cod), programacoes: [programacao] }));
  }
  const linhas = new Map<string, LinhaCalendario>();
  const semRecurso: Programacao[] = [];
  for (const programacao of noAlcance) {
    const recursos = por === 'motorista'
      ? (programacao.motorista ? [{ chave: programacao.motorista.id, nome: nomes.nomePessoa(programacao.motorista.id, programacao.motorista.nome) }] : [])
      : programacao.veiculos.map((veiculo) => ({ chave: veiculo.id, nome: nomes.nomeVeiculo(veiculo.id, veiculo.nome) }));
    if (!recursos.length) { semRecurso.push(programacao); continue; }
    for (const { chave, nome } of recursos) {
      const linha = linhas.get(chave) ?? { chave, nome, programacoes: [] };
      if (!linha.programacoes.includes(programacao)) linha.programacoes.push(programacao);
      linhas.set(chave, linha);
    }
  }
  const ordenadas = [...linhas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (semRecurso.length) ordenadas.push({ chave: '__sem__', nome: por === 'motorista' ? 'Sem motorista' : 'Sem veículo', programacoes: semRecurso });
  return ordenadas;
}

/**
 * Dica da barra, nesta ordem: "Cod | Motivo"; os veículos (por veículo, só os que não são o da linha); o motorista
 * (fora das linhas por motorista); o auxiliar, quando há.
 */
export function dicaDaBarra(programacao: Programacao, por: LinhasPor, chaveLinha: string, nomes: NomesCalendario): string[] {
  const veiculos = programacao.veiculos
    .filter((veiculo) => por !== 'veiculo' || veiculo.id !== chaveLinha)
    .map((veiculo) => nomes.nomeVeiculo(veiculo.id, veiculo.nome));
  const pessoa = (ref: Programacao['motorista']) => (ref ? nomes.nomePessoa(ref.id, ref.nome) : null);
  const motorista = por === 'motorista' ? null : pessoa(programacao.motorista);
  const auxiliar = pessoa(programacao.auxiliar);
  return [
    [programacao.cod === null ? 'Sem código' : textoCodigo(programacao.cod), programacao.item.trim() || 'Sem motivo'].join(' | '),
    veiculos.length ? `${veiculos.length > 1 ? 'Veículos' : 'Veículo'}: ${veiculos.join(', ')}` : null,
    motorista && `Motorista: ${motorista}`,
    auxiliar && `Auxiliar: ${auxiliar}`,
  ].filter((linha): linha is string => Boolean(linha));
}
