import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { adaptarDocumento, type ObraPrazo } from '../domain/prazos';
import { FIRESTORE_COLLECTION } from './mondayPrazosSchema';

/** A mesma coleção espelhada do Monday usada pelo Cronograma. */
export async function carregarPrazos(): Promise<ObraPrazo[]> {
  const snapshot = await getDocs(collection(db, FIRESTORE_COLLECTION));
  return snapshot.docs.flatMap((doc) => { const obra = adaptarDocumento(doc.id, doc.data()); return obra ? [obra] : []; });
}
