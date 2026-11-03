// Leituras do Firestore para começar um checklist, iguais às do app (data/checklist_repository.dart).
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { listVeiculosAtivos } from '../../../services/veiculos.service';
import type { ItemFrotaV2 } from '../../../utils/cadastrosV2';
import { normalizarChecklist, type Checklist } from '../../../services/checklist-normalizer';
import type { ChecklistMotorista, ChecklistVeiculo } from '../domain/rascunho';
import { naoSeAplicaDoUltimo } from '../domain/regras';

/** Veículos (`PLACA`) e máquinas (`EXTRA`) ativos, por identificador. */
export async function listarVeiculosChecklist(): Promise<ItemFrotaV2[]> {
  return (await listVeiculosAtivos()).sort((a, b) => a.identificador.localeCompare(b.identificador, 'pt-BR'));
}

export const checklistVeiculoDe = (item: ItemFrotaV2): ChecklistVeiculo => ({
  id: item.id,
  categoria: item.categoria,
  identificador: item.identificador,
  nome: item.nome,
  medidorUltimo: item.quilometragemUltima,
});

/** Quem tem a credencial `motorista` (sugestão; o nome digitado continua aceito), pela ordem de motorista e nome. */
export async function listarMotoristasChecklist(): Promise<ChecklistMotorista[]> {
  const snapshot = await getDocs(query(collection(db, 'funcionarios'), where('ativo', '==', true), where('perfis.motorista', '==', true)));
  const ordem = (d: Record<string, unknown>) => {
    const valor = (d.motorista as { ordem?: unknown } | undefined)?.ordem;
    return typeof valor === 'number' ? valor : Number.MAX_SAFE_INTEGER;
  };
  return snapshot.docs
    .map((d) => ({ uid: d.id, nome: typeof d.data().nome === 'string' ? (d.data().nome as string).trim() : '', ordem: ordem(d.data()) }))
    .filter((m) => m.nome !== '')
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(({ uid, nome }) => ({ uid, nome }));
}

/** Itens em "Não se aplica" no último checklist do veículo (filtrado e ordenado no cliente: sem índice composto). */
export async function naoSeAplicaDoUltimoChecklist(veiculoId: string): Promise<Set<string>> {
  const snapshot = await getDocs(query(collection(db, 'checklists-v2'), where('item_frota_id', '==', veiculoId)));
  return naoSeAplicaDoUltimo(snapshot.docs.map((d) => d.data()));
}

/** Histórico do mecânico: os checklists que ele fez, do mais novo ao mais antigo (ordenado no cliente: sem índice composto). */
export async function listarChecklistsDoAutor(uid: string): Promise<Checklist[]> {
  const snapshot = await getDocs(query(collection(db, 'checklists-v2'), where('criadoPorUid', '==', uid)));
  return snapshot.docs
    .map((d) => normalizarChecklist(d.data(), d.id))
    .sort((a, b) => (b.concluidoEm?.getTime() ?? 0) - (a.concluidoEm?.getTime() ?? 0));
}
