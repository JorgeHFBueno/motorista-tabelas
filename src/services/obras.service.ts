import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { obraFromV2, obraSelecionavel, sortObras, type ObraV2 } from '../utils/cadastrosV2';

// Obras só por ID de obras-v2 (The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md). O cadastro é do Friday.
export async function listObrasAtivas(): Promise<ObraV2[]> {
  const snapshot = await getDocs(collection(db, 'obras-v2'));
  return sortObras(snapshot.docs
    .map((item) => obraFromV2(item.id, item.data()))
    .filter((obra): obra is ObraV2 => obra !== null && obraSelecionavel(obra)));
}
