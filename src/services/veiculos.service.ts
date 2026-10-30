import { collection, doc, getDoc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { itemFrotaFromV2, sortItensFrota, type ItemFrotaV2 } from '../utils/cadastrosV2';
import type { KmInicialGravar } from '../utils/frotaVeiculosLista';

// Frota só por ID de veiculos-v2 (The Manuscript, 01_FIRESTORE/COLECOES/veiculos-v2.md). O cadastro é do Friday;
// a WEB só edita o nome (o quadro FROTA espelha) e o KM inicial com data e origem (detalhe do veículo, adm2).
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

/** Grava `identificacao.nome` (obrigatório, sem espaços nas pontas) e devolve o nome gravado. O identificador não muda. */
export async function renomearItemFrota(id: string, nome: string): Promise<string> {
  const limpo = nome.trim();
  if (!limpo) throw new Error('O nome não pode ficar vazio.');
  await updateDoc(doc(db, VEICULOS_V2, id), { 'identificacao.nome': limpo });
  return limpo;
}

/** Grava o KM inicial com a data e a origem (só estes três campos de `operacional`). */
export async function atualizarKmInicial(id: string, { km, data, origem }: KmInicialGravar): Promise<void> {
  await updateDoc(doc(db, VEICULOS_V2, id), {
    'operacional.quilometragemInicial': km,
    'operacional.dataQuilometragemInicial': data ? Timestamp.fromDate(data) : null,
    'operacional.origemQuilometragemInicial': origem,
  });
}
