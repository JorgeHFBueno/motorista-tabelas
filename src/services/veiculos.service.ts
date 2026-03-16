import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface VeiculoOption {
  id: string;
  identificador: string;
  categoria: string;
  quilometragemUltima: number | null;
}

export async function listVeiculosAtivos(): Promise<VeiculoOption[]> {
  const snapshot = await getDocs(
    query(collection(db, 'veiculos'), where('ativo', '==', true), orderBy('identificador')),
  );

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        identificador?: unknown;
        categoria?: unknown;
        quilometragemUltima?: unknown;
      };
      const identificador = typeof data.identificador === 'string' ? data.identificador.trim() : '';
      if (!identificador) return null;

      const quilometragemUltima =
        typeof data.quilometragemUltima === 'number' && Number.isFinite(data.quilometragemUltima)
          ? Math.trunc(data.quilometragemUltima)
          : null;

      return {
        id: doc.id,
        identificador,
        categoria: typeof data.categoria === 'string' ? data.categoria : '',
        quilometragemUltima,
      };
    })
    .filter((item): item is VeiculoOption => item !== null);
}