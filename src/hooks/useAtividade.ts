import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export type Atividade = {
  id: string;
  data?: unknown;
  destino?: string;
  km?: number | string;
  motivo?: string;
  motorista?: string;
  placa?: string;
  tipo?: string;
  checklistSaidaConcluido?: boolean;
  checklistSaidaTotalItens?: number;
  checklistSaidaItensComAvaria?: number;
};

export default function useAtividade() {
  const [data, setData] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'atividades'));
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Atividade[];
        setData(docs);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { data, loading };
}
