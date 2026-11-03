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
  primeiroDia: CivilDate;
}

/**
 * Conflito: no mesmo dia, a mesma pessoa (motorista ou auxiliar) ou o mesmo veículo em duas programações.
 * Só aviso; devolve, por programação, um conflito por (recurso, outra programação), com o primeiro dia em comum.
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
    for (const pessoa of [programacao.motorista, programacao.auxiliar]) if (pessoa) recursos.add(`p:${pessoa.uid}`);
    if (programacao.veiculo) recursos.add(`v:${programacao.veiculo.id}`);
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
          ? programacao.veiculo!
          : [programacao.motorista, programacao.auxiliar].find((pessoa) => pessoa?.uid === id)!;
        const retrato = ref.nome;
        resultado.set(programacao.id, [
          ...(resultado.get(programacao.id) ?? []),
          { tipo, nome: nomeAtual(tipo, id, retrato), outraId: outra.id, outroItem: outra.item, primeiroDia: dia },
        ]);
      }
    }
  }
  return resultado;
}

export function textoConflito(conflito: Conflito): string {
  return `${conflito.nome} também em "${conflito.outroItem}" (${ddmm(conflito.primeiroDia)})`;
}
