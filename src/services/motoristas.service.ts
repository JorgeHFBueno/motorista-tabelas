import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface MotoristaOption { id: string; nome: string }

export async function listMotoristasAtivosDetalhados(): Promise<MotoristaOption[]> {
  // Query simplificada para reduzir dependência de índice composto no Firestore.
  const snapshot = await getDocs(collection(db, 'motoristas'));

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown; ativo?: unknown };
      if (data.ativo !== true) return '';
      const nome = typeof data.nome === 'string' ? data.nome.trim() : '';
      return nome ? { id: doc.id, nome } : null;
    })
    .filter((item): item is MotoristaOption => item !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function listMotoristasAtivos(): Promise<string[]> {
  return (await listMotoristasAtivosDetalhados()).map((item) => item.nome);
}
