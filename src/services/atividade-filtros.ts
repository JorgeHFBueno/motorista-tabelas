import type { AtividadeV2 } from './atividade-normalizer';

/** Filters of /frota/registros. Empty values mean "no filter". Local is the contract's `destino`. */
export type FiltrosAtividade = {
  /** yyyy-mm-dd, inclusive, local time. */
  dataInicial: string;
  dataFinal: string;
  tipo: 'todos' | 'saida' | 'chegada';
  veiculos: string[];
  motoristas: string[];
  locais: string[];
  obras: string[];
};

export type AtividadeComData = AtividadeV2 & { dataJS: Date | null };

export const FILTROS_VAZIOS: FiltrosAtividade = {
  dataInicial: '',
  dataFinal: '',
  tipo: 'todos',
  veiculos: [],
  motoristas: [],
  locais: [],
  obras: [],
};

/** Label used both in the table and in the vehicle filter: plate, plus name when present. */
export function rotuloVeiculo(a: Pick<AtividadeV2, 'placa' | 'veiculoNome'>): string {
  return [a.placa, a.veiculoNome].filter(Boolean).join(' — ');
}

const naLista = (lista: string[], valor: string | undefined) => lista.length === 0 || lista.includes(valor ?? '');

export function filtrarAtividades<T extends AtividadeComData>(rows: T[], f: FiltrosAtividade): T[] {
  const inicio = f.dataInicial ? new Date(`${f.dataInicial}T00:00:00`) : null;
  const fim = f.dataFinal ? new Date(`${f.dataFinal}T23:59:59.999`) : null;
  return rows.filter((row) => {
    if (inicio || fim) {
      if (!row.dataJS) return false;
      if (inicio && row.dataJS < inicio) return false;
      if (fim && row.dataJS > fim) return false;
    }
    if (f.tipo !== 'todos' && row.tipo !== f.tipo) return false;
    return (
      naLista(f.veiculos, rotuloVeiculo(row)) &&
      naLista(f.motoristas, row.motorista) &&
      naLista(f.locais, row.destino) &&
      naLista(f.obras, row.obra)
    );
  });
}

/** Distinct, non-empty, sorted values for a filter's options. */
export function opcoesDistintas(valores: Array<string | undefined>): string[] {
  return Array.from(new Set(valores.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
