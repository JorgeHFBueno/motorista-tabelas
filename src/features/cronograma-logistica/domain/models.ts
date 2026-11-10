/** Contrato: The Manuscript, 01_FIRESTORE/COLECOES/logistica.md. Datas civis AAAA-MM-DD. */
export type CivilDate = string;

export interface RefPessoa { uid: string; nome: string }
export interface RefCadastro { id: string; nome: string }

export interface Semana {
  id: string;
  inicio: CivilDate;
  fim: CivilDate;
  abertura: 'automatica' | 'manual';
}

export interface Programacao {
  id: string;
  /** Código da linha (domain/codigo.ts); null até receber um (linhas de antes do código). */
  cod: string | null;
  semanaId: string;
  item: string;
  status: string;
  inicio: CivilDate | null;
  fim: CivilDate | null;
  motorista: RefPessoa | null;
  auxiliar: RefPessoa | null;
  /** Um ou mais veículos (até MAX_VEICULOS), sem repetir. */
  veiculos: RefCadastro[];
  obra: RefCadastro | null;
  posicao: number;
}

export const MAX_VEICULOS = 4;

/** `veiculos` do documento; os gravados antes da lista guardam um só, em `veiculo`. Sem repetir, até MAX_VEICULOS. */
export function veiculosDoDocumento(value: { veiculos?: unknown; veiculo?: unknown }): RefCadastro[] {
  const lista: unknown[] = Array.isArray(value.veiculos) ? value.veiculos : [value.veiculo];
  const unicos = new Map<string, RefCadastro>();
  for (const item of lista) {
    const ref = item as { id?: unknown; nome?: unknown } | null | undefined;
    if (ref && typeof ref.id === 'string' && ref.id && !unicos.has(ref.id)) {
      unicos.set(ref.id, { id: ref.id, nome: typeof ref.nome === 'string' ? ref.nome : '' });
    }
  }
  return [...unicos.values()].slice(0, MAX_VEICULOS);
}

export interface AnexoObservacao {
  caminho: string;
  url: string;
  nome: string;
  tipo: string;
  tamanho: number;
}

/** Observação de uma programação: texto e/ou arquivos, de um autor; não se edita, só se exclui. */
export interface Observacao {
  id: string;
  programacaoId: string;
  texto: string;
  anexos: AnexoObservacao[];
  autor: RefPessoa;
  /** Milissegundos; null enquanto o horário do servidor não volta. */
  criadoEm: number | null;
}

/** Campos que a tela altera numa programação. */
export type ProgramacaoEditavel = Pick<Programacao, 'item' | 'status' | 'inicio' | 'fim' | 'motorista' | 'auxiliar' | 'veiculos' | 'obra' | 'posicao'>;
