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
  const beforeItens = Array.isArray(beforeData?.itens) ? beforeData.itens : [];
  const afterItens = Array.isArray(afterData?.itens) ? afterData.itens : [];

  const toggled = [];
  const beforeMap = new Map(beforeItens.map((item) => [normalizeString(item.id), !!item.done]));

  afterItens.forEach((item) => {
    const id = normalizeString(item.id);
    if (!id) return;
    const beforeDone = beforeMap.get(id);
    const afterDone = !!item.done;
    if (beforeDone === undefined || beforeDone === afterDone) return;
    toggled.push({id, done: afterDone, label: normalizeString(item.label)});
  });

  const beforeInicio = toIsoDate(beforeData?.inicio);
  const afterInicio = toIsoDate(afterData?.inicio);
  const beforeFim = toIsoDate(beforeData?.fim);
  const afterFim = toIsoDate(afterData?.fim);

  const dateChanged = beforeInicio !== afterInicio || beforeFim !== afterFim;
  const etapa = normalizeString(afterData?.titulo) || normalizeString(beforeData?.titulo) || "Etapa da obra";

  return {
    changed: toggled.length > 0 || dateChanged,
    etapa,
    toggledCount: toggled.length,
    toggled,
    dateChanged,
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