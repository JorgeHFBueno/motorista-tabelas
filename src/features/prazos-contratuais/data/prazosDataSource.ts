import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { adaptarDocumento, type ObraPrazo } from '../domain/prazos';
import { FIRESTORE_COLLECTION, FRIDAY_QUADRO_OBRAS } from './prazosSchema';

/** Item do Friday de cada contrato (vinculo.id → id do item). Quem não lê o Friday fica sem o mapa e o link abre o quadro. */
async function itensDoFriday(): Promise<Map<string, number>> {
  try {
    const itens = await getDocs(query(collection(db, 'friday-itens'), where('quadro_id', '==', FRIDAY_QUADRO_OBRAS)));
    return new Map(itens.docs.flatMap((doc) => {
      const v = doc.data().vinculo as { id?: unknown; sub?: unknown } | undefined;
      return typeof v?.id === 'string' && v.sub == null ? [[v.id, Number(doc.data().id)] as [string, number]] : [];
    }));
  } catch { return new Map(); }
}

/** Os mesmos contratos de obras-v2 usados pelo Cronograma. */
export async function carregarPrazos(): Promise<ObraPrazo[]> {
  const [snapshot, itens] = await Promise.all([getDocs(query(collection(db, FIRESTORE_COLLECTION), where('friday.ok', '==', true))), itensDoFriday()]);
  return snapshot.docs.flatMap((doc) => { const obra = adaptarDocumento(doc.id, doc.data(), itens.get(doc.id)); return obra ? [obra] : []; });
}
