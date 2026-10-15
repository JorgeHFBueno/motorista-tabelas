import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export type MondaySerpSnapshot = { idObra: string; subcentroErp: string; qtd_notas: number; valor_bruto_servico: number };
export type SyncMondaySerpRequest = { idObra: string; subcentroErp: string };

function snapshotFrom(value: unknown): MondaySerpSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  return typeof data.idObra === 'string' && typeof data.subcentroErp === 'string' && typeof data.qtd_notas === 'number' && Number.isFinite(data.qtd_notas) && typeof data.valor_bruto_servico === 'number' && Number.isFinite(data.valor_bruto_servico)
    ? { idObra: data.idObra, subcentroErp: data.subcentroErp, qtd_notas: data.qtd_notas, valor_bruto_servico: data.valor_bruto_servico }
    : null;
}

export async function loadMondaySerpSnapshot(idObra: string) {
  const snapshot = await getDoc(doc(db, 'monday-serp', idObra));
  return snapshot.exists() ? snapshotFrom(snapshot.data()) : null;
}

export async function syncMondaySerpMeasurements(request: SyncMondaySerpRequest) {
  const callable = httpsCallable<SyncMondaySerpRequest, MondaySerpSnapshot>(functions, 'syncMondaySerpMeasurements');
  return snapshotFrom((await callable(request)).data);
}
