import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

export async function listObrasNames(): Promise<string[]> {
  const snapshot = await getDocs(query(collection(db, 'obras'), orderBy('nome')));
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown };
      return typeof data.nome === 'string' ? data.nome.trim() : '';
    })
    .filter(Boolean);
}