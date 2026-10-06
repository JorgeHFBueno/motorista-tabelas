import { collection, getDocs, onSnapshot, type Firestore } from 'firebase/firestore';
import { db } from '../../../../firebase';
import { adaptRawContract, adaptRawCronograma, type CronogramaLoadResult, type RawDocument } from './rawCronogramaAdapter';
import type { MondayObrasChange } from './mondayObrasRealtime';
export { applyMondayObrasChanges } from './mondayObrasRealtime';

export const RAW_COLLECTION = 'monday-obras';

export class RawFirestoreCronogramaDataSource {
  constructor(private readonly firestore: Firestore = db) {}

  async carregar(): Promise<CronogramaLoadResult> {
    const snapshots = await getDocs(collection(this.firestore, RAW_COLLECTION));
    return adaptRawCronograma(snapshots.docs.map((snapshot) => ({ id: snapshot.id, exists: snapshot.exists(), data: snapshot.data() })));
  }

  subscribe(onChanges: (changes: MondayObrasChange[]) => void, onError: (cause: Error) => void): () => void {
    return onSnapshot(collection(this.firestore, RAW_COLLECTION), (snapshot) => {
      const changes = snapshot.docChanges().map((change) => {
        const diagnostics: string[] = [];
        const document: RawDocument = { id: change.doc.id, exists: change.doc.exists(), data: change.doc.data() };
        return { type: change.type, id: change.doc.id, contrato: change.type === 'removed' ? null : adaptRawContract(document, diagnostics), diagnostics };
      });
      onChanges(changes);
    }, (cause) => onError(cause instanceof Error ? cause : new Error(String(cause))));
  }
}
