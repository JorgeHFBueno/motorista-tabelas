// Colunas restritas do Friday: leitura e gravação dos valores em friday-restritos/{colunaId} (Admin SDK). As regras de
// quem vê ficam em fridayRestritasRegras.ts.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin.js';
import { ehRestrita, type ColunaComRestricao } from './fridayRestritasRegras.js';

type AnyRecord = Record<string, any>;
export * from './fridayRestritasRegras.js';

const refRestritos = (colunaId: number | string) => db.collection('friday-restritos').doc(String(colunaId));

/** Valores das colunas restritas da lista: coluna → { itemId: valor } (sem o documento, vazio). */
export async function valoresRestritos(colunas: ColunaComRestricao[]): Promise<Map<number, AnyRecord>> {
  const restritas = colunas.filter(ehRestrita);
  const m = new Map<number, AnyRecord>();
  if (!restritas.length) return m;
  const snaps = await db.getAll(...restritas.map(c => refRestritos(c.id)));
  restritas.forEach((c, k) => m.set(Number(c.id), (snaps[k].data()?.valores ?? {}) as AnyRecord));
  return m;
}

/** Grava (ou limpa, com undefined) o valor de um item numa coluna restrita. */
export async function gravarRestrito(colunaId: number | string, itemId: number | string, valor: unknown) {
  await refRestritos(colunaId).set({ valores: { [String(itemId)]: valor === undefined ? FieldValue.delete() : valor } }, { merge: true });
}
