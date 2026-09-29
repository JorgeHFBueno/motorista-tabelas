import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { db } from '../../../firebase';
import { adaptMestresFirestore, type MestresLoadResult } from './mestresFirestoreAdapter';
export { adaptMestresFirestore, MESTRES_ESPERADOS, type MestreFirestore, type MestresLoadResult } from './mestresFirestoreAdapter';

export const MESTRES_COLLECTION = 'monday-mestres';
export class FirestoreMestresDataSource {
  constructor(private readonly firestore: Firestore = db) {}
  async carregar(): Promise<MestresLoadResult> {
    const snapshots = await getDocs(collection(this.firestore, MESTRES_COLLECTION));
    return adaptMestresFirestore(snapshots.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })));
  }
}
