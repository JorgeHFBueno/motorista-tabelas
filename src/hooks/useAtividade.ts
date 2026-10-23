import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarAtividade, type AtividadeV2 } from '../services/atividade-normalizer';

export type Atividade = AtividadeV2;

export default function useAtividade() {
  const [data, setData] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'atividades'));
        setData(snapshot.docs.map((doc) => normalizarAtividade(doc.data(), doc.id)));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { data, loading };
}
