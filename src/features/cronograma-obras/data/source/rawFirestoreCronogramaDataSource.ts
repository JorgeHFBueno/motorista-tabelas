import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { db } from '../../../../firebase';
import { adaptRawCronograma, type CronogramaLoadResult } from './rawCronogramaAdapter';

export const RAW_COLLECTION = 'monday-obras';

export class RawFirestoreCronogramaDataSource {
  constructor(private readonly firestore: Firestore = db) {}

  async carregar(): Promise<CronogramaLoadResult> {
    const snapshots = await getDocs(collection(this.firestore, RAW_COLLECTION));
    return adaptRawCronograma(snapshots.docs.map((snapshot) => ({ id: snapshot.id, exists: snapshot.exists(), data: snapshot.data() })));
  }
}
