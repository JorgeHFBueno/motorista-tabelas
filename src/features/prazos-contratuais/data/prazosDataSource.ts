import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { adaptarDocumento, textoDaLista, type ItemFriday, type ObraPrazo } from '../domain/prazos';
import { FIRESTORE_COLLECTION, FRIDAY_COLUNA_SITUACAO, FRIDAY_QUADRO_OBRAS } from './prazosSchema';

/** Item do Friday de cada contrato (vinculo.id → item), com a coluna "Situação", que decide quem entra na tela. */
async function itensDoFriday(): Promise<Map<string, ItemFriday>> {
  const [itens, coluna] = await Promise.all([
    getDocs(query(collection(db, 'friday-itens'), where('quadro_id', '==', FRIDAY_QUADRO_OBRAS))),
    getDoc(doc(db, 'friday-colunas', String(FRIDAY_COLUNA_SITUACAO))),
  ]);
  const opcoes = new Map(((coluna.data()?.config?.opcoes ?? []) as Array<{ id?: unknown; texto?: unknown }>).map((o) => [String(o.id), String(o.texto ?? o.id)]));
  return new Map(itens.docs.flatMap((item) => {
    const dados = item.data();
    const v = dados.vinculo as { id?: unknown; sub?: unknown } | undefined;
    return typeof v?.id === 'string' && v.sub == null
      ? [[v.id, { id: Number(dados.id), situacao: textoDaLista(dados.valores?.[FRIDAY_COLUNA_SITUACAO], opcoes) }] as [string, ItemFriday]]
      : [];
  }));
}

/** Os mesmos contratos de obras-v2 usados pelo Cronograma. */
export async function carregarPrazos(): Promise<ObraPrazo[]> {
  const [snapshot, itens] = await Promise.all([getDocs(query(collection(db, FIRESTORE_COLLECTION), where('friday.ok', '==', true))), itensDoFriday()]);
  return snapshot.docs.flatMap((contrato) => { const obra = adaptarDocumento(contrato.id, contrato.data(), itens.get(contrato.id)); return obra ? [obra] : []; });
}
