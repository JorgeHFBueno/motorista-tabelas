import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { itemFrotaFromV2, sortItensFrota, type ItemFrotaV2 } from '../utils/cadastrosV2';

// Frota só por ID de veiculos-v2 (The Manuscript, 01_FIRESTORE/COLECOES/veiculos-v2.md). O cadastro é do Friday.
export const VEICULOS_V2 = 'veiculos-v2';

export async function listItensFrota(): Promise<ItemFrotaV2[]> {
  const snapshot = await getDocs(collection(db, VEICULOS_V2));
  return sortItensFrota(snapshot.docs
    .map((item) => itemFrotaFromV2(item.id, item.data()))
    .filter((item): item is ItemFrotaV2 => item !== null));
}

export async function listVeiculosAtivos(): Promise<ItemFrotaV2[]> {
  return (await listItensFrota()).filter((item) => item.ativo);
}

export async function getItemFrota(id: string): Promise<ItemFrotaV2 | null> {
  const snapshot = await getDoc(doc(db, VEICULOS_V2, id));
  return snapshot.exists() ? itemFrotaFromV2(snapshot.id, snapshot.data()) : null;
}
