import type { Conflito } from '../domain/conflitos';
import type { Programacao, ProgramacaoEditavel, RefCadastro } from '../domain/models';
import type { EtiquetaStatus } from '../domain/status';
import type { Opcao } from './campos';

/** Cadastros oficiais já carregados, como opções, e o nome atual de cada referência (cai no retrato gravado). */
export interface CadastrosLogistica {
  /** Itens do quadro FUNCIONARIOS do Friday. */
  motoristas: Opcao[];
  /** Itens do Banco de Currículos do Friday, com a função desejada em `detalhe`. */
  auxiliares: Opcao[];
  veiculos: Opcao[];
  obras: Opcao[];
  /** Etiquetas de status (logistica-config/status). */
  etiquetas: readonly EtiquetaStatus[];
  /** Nome atual de uma pessoa: item do Friday ou UID de funcionarios (linhas de antes, autores das observações). */
  nomePessoa: (id: string, retrato: string) => string;
  nomeVeiculo: (id: string, retrato: string) => string;
  nomeObra: (id: string, retrato: string) => string;
}

export type AbaPainel = 'programacao' | 'observacoes';

export interface AcoesLogistica {
  criar: (semanaId: string, item: string) => void;
  atualizar: (id: string, alteracao: Partial<ProgramacaoEditavel>) => void;
  excluir: (programacao: Programacao) => void;
  abrir: (id: string, aba?: AbaPainel) => void;
  salvarEtiquetas: (etiquetas: EtiquetaStatus[]) => void;
  /** Envia o PDF da nota (troca o que houver); resolve depois de gravar ou de avisar o erro. */
  enviarNota: (programacao: Programacao, arquivo: File) => Promise<void>;
  removerNota: (programacao: Programacao) => void;
  /** Ignora o conflito (some nas duas linhas) ou volta a avisar. */
  ignorarConflito: (programacao: Programacao, conflito: Conflito, ignorar: boolean) => void;
}

/** Conflitos por programação (domain/conflitos.ts). */
export type ConflitosLogistica = ReadonlyMap<string, Conflito[]>;

export const opcaoPessoa = (ref: RefCadastro | null, cadastros: CadastrosLogistica): Opcao | null =>
  ref ? { id: ref.id, nome: cadastros.nomePessoa(ref.id, ref.nome) } : null;
export const opcoesVeiculos = (refs: readonly RefCadastro[], cadastros: CadastrosLogistica): Opcao[] =>
  refs.map((ref) => ({ id: ref.id, nome: cadastros.nomeVeiculo(ref.id, ref.nome) }));
export const opcaoObra = (ref: RefCadastro | null, cadastros: CadastrosLogistica): Opcao | null =>
  ref ? { id: ref.id, nome: cadastros.nomeObra(ref.id, ref.nome) } : null;
export const refPessoa = (opcao: Opcao | null): RefCadastro | null => (opcao ? { id: opcao.id, nome: opcao.nome } : null);
export const refCadastro = (opcao: Opcao | null): RefCadastro | null => (opcao ? { id: opcao.id, nome: opcao.nome } : null);
export const refsCadastro = (opcoes: readonly Opcao[]): RefCadastro[] => opcoes.map((opcao) => ({ id: opcao.id, nome: opcao.nome }));
