import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export async function listMotoristasAtivos(): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'motoristas'), where('ativo', '==', true), orderBy('nome')),
  );

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown };
      return typeof data.nome === 'string' ? data.nome.trim() : '';
    })
    .filter(Boolean);
}