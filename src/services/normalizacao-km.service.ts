import { collection, doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { ItemFrotaV2 } from '../utils/cadastrosV2';
import { aplicarAlteracoesKm, leiturasDeAtividade, leiturasDeCombustivel, type AlteracaoKm, type LeituraKm } from '../utils/normalizacaoKm';

/** Leituras do medidor do veículo: atividades (`km`, só PLACA) e saídas de 03-combustivel (`quilometragem` ou
 * `horimetro`), as duas pelo `item_frota_id`. */
export async function carregarLeiturasKm(item: ItemFrotaV2): Promise<LeituraKm[]> {
  const medidor = item.categoria === 'PLACA' ? 'km' : 'h';
  const [atividades, combustivel] = await Promise.all([
    medidor === 'km' ? getDocs(query(collection(db, 'atividades'), where('item_frota_id', '==', item.id))) : null,
    getDocs(query(collection(db, '03-combustivel'), where('item_frota_id', '==', item.id))),
  ]);
  return [
    ...(atividades?.docs.flatMap((d) => leiturasDeAtividade(d.id, d.data())) ?? []),
    ...combustivel.docs.flatMap((d) => leiturasDeCombustivel(d.id, d.data(), medidor)),
  ];
}

/** Grava o lote numa transação, com conferência do valor original (Rules: logistica ou adm2). */
export function aplicarCorrecoesKm(veiculoId: string, alteracoes: AlteracaoKm[]) {
  return aplicarAlteracoesKm({
    veiculoId,
    alteracoes,
    executarTransacao: (trabalho) => runTransaction(db, (tx) => trabalho({
      get: async (c, id) => { const snap = await tx.get(doc(db, c, id)); return snap.exists() ? snap.data() : null; },
      update: (c, id, campos) => { tx.update(doc(db, c, id), campos); },
    })),
    lerDocumento: async (c, id) => { const snap = await getDoc(doc(db, c, id)); return snap.exists() ? snap.data() : null; },
  });
}
