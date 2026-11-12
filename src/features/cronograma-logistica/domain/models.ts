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
  cod: number | null;
  /** Código ainda gravado no formato anterior (texto); `cod` já traz o convertido, que a WEB grava no lugar. */
  codAntigo: string | null;
  semanaId: string;
  item: string;
  status: string;
  inicio: CivilDate | null;
  fim: CivilDate | null;
  /** Item do quadro FUNCIONARIOS do Friday (id do item); as linhas de antes guardam o UID de funcionarios no mesmo `id`. */
  motorista: RefCadastro | null;
  /** Item do Banco de Currículos do Friday; as linhas de antes, o UID de funcionarios. */
  auxiliar: RefCadastro | null;
  /** Um ou mais veículos (até MAX_VEICULOS), sem repetir. */
  veiculos: RefCadastro[];
  obra: RefCadastro | null;
  /** Texto livre da expedição. */
  expedicao: string;
  posicao: number;
  /** Conflitos que alguém mandou ignorar, pela chave "recurso|outra programação" (domain/conflitos.ts). */
  conflitosIgnorados: string[];
  /** Quem criou e quem alterou por último: UID e o nome no momento (as linhas de antes só têm o UID). */
  criadoPor: RefPessoa | null;
  criadoEm: number | null;
  modificadoPor: RefPessoa | null;
  modificadoEm: number | null;
}

export const MAX_VEICULOS = 4;

/** Motorista/auxiliar gravado: `{id, nome}` (item do Friday) ou, nas linhas de antes, `{uid, nome}` (funcionarios). */
export function pessoaDoDocumento(value: unknown): RefCadastro | null {
  const ref = value as { id?: unknown; uid?: unknown; nome?: unknown } | null | undefined;
  const id = typeof ref?.id === 'string' && ref.id ? ref.id : typeof ref?.uid === 'string' && ref.uid ? ref.uid : null;
  return id ? { id, nome: typeof ref?.nome === 'string' ? ref.nome : '' } : null;
}

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
export type ProgramacaoEditavel = Pick<Programacao, 'item' | 'status' | 'inicio' | 'fim' | 'motorista' | 'auxiliar' | 'veiculos' | 'obra' | 'expedicao' | 'posicao'>;
