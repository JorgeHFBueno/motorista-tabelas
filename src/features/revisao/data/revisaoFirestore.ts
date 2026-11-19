// Leituras de `manutencoes-v2`, iguais às do app (ManutencaoHistoricoFirebase): filtra no servidor e ordena no
// aparelho, só com índices automáticos.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { lerRevisao, type RevisaoLida } from '../domain/documento';
import { ordenarHistorico } from '../domain/regras';

/** Quantos registros o histórico mostra sem filtro de veículo. */
export const LIMITE_HISTORICO = 100;

const colecao = () => collection(db, 'manutencoes-v2');

/** Todos os registros do veículo; sem ele, os `LIMITE_HISTORICO` abertos por último. Ordem do histórico. */
export async function listarRevisoes(veiculoId?: string | null): Promise<RevisaoLida[]> {
  const consulta = veiculoId
    ? query(colecao(), where('item_frota_id', '==', veiculoId))
    : query(colecao(), orderBy('abertaEm', 'desc'), limit(LIMITE_HISTORICO));
  const snapshot = await getDocs(consulta);
  return ordenarHistorico(snapshot.docs.map((d) => lerRevisao(d.id, d.data())));
}

/** Registros em manutenção, de qualquer aparelho. */
export async function listarAbertas(): Promise<RevisaoLida[]> {
  const snapshot = await getDocs(query(colecao(), where('status', '==', 'aberta')));
  return ordenarHistorico(snapshot.docs.map((d) => lerRevisao(d.id, d.data())));
}

export async function obterRevisao(id: string): Promise<RevisaoLida | null> {
  const snapshot = await getDoc(doc(db, 'manutencoes-v2', id));
  return snapshot.exists() ? lerRevisao(snapshot.id, snapshot.data()) : null;
}
