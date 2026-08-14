import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export type ObraSelecaoOption = {
  id: string;
  nome: string;
  local?: string;
};

export async function listObrasNames(): Promise<string[]> {
  const snapshot = await getDocs(query(collection(db, 'obras'), orderBy('nome')));
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown };
      return typeof data.nome === 'string' ? data.nome.trim() : '';
    })
    .filter(Boolean);
}

export async function listObrasAtivasParaSelecao(): Promise<ObraSelecaoOption[]> {
  const snapshot = await getDocs(query(collection(db, 'obras'), where('ativa', '==', true)));
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as { nome?: unknown; local?: unknown };
      const nome = typeof data.nome === 'string' ? data.nome.trim() : '';
      const local = typeof data.local === 'string' ? data.local.trim() : '';
      if (!nome) return null;
      return {
        id: doc.id,
        nome,
        local: local || undefined,
      };
    })
    .filter((obra): obra is ObraSelecaoOption => obra !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}
