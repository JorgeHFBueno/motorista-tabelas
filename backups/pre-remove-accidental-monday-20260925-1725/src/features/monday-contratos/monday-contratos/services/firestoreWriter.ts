import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { contractId, mergeRawStage, obraPatch, prepareContractPreview, WRITES_ENABLED, type MondayItem, type ObraV2, type RawStage } from '../domain/conciliation';
export async function applyContractInTransaction(db: Firestore, item: MondayItem, stage: RawStage): Promise<void> {
  if (!WRITES_ENABLED) throw new Error('Escrita em produção ainda não autorizada');
  const id = contractId(item); const contractRef = doc(db, 'contratos-v2', id); const rawRef = doc(db, 'monday-gestao-obras-raw', id);
  await runTransaction(db, async (transaction) => {
    const rawSnapshot = await transaction.get(rawRef); const contractSnapshot = await transaction.get(contractRef); const currentStage = rawSnapshot.exists() ? rawSnapshot.data() as RawStage : null;
    const mergedStage = mergeRawStage(currentStage, item); if (JSON.stringify(mergedStage.conciliacao) !== JSON.stringify(stage.conciliacao)) throw new Error('CONFLITO_PREVIEW_OBSOLETO');
    const ids = [mergedStage.conciliacao.obraDiretaId, ...Object.values(mergedStage.conciliacao.subitems).filter((value) => value.estado === 'VINCULADO_A_OBRA').map((value) => value.obraId)].filter((value): value is string => Boolean(value));
    const snapshots = await Promise.all(ids.map((obraId) => transaction.get(doc(db, 'obras-v2', obraId)))); const obras = snapshots.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as ObraV2));
    const preview = prepareContractPreview(item, contractSnapshot.exists() ? contractSnapshot.data() : null, obras, { ...mergedStage, conciliacao: stage.conciliacao }); if (preview.errors.length) throw new Error(preview.errors.join(','));
    transaction.set(rawRef, { ...mergedStage, sincronizacao: { ...mergedStage.sincronizacao, capturadoEm: serverTimestamp() } }, { merge: true });
    transaction.set(contractRef, { ...preview.contract, integracoes: { monday: { ...preview.contract.integracoes.monday, sincronizadoEm: serverTimestamp() } } }, { merge: true });
    preview.obraPatches.forEach(({ obraId, patch }) => transaction.update(doc(db, 'obras-v2', obraId), patch));
  });
}
