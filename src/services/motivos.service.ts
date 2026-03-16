import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export async function listMotivosCombustivelAtivos(): Promise<string[]> {
  // Query simplificada para reduzir dependência de índice composto no Firestore.
  const snapshot = await getDocs(collection(db, 'motivos'));

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown; ativo?: unknown };
      if (data.ativo !== true) return '';
      return typeof data.nome === 'string' ? data.nome.trim() : '';
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}