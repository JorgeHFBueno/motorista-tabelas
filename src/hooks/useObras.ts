import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, getDocs, orderBy,
  query, serverTimestamp, type DocumentData,
  type QuerySnapshot,} from 'firebase/firestore';
import { db } from '../firebase';
import type { Obra } from '../types/Obra';

const COLLECTION_NAME = 'obras';

const mapSnapshot = (snapshot: QuerySnapshot<DocumentData>): Obra[] =>
  snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Obra, 'id'>),
  }));

interface UseObrasOptions {
  loadOnMount?: boolean;
  refreshOnAdd?: boolean;
}

export default function useObras(options: UseObrasOptions = {}) {
  const { loadOnMount = true, refreshOnAdd = true } = options;
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadObras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const obrasRef = collection(db, COLLECTION_NAME);
      // Primeiro tenta ordenar por createdAt (padrão mais recente), com fallback para nome.
      const snapshot = await getDocs(query(obrasRef, orderBy('createdAt', 'desc')));
      const mapped = mapSnapshot(snapshot);
      const hasCreatedAt = mapped.some((obra) => obra.createdAt);
      if (hasCreatedAt || mapped.length === 0) {
        setObras(mapped);
        return;
      }

      const fallbackSnapshot = await getDocs(query(obrasRef, orderBy('nome', 'asc')));
      setObras(mapSnapshot(fallbackSnapshot));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadOnMount) return;
    void loadObras();
  }, [loadOnMount, loadObras]);

  const addObra = useCallback(async (nome: string) => {
    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      throw new Error('Informe o nome da obra.');
    }

    await addDoc(collection(db, COLLECTION_NAME), {
      nome: trimmedNome,
      createdAt: serverTimestamp(),
    });

    if (refreshOnAdd) {
      await loadObras();
    }
  }, [loadObras, refreshOnAdd]);

  return {
    obras,
    loading,
    error,
    reload: loadObras,
    addObra,
  } as const;
}