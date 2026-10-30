import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizarAtividade, type AtividadeV2 } from '../../services/atividade-normalizer';
import { normalizarMovimentoCombustivel, type NormalizedCombustivel } from '../../services/combustivel-normalizer';
import { loadMondaySerpSnapshot, syncMondaySerpMeasurements } from '../../services/monday-serp.service';
import type { MedicoesObra } from './obraRelatorioPdf';
import { CRONOGRAMA_COLLECTION } from '../cronograma-obras/data/cronogramaFirestore';
import { MESTRES_COLLECTION } from '../cronograma-obras/data/mestresFirestore';
import { obraDetalheFromV2, type AlocacaoObra, type ObraDetalhe } from './obrasDomain';

const OBRAS_V2 = 'obras-v2';

export async function listarObras(): Promise<ObraDetalhe[]> {
  const snapshot = await getDocs(collection(db, OBRAS_V2));
  return snapshot.docs
    .map((item) => obraDetalheFromV2(item.id, item.data()))
    .filter((obra): obra is ObraDetalhe => obra !== null);
}

export async function carregarObra(id: string): Promise<ObraDetalhe | null> {
  const snapshot = await getDoc(doc(db, OBRAS_V2, id));
  return snapshot.exists() ? obraDetalheFromV2(snapshot.id, snapshot.data()) : null;
}

/** Grava só `local` (engenharia ou adm2 nas Rules). Os registros já feitos guardam o local da época em `id_obra_snap`. */
export async function gravarLocalObra(id: string, local: string): Promise<string> {
  const limpo = local.trim();
  if (!limpo) throw new Error('O local não pode ficar vazio.');
  await updateDoc(doc(db, OBRAS_V2, id), { local: limpo });
  return limpo;
}

/** Como o saldo do CronoObra: consulta o ERP (Query 55) e, se falhar, usa a última cópia de `monday-serp/{id}`. */
export async function carregarMedicoesDaObra(idObra: string, subcentroErp: string): Promise<MedicoesObra> {
  try {
    return { snapshot: await syncMondaySerpMeasurements({ idObra, subcentroErp }), atualizadoAgora: true };
  } catch (err) {
    console.warn('Medições não atualizadas pelo ERP; usando a cópia salva', err);
    return { snapshot: await loadMondaySerpSnapshot(idObra), atualizadoAgora: false };
  }
}

export async function carregarAlocacoesDaObra(contratoId: string): Promise<AlocacaoObra[]> {
  const snapshot = await getDocs(query(collection(db, CRONOGRAMA_COLLECTION), where('contratoId', '==', contratoId)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      mestreId: typeof data.mestreId === 'string' ? data.mestreId : '',
      ...(typeof data.obraId === 'string' ? { obraId: data.obraId } : {}),
      inicio: typeof data.inicio === 'string' ? data.inicio : '',
      tempoPlanejado: typeof data.tempoPlanejado === 'number' ? data.tempoPlanejado : 0,
    };
  });
}

export async function carregarNomesMestres(): Promise<Record<string, string>> {
  const snapshot = await getDocs(collection(db, MESTRES_COLLECTION));
  return Object.fromEntries(snapshot.docs.map((item) => [item.id, typeof item.data().nome === 'string' ? item.data().nome : item.id]));
}

export async function carregarAtividadesDaObra(obraId: string): Promise<AtividadeV2[]> {
  const snapshot = await getDocs(query(collection(db, 'atividades'), where('id_obra', '==', obraId)));
  return snapshot.docs.map((item) => normalizarAtividade(item.data(), item.id));
}

export async function carregarCombustivelDaObra(obraId: string): Promise<NormalizedCombustivel[]> {
  const snapshot = await getDocs(query(collection(db, '03-combustivel'), where('id_obra', '==', obraId)));
  return snapshot.docs.map((item) => normalizarMovimentoCombustivel(item.data(), item.id));
}
