import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

type Atividade = {
  id: string;
  data?: any;
  destino?: string;
  km?: number;
  motivo?: string;
  motorista?: string;
  placa?: string;
  tipo?: string;
};

export default function useAtividade() {
  const [data, setData] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'atividade'));
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