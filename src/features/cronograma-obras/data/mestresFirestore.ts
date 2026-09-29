import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { db } from '../../../firebase';
import { adaptMestresFirestore, type MestresLoadResult } from './mestresFirestoreAdapter';
export { adaptMestresFirestore, MESTRES_ESPERADOS, type MestreFirestore, type MestresLoadResult } from './mestresFirestoreAdapter';

export const MESTRES_COLLECTION = 'monday-mestres';
export const normalizeMestreDocumentId = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const normalizeMestreNome = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('pt-BR');
export function nextMestreColor(existing: readonly string[]): string { const palette = ['3f6c92', '7a5b31', '496f47', '83534b', '525d86', '765d8d', '356b68']; const used = new Set(existing.map((color) => color.replace('#', '').toLowerCase())); return palette.find((color) => !used.has(color)) ?? '3f6c92'; }
export class FirestoreMestresDataSource {
  constructor(private readonly firestore: Firestore = db) {}
  async carregar(): Promise<MestresLoadResult> {
    const snapshots = await getDocs(collection(this.firestore, MESTRES_COLLECTION));
    return adaptMestresFirestore(snapshots.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })));
  }
  async criar(nome: string, cor: string, mestresAtuais: ReadonlyArray<{ id: string; nome: string }>) { const clean = nome.trim(); const id = normalizeMestreDocumentId(clean); if (!clean || !id) throw new Error('Informe um nome válido para o mestre.'); if (mestresAtuais.some((mestre) => normalizeMestreNome(mestre.nome) === normalizeMestreNome(clean))) throw new Error('Já existe um mestre com esse nome.'); const reference = doc(this.firestore, MESTRES_COLLECTION, id); if ((await getDoc(reference)).exists()) throw new Error('Já existe um mestre com este identificador.'); await setDoc(reference, { nome: clean, cor }); return { id, nome: clean, cor: { background: `#${cor}`, text: '#ffffff' } }; }
}
