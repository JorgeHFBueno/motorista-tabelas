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
  semanaId: string;
  item: string;
  status: string;
  inicio: CivilDate | null;
  fim: CivilDate | null;
  motorista: RefPessoa | null;
  auxiliar: RefPessoa | null;
  veiculo: RefCadastro | null;
  obra: RefCadastro | null;
  posicao: number;
}

/** Campos que a tela altera numa programação. */
export type ProgramacaoEditavel = Pick<Programacao, 'item' | 'status' | 'inicio' | 'fim' | 'motorista' | 'auxiliar' | 'veiculo' | 'obra'>;
