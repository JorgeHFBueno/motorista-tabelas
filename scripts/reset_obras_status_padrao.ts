/**
 * Sobrescreve o campo statusObra de todas as obras com a estrutura oficial.
 *
 * Execucao sugerida fora do front-end:
 *  npx tsx scripts/reset_obras_status_padrao.ts
 *
 * Requer:
 *  FIREBASE_SERVICE_ACCOUNT_JSON com o JSON da service account.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { OBRA_STATUS_TEMPLATE } from "../src/constants/obraStatusTemplate";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const BATCH_LIMIT = 450;

if (!serviceAccountJson) {
  throw new Error("Defina FIREBASE_SERVICE_ACCOUNT_JSON com o JSON da service account.");
}

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
  });
}

const db = getFirestore();

const createOfficialStatusPayload = () => ({
  etapas: OBRA_STATUS_TEMPLATE.map((etapa) => ({
    id: etapa.id,
    nome: etapa.nome,
    ordem: etapa.ordem,
    progresso: 0,
    status: "pendente",
    itens: etapa.itens.map((nome, index) => ({
      id: `${etapa.id}_item_${index + 1}`,
      nome,
      ordem: index + 1,
      progresso: 0,
      status: "pendente",
    })),
  })),
  progressoGeral: 0,
  updatedAt: FieldValue.serverTimestamp(),
  updatedByUid: "migration:reset_obras_status_padrao",
  updatedByNomeSnapshot: "Migração de status padrão",
});

const resetAllObrasStatus = async () => {
  const obrasSnap = await db.collection("obras").get();

  if (obrasSnap.empty) {
    console.log("Nenhuma obra encontrada para atualizar.");
    return;
  }

  let batch = db.batch();
  let operationsInBatch = 0;
  let totalUpdated = 0;

  for (const obraDoc of obrasSnap.docs) {
    batch.update(obraDoc.ref, {
      statusObra: createOfficialStatusPayload(),
      statusResumo: "-",
      statusResumoUpdatedAt: FieldValue.serverTimestamp(),
    });

    operationsInBatch += 1;
    totalUpdated += 1;

    if (operationsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`Lote aplicado. Obras atualizadas ate agora: ${totalUpdated}`);
      batch = db.batch();
      operationsInBatch = 0;
    }
  }

  if (operationsInBatch > 0) {
    await batch.commit();
  }

  console.log(`Reset finalizado. Obras atualizadas: ${totalUpdated}`);
};

resetAllObrasStatus().catch((error) => {
  console.error(error);
  process.exit(1);
});
