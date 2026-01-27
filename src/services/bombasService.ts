import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Bomba } from '../types/Bomba';

const COLLECTION_NAME = 'bombas';

export async function listBombas(): Promise<Bomba[]> {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<Bomba, 'id'>;
    return {
      id: doc.id,
      ...data,
    };
  });
}

export default { listBombas };