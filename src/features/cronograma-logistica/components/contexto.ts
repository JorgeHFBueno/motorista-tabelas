import type { Conflito } from '../domain/conflitos';
import type { Programacao, ProgramacaoEditavel, RefCadastro, RefPessoa } from '../domain/models';
import type { Opcao } from './campos';

/** Cadastros oficiais já carregados, como opções, e o nome atual de cada referência (cai no retrato gravado). */
export interface CadastrosLogistica {
  motoristas: Opcao[];
  pessoas: Opcao[];
  veiculos: Opcao[];
  obras: Opcao[];
  nomePessoa: (uid: string, retrato: string) => string;
  nomeVeiculo: (id: string, retrato: string) => string;
  nomeObra: (id: string, retrato: string) => string;
}

export type AbaPainel = 'programacao' | 'observacoes';

export interface AcoesLogistica {
  criar: (semanaId: string, item: string) => void;
  atualizar: (id: string, alteracao: Partial<ProgramacaoEditavel>) => void;
  excluir: (programacao: Programacao) => void;
  abrir: (id: string, aba?: AbaPainel) => void;
}

export type ConflitosLogistica = ReadonlyMap<string, Conflito[]>;

export const opcaoPessoa = (ref: RefPessoa | null, cadastros: CadastrosLogistica): Opcao | null =>
  ref ? { id: ref.uid, nome: cadastros.nomePessoa(ref.uid, ref.nome) } : null;
export const opcoesVeiculos = (refs: readonly RefCadastro[], cadastros: CadastrosLogistica): Opcao[] =>
  refs.map((ref) => ({ id: ref.id, nome: cadastros.nomeVeiculo(ref.id, ref.nome) }));
export const opcaoObra = (ref: RefCadastro | null, cadastros: CadastrosLogistica): Opcao | null =>
  ref ? { id: ref.id, nome: cadastros.nomeObra(ref.id, ref.nome) } : null;
export const refPessoa = (opcao: Opcao | null): RefPessoa | null => (opcao ? { uid: opcao.id, nome: opcao.nome } : null);
export const refCadastro = (opcao: Opcao | null): RefCadastro | null => (opcao ? { id: opcao.id, nome: opcao.nome } : null);
export const refsCadastro = (opcoes: readonly Opcao[]): RefCadastro[] => opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome }));
