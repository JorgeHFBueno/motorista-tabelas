const crypto = require("node:crypto");
const admin = require("firebase-admin");

const STATUSS_EM_ABERTO = new Set(["pendente", "comprovante_enviado", "rejeitado"]);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function toIsoDate(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString().slice(0, 10);
  }
  return "";
}

function buildStableId(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 28);
}

async function getClientUsersByObraId(db, obraId) {
  const normalizedObraId = normalizeString(obraId);
  if (!normalizedObraId) return [];

  const usersSnap = await db
    .collection("users")
    .where("ativo", "==", true)
    .where("obras", "array-contains", normalizedObraId)
    .get();

  return usersSnap.docs
    .map((docSnap) => ({uid: docSnap.id, ...docSnap.data()}))
    .filter((user) => user.tipo === "cliente" || user.role === "cliente")
    .map((user) => ({
      uid: user.uid,
      nome: normalizeString(user.nome) || "Cliente",
      email: normalizeString(user.email),
      emailLower: normalizeString(user.emailLower),
    }));
}

function buildNotificationPayload(base) {
  return {
    userId: base.userId,
    obraId: base.obraId,
    tipo: base.tipo,
    titulo: base.titulo,
    mensagem: base.mensagem,
    lida: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    origemColecao: base.origemColecao ?? null,
    origemId: base.origemId ?? null,
    metadata: base.metadata ?? {},
    idempotencyKey: base.idempotencyKey,
  };
}

async function createNotificationsForUsers(db, users, payloadBase) {
  if (users.length === 0) return [];

  const writes = users.map(async (user) => {
    const dedupeBase = `${user.uid}|${payloadBase.tipo}|${payloadBase.obraId}|${payloadBase.idempotencyKey}`;
    const docId = `ntf_${buildStableId(dedupeBase)}`;
    const docRef = db.collection("users").doc(user.uid).collection("notificacoes").doc(docId);
    const existing = await docRef.get();
    if (existing.exists) {
      return {uid: user.uid, created: false};
    }

    await docRef.set(buildNotificationPayload({
      ...payloadBase,
      userId: user.uid,
    }));

    return {uid: user.uid, created: true};
  });

  return Promise.all(writes);
}

function getChangedStatusFields(beforeData, afterData) {
  const before = normalizeString(beforeData.status);
  const after = normalizeString(afterData.status);
  const changed = before !== after;
  return {before, after, changed};
}

function detectProgressChanges(beforeData, afterData) {
  const beforeEtapas = Array.isArray(beforeData?.etapas) ? beforeData.etapas : [];
  const afterEtapas = Array.isArray(afterData?.etapas) ? afterData.etapas : [];

  const beforeItemsMap = new Map();
  beforeEtapas.forEach((etapa) => {
    const itens = Array.isArray(etapa?.itens) ? etapa.itens : [];
    itens.forEach((item) => {
      const id = normalizeString(item?.id);
      if (!id) return;
      beforeItemsMap.set(id, normalizeNumber(item?.progresso) ?? (item?.done ? 100 : 0));
    });
  });

  const changedItems = [];
  const changedStages = [];

  afterEtapas.forEach((etapa) => {
    const etapaId = normalizeString(etapa?.id);
    const etapaNome = normalizeString(etapa?.nome || etapa?.titulo) || "Etapa da obra";
    const afterProgress = normalizeNumber(etapa?.progresso) ?? 0;

    const beforeEtapa = beforeEtapas.find((current) => normalizeString(current?.id) === etapaId);
    const beforeProgress = normalizeNumber(beforeEtapa?.progresso) ?? 0;
    if (beforeEtapa && beforeProgress !== afterProgress) {
      changedStages.push({
        id: etapaId,
        nome: etapaNome,
        beforeProgress,
        afterProgress,
      });
    }

    const itens = Array.isArray(etapa?.itens) ? etapa.itens : [];
    itens.forEach((item) => {
      const itemId = normalizeString(item?.id);
      if (!itemId) return;
      const previousProgress = beforeItemsMap.get(itemId);
      const currentProgress = normalizeNumber(item?.progresso) ?? (item?.done ? 100 : 0);
      if (previousProgress === undefined || previousProgress === currentProgress) return;
      changedItems.push({
        id: itemId,
        nome: normalizeString(item?.nome || item?.label) || "Item",
        etapa: etapaNome,
        beforeProgress: previousProgress,
        afterProgress: currentProgress,
      });
    });
  });

  const etapa = changedStages[0]?.nome || changedItems[0]?.etapa || "Etapa da obra";

  return {
    changed: changedItems.length > 0 || changedStages.length > 0,
    etapa,
    toggledCount: changedItems.length,
    toggled: changedItems,
    dateChanged: false,
    changedStages,
  };
}

function shouldNotifyUpcomingDue(installmentData, daysUntilDue) {
  const status = normalizeString(installmentData.status);
  return STATUSS_EM_ABERTO.has(status) && daysUntilDue >= 0 && daysUntilDue <= 5;
}

module.exports = {
  getClientUsersByObraId,
  createNotificationsForUsers,
  buildNotificationPayload,
  detectProgressChanges,
  getChangedStatusFields,
  shouldNotifyUpcomingDue,
  normalizeString,
  normalizeNumber,
  toIsoDate,
};
