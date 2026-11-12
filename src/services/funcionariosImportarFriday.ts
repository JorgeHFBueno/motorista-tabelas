import { connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  try { connectFunctionsEmulator(functions, '127.0.0.1', 5001); } catch { /* já conectado */ }
}

// Importar do quadro FUNCIONARIOS do Friday (Function funcionariosImportarFriday; escritorio ou adm2). Contrato: The
// Manuscript, funcionarios.md ("Usuários na WEB") e 05_CADASTROS.md.
export type SituacaoImportar = 'novo' | 'funcionario' | 'vinculado' | 'incompleto' | 'fora';
export type PessoaQuadro = {
  id: string; nome: string; celular: string | null; situacao: SituacaoImportar; uid: string | null; funcionario: string | null;
  motivo: string | null; sugestao: { uid: string; nome: string } | null;
};
export type FuncionarioLivre = { uid: string; nome: string; ativo: boolean };
export type ResultadoImportar = { id: string; nome: string; resultado: 'criado' | 'vinculado' | 'erro'; mensagem?: string };

const chamada = <E, S>() => httpsCallable<E, S>(functions, 'funcionariosImportarFriday', { timeout: 130_000 });

export async function listarQuadroFuncionarios() {
  return (await chamada<{ modo: 'listar' }, { pessoas: PessoaQuadro[]; livres: FuncionarioLivre[] }>()({ modo: 'listar' })).data;
}

export async function criarDoQuadro(ids: string[]) {
  return (await chamada<{ modo: 'criar'; ids: string[] }, { resultados: ResultadoImportar[] }>()({ modo: 'criar', ids })).data.resultados;
}

export async function ligarItemAoFuncionario(itemId: string, uid: string) {
  return (await chamada<{ modo: 'ligar'; itemId: string; uid: string }, { resultado: ResultadoImportar }>()({ modo: 'ligar', itemId, uid })).data.resultado;
}

export const mensagemDaFunction = (e: unknown) => (e instanceof Error && e.message) || 'Não foi possível falar com o servidor.';
