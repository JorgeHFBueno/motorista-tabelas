import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '../firebase';
import type { AtividadeSaida, ChecklistSaidaItem } from '../types/checklistSaida';

export async function getAtividadeSaida(atividadeId: string): Promise<AtividadeSaida | null> {
  const snapshot = await getDoc(doc(db, 'atividades', atividadeId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as Omit<AtividadeSaida, 'id'>),
  };
}

export async function getChecklistSaidaItens(atividadeId: string): Promise<ChecklistSaidaItem[]> {
  const snapshot = await getDocs(collection(db, 'atividades', atividadeId, 'checklist_saida'));

  return snapshot.docs.map((itemDoc) => ({
    id: itemDoc.id,
    ...(itemDoc.data() as Omit<ChecklistSaidaItem, 'id'>),
  }));
}

export async function getChecklistSaidaDownloadUrl(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}
