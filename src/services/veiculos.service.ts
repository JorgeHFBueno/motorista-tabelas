import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface VeiculoOption {
  id: string;
  identificador: string;
  categoria: string;
  quilometragemUltima: number | null;
}

export async function listVeiculosAtivos(): Promise<VeiculoOption[]> {
  // Query simplificada para reduzir dependência de índice composto no Firestore.
  const snapshot = await getDocs(collection(db, 'veiculos'));

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        identificador?: unknown;
        ativo?: unknown;
        categoria?: unknown;
        quilometragemUltima?: unknown;
      };
      if (data.ativo !== true) return null;
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
    .filter((item): item is VeiculoOption => item !== null)
    .sort((a, b) => a.identificador.localeCompare(b.identificador));
}