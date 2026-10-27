import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { db } from '../../../../firebase';
import { adaptObraV2Contract, type ObraV2Document } from './obrasV2CronogramaAdapter';
import type { ContratosChange } from './contratosRealtime';
export { applyContratosChanges } from './contratosRealtime';

export const OBRAS_V2_COLLECTION = 'obras-v2';

/** Contratos de obras-v2 ligados ao Friday, em tempo real e só leitura. */
export class ObrasV2CronogramaDataSource {
  private readonly firestore: Firestore;
  constructor(firestore: Firestore = db) { this.firestore = firestore; }

  subscribe(onChanges: (changes: ContratosChange[]) => void, onError: (cause: Error) => void): () => void {
    return onSnapshot(query(collection(this.firestore, OBRAS_V2_COLLECTION), where('friday.ok', '==', true)), (snapshot) => {
      const changes = snapshot.docChanges().map((change) => {
        const diagnostics: string[] = [];
        const document: ObraV2Document = { id: change.doc.id, exists: change.doc.exists(), data: change.doc.data() };
        return { type: change.type, id: change.doc.id, contrato: change.type === 'removed' ? null : adaptObraV2Contract(document, diagnostics), diagnostics };
      });
      onChanges(changes);
    }, (cause) => onError(cause instanceof Error ? cause : new Error(String(cause))));
  }
}
