import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '../firebase';

import { normalizarChecklist, type Checklist } from './checklist-normalizer';

export type { Checklist, ChecklistFoto, ChecklistItem, ChecklistStatus } from './checklist-normalizer';

export async function listarChecklists(): Promise<Checklist[]> {
  const snapshot = await getDocs(collection(db, 'checklists-v2'));
  return snapshot.docs.map((d) => normalizarChecklist(d.data(), d.id));
}

export async function obterChecklist(id: string): Promise<Checklist | null> {
  const snapshot = await getDoc(doc(db, 'checklists-v2', id));
  return snapshot.exists() ? normalizarChecklist(snapshot.data(), snapshot.id) : null;
}

/** The converted legacy checklist of an activity (old link /registros/:atividadeId/checklist). */
export async function checklistIdDaAtividade(atividadeId: string): Promise<string | null> {
  const snapshot = await getDocs(query(collection(db, 'checklists-v2'), where('atividadeOrigemId', '==', atividadeId), limit(1)));
  return snapshot.docs[0]?.id ?? null;
}

const urlCache = new Map<string, Promise<string>>();
/** Download URL of a photo by its Storage path (new checklists-v2/... or legacy checklists/... paths). */
export function urlDaFoto(path: string): Promise<string> {
  if (!urlCache.has(path)) urlCache.set(path, getDownloadURL(ref(storage, path)));
  return urlCache.get(path)!;
}
