import type { CivilDate, Programacao } from './models';
import { ddmm, diferencaDias, somarDias } from './semanas';

/** Período efetivo: só um dos dois preenchido vale como um dia; sem nenhum, a linha não tem período. */
export function periodoDe(programacao: Pick<Programacao, 'inicio' | 'fim'>): { inicio: CivilDate; fim: CivilDate } | null {
  const inicio = programacao.inicio ?? programacao.fim;
  const fim = programacao.fim ?? programacao.inicio;
  if (!inicio || !fim) return null;
  return fim < inicio ? { inicio: fim, fim: inicio } : { inicio, fim };
}

export function diasDoPeriodo(periodo: { inicio: CivilDate; fim: CivilDate }): CivilDate[] {
  return Array.from({ length: diferencaDias(periodo.inicio, periodo.fim) + 1 }, (_, index) => somarDias(periodo.inicio, index));
}

export interface Conflito {
  tipo: 'pessoa' | 'veiculo';
  nome: string;
  outraId: string;
  outroItem: string;
  outroCod: number | null;
  primeiroDia: CivilDate;
  /** "p:id" (pessoa) ou "v:id" (veículo) e a outra programação: o que se grava em `conflitosIgnorados`. */
  chave: string;
  /** Uma das duas programações mandou ignorar este conflito: some do aviso nas duas. */
  ignorado: boolean;
}

/** Chave com que uma programação ignora o conflito com a outra no mesmo recurso. */
export const chaveConflito = (recurso: string, outraId: string) => `${recurso}|${outraId}`;

/**
 * Conflito: no mesmo dia, a mesma pessoa (motorista ou auxiliar) ou o mesmo veículo em duas programações.
 * Só aviso; devolve, por programação, um conflito por (recurso, outra programação), com o primeiro dia em comum,
 * inclusive os ignorados (marcados; conflitosAtivos e conflitosIgnorados separam).
 */
export function conflitosPorProgramacao(
  programacoes: readonly Programacao[],
  nomeAtual: (tipo: 'pessoa' | 'veiculo', id: string, retrato: string) => string = (_tipo, _id, retrato) => retrato,
): Map<string, Conflito[]> {
  const ocupacao = new Map<string, Programacao[]>(); // "dia|recurso" → programações
  for (const programacao of programacoes) {
    const periodo = periodoDe(programacao);
    if (!periodo) continue;
    const recursos = new Set<string>();
    for (const pessoa of [programacao.motorista, programacao.auxiliar]) if (pessoa) recursos.add(`p:${pessoa.id}`);
    for (const veiculo of programacao.veiculos) recursos.add(`v:${veiculo.id}`);
    for (const dia of diasDoPeriodo(periodo)) {
      for (const recurso of recursos) {
        const chave = `${dia}|${recurso}`;
        ocupacao.set(chave, [...(ocupacao.get(chave) ?? []), programacao]);
      }
    }
  }
  const resultado = new Map<string, Conflito[]>();
  const vistos = new Set<string>();
  for (const [chave, lista] of [...ocupacao.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (lista.length < 2) continue;
    const [dia, recurso] = chave.split('|');
    const tipo = recurso.startsWith('p:') ? 'pessoa' : 'veiculo';
    const id = recurso.slice(2);
    for (const programacao of lista) {
      for (const outra of lista) {
        if (outra.id === programacao.id) continue;
        const marca = `${programacao.id}|${recurso}|${outra.id}`;
        if (vistos.has(marca)) continue;
        vistos.add(marca);
        const ref = tipo === 'veiculo'
          ? programacao.veiculos.find((veiculo) => veiculo.id === id)!
          : [programacao.motorista, programacao.auxiliar].find((pessoa) => pessoa?.id === id)!;
        const retrato = ref.nome;
        const chaveIgnorar = chaveConflito(recurso, outra.id);
        const ignorado = programacao.conflitosIgnorados.includes(chaveIgnorar) || outra.conflitosIgnorados.includes(chaveConflito(recurso, programacao.id));
        resultado.set(programacao.id, [
          ...(resultado.get(programacao.id) ?? []),
          { tipo, nome: nomeAtual(tipo, id, retrato), outraId: outra.id, outroItem: outra.item, outroCod: outra.cod, primeiroDia: dia, chave: chaveIgnorar, ignorado },
        ]);
      }
    }
  }
  return resultado;
}

function separar(todos: ReadonlyMap<string, Conflito[]>, ignorado: boolean): Map<string, Conflito[]> {
  const mapa = new Map<string, Conflito[]>();
  for (const [id, lista] of todos) {
    const filtrados = lista.filter((conflito) => conflito.ignorado === ignorado);
    if (filtrados.length) mapa.set(id, filtrados);
  }
  return mapa;
}

/** Só os conflitos que avisam (os que ninguém ignorou). */
export const conflitosAtivos = (todos: ReadonlyMap<string, Conflito[]>) => separar(todos, false);
/** Só os ignorados (para voltar a avisar). */
export const conflitosIgnorados = (todos: ReadonlyMap<string, Conflito[]>) => separar(todos, true);

export interface ItemConflito { programacao: Programacao; conflito: Conflito }

/**
 * Os conflitos das programações, um por par (as duas linhas e o mesmo recurso aparecem uma vez só), os que avisam
 * primeiro. Ignorar some com o aviso nas duas linhas; "Voltar a avisar" desfaz.
 */
export function paresDeConflito(programacoes: readonly Programacao[], conflitos: (id: string) => readonly Conflito[]): ItemConflito[] {
  const vistos = new Set<string>();
  const itens: ItemConflito[] = [];
  for (const programacao of programacoes) {
    for (const conflito of conflitos(programacao.id)) {
      const recurso = conflito.chave.split('|')[0];
      const par = `${[programacao.id, conflito.outraId].sort().join('|')}|${recurso}`;
      if (vistos.has(par)) continue;
      vistos.add(par);
      itens.push({ programacao, conflito });
    }
  }
  return itens.sort((a, b) => Number(a.conflito.ignorado) - Number(b.conflito.ignorado));
}

export function textoConflito(conflito: Conflito): string {
  return `${conflito.nome} também em "${conflito.outroItem}" (${ddmm(conflito.primeiroDia)})`;
}
