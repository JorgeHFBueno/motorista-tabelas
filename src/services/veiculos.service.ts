import { collection, doc, getDoc, getDocs, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { itemFrotaFromV2, sortItensFrota, type ItemFrotaV2 } from '../utils/cadastrosV2';
import type { KmInicialGravar } from '../utils/frotaVeiculosLista';

// Frota só por ID de veiculos-v2 (The Manuscript, 01_FIRESTORE/COLECOES/veiculos-v2.md). O cadastro é do Friday;
// a WEB só edita o nome (o quadro FROTA espelha) e o KM inicial com data e origem (detalhe do veículo, adm2).
export const VEICULOS_V2 = 'veiculos-v2';

export type OrigemUltimaAtualizacao = { fonte: 'Viagem' | 'Abastecimento'; motorista: string | null; obra: string | null; data: Date | null };

const textoOuNull = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Registro que deu a "Última atualização" (operacional.origemUltimaAtualizacao: `atividades/<id>` ou `03-combustivel/<id>`). */
export async function lerOrigemUltimaAtualizacao(origem: unknown): Promise<OrigemUltimaAtualizacao | null> {
  const caminho = typeof origem === 'string' ? /^(atividades|03-combustivel)\/([\w-]{1,128})$/.exec(origem) : null;
  if (!caminho) return null;
  const snapshot = await getDoc(doc(db, caminho[1], caminho[2]));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const viagem = caminho[1] === 'atividades';
  const pessoa = (viagem ? data.motorista : data.motoristaOperador) as { nome?: unknown } | undefined;
  const obra = (data.id_obra_snap ?? {}) as Record<string, unknown>;
  const quando = data.data as { toDate?: () => Date } | undefined;
  return {
    fonte: viagem ? 'Viagem' : 'Abastecimento',
    motorista: textoOuNull(pessoa?.nome),
    obra: textoOuNull(obra.siglaObra) ?? textoOuNull(obra.nomeObra) ?? textoOuNull(obra.codObra),
    data: typeof quando?.toDate === 'function' ? quando.toDate() : null,
  };
}

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

/** Item do quadro FROTA ligado ao veículo (friday-itens com vinculo.id = veículo e sem subitem), para o link
 * "Abrir no Friday" (/friday/quadros/<quadro>?item=<item>). Sem item ligado: null. */
export async function itemFridayDoVeiculo(id: string): Promise<{ quadroId: number; itemId: number } | null> {
  const snapshot = await getDocs(query(collection(db, 'friday-itens'), where('vinculo.id', '==', id)));
  const item = snapshot.docs.map((d) => d.data()).find((d) => d.vinculo?.sub == null && !d.excluido_em && typeof d.quadro_id === 'number' && typeof d.id === 'number');
  return item ? { quadroId: item.quadro_id as number, itemId: item.id as number } : null;
}
