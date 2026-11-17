import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizarAtividade, type AtividadeV2 } from '../../services/atividade-normalizer';
import { normalizarMovimentoCombustivel, type NormalizedCombustivel } from '../../services/combustivel-normalizer';
import { loadMondaySerpSnapshot, syncMondaySerpMeasurements } from '../../services/monday-serp.service';
import type { MedicoesObra } from './obraRelatorioPdf';
import { CRONOGRAMA_COLLECTION } from '../cronograma-obras/data/cronogramaFirestore';
import { MESTRES_COLLECTION } from '../cronograma-obras/data/mestresFirestore';
import { lerNaoTrabalhados } from '../cronograma-obras/domain/naoTrabalhados';
import { localDaCidade, obraDetalheFromV2, type AlocacaoObra, type CampoEditavelObra, type LoteObra, type ObraDetalhe } from './obrasDomain';
import { LOCAIS_SUGERIDOS } from './locaisSugeridos';
import { localDoMaps } from '../cronograma-logistica/data/logisticaFirestore';
import { linkDoMapa } from '../cronograma-logistica/domain/local';

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

/**
 * Grava um campo só: `local` é obrigatório; `siglaObra` (o "Sinônimo") pode ficar vazio. Os registros já feitos
 * guardam o local e a sigla da época em `id_obra_snap`.
 */
export async function gravarCampoObra(id: string, campo: CampoEditavelObra, valor: string): Promise<string> {
  const limpo = valor.trim();
  if (campo === 'local' && !limpo) throw new Error('O local não pode ficar vazio.');
  await updateDoc(doc(db, OBRAS_V2, id), { [campo]: limpo });
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
      ...(lerNaoTrabalhados(data.naoTrabalhados) ? { naoTrabalhados: lerNaoTrabalhados(data.naoTrabalhados) } : {}),
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

const cidadesLidas = new Map<string, Promise<string | null>>();

/**
 * Locais "Cidade - UF" dos LOTEs com coordenada, sem repetir: a cidade e o estado vêm da Function logisticaLocal (a
 * mesma do Local do Cronograma Logístico), um LOTE de cada vez. LOTE que falha fica de fora.
 */
export async function locaisDosLotes(lotes: readonly LoteObra[]): Promise<string[]> {
  const locais: string[] = [];
  for (const { coordenada } of lotes) {
    if (!coordenada) continue;
    const chave = `${coordenada.lat},${coordenada.lng}`;
    if (!cidadesLidas.has(chave)) {
      cidadesLidas.set(chave, localDoMaps(linkDoMapa(coordenada))
        .then(({ cidade, uf }) => localDaCidade(cidade, uf, LOCAIS_SUGERIDOS))
        .catch((err) => { console.warn('Cidade do LOTE não lida', err); cidadesLidas.delete(chave); return null; }));
    }
    const local = await cidadesLidas.get(chave)!;
    if (local && !locais.includes(local)) locais.push(local);
  }
  return locais;
}
