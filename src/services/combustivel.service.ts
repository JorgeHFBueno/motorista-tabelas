import { doc, getDoc, getDocs, collection, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

const ADM1_FALLBACK_FOLGA = 15;

export interface Adm1MontanteReference {
  montanteBase: number;
  folga: number;
}

export async function getInitialLiValue(): Promise<number | null> {
  const dieselRef = doc(db, 'bombas', 'diesel_patio');
  const dieselSnapshot = await getDoc(dieselRef);

  if (dieselSnapshot.exists()) {
    const montanteAtual = toInt((dieselSnapshot.data() as { montanteAtual?: unknown }).montanteAtual);
    if (montanteAtual !== null) {
      return montanteAtual;
    }
  }

  const lastSnapshot = await getDocs(
    query(collection(db, '03-combustivel'), orderBy('data', 'desc'), limit(1)),
  );
  const lastDoc = lastSnapshot.docs[0];
  if (!lastDoc) return null;

  return toInt((lastDoc.data() as { lf?: unknown }).lf);
}

export async function getAdm1MontanteReference(): Promise<Adm1MontanteReference> {
  const dieselRef = doc(db, 'bombas', 'diesel_patio');
  const dieselSnapshot = await getDoc(dieselRef);

  if (dieselSnapshot.exists()) {
    const dieselData = dieselSnapshot.data() as { montanteAtual?: unknown; folgaLitros?: unknown };
    const montanteAtual = toInt(dieselData.montanteAtual);
    const folgaLitros = toInt(dieselData.folgaLitros);

    if (montanteAtual !== null && folgaLitros !== null) {
      return {
        montanteBase: montanteAtual,
        folga: folgaLitros,
      };
    }
  }

  const lastSnapshot = await getDocs(
    query(collection(db, '03-combustivel'), orderBy('data', 'desc'), limit(1)),
  );
  const lastDoc = lastSnapshot.docs[0];

  if (lastDoc) {
    const lastLf = toInt((lastDoc.data() as { lf?: unknown }).lf);
    if (lastLf !== null) {
      return {
        montanteBase: lastLf,
        folga: ADM1_FALLBACK_FOLGA,
      };
    }
  }

  throw new Error('Montante indisponível');
}