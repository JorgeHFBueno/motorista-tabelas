import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { pessoaFromFuncionario, sortPessoas, type PessoaV2 } from '../utils/cadastrosV2';

// Pessoas só por UID de funcionarios (The Manuscript, 01_FIRESTORE/COLECOES/funcionarios.md).
export async function listFuncionariosAtivos(): Promise<PessoaV2[]> {
  const snapshot = await getDocs(collection(db, 'funcionarios'));
  return sortPessoas(snapshot.docs
    .map((item) => pessoaFromFuncionario(item.id, item.data()))
    .filter((pessoa): pessoa is PessoaV2 => pessoa !== null));
}
