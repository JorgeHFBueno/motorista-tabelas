const crypto = require("node:crypto");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const {defineString} = require("firebase-functions/params");

const EMAIL_API_URL = defineString("EMAIL_API_URL");
const EMAIL_API_KEY = defineString("EMAIL_API_KEY");
const EMAIL_FROM = defineString("EMAIL_FROM");
const APP_BASE_URL = defineString("APP_BASE_URL");

const STATUSS_EM_ABERTO = new Set(["pendente", "comprovante_enviado", "rejeitado"]);

const EMAIL_SUBJECTS = {
  foto_nova: "[Ledur] Nova foto na sua obra",
  documento_novo: "[Ledur] Novo documento disponível",
  progresso_obra: "[Ledur] Atualização no progresso da obra",
  financeiro_nova_parcela: "[Ledur] Atualização financeira da sua obra",
  financeiro_boleto_disponivel: "[Ledur] Atualização financeira da sua obra",
  financeiro_status_alterado: "[Ledur] Atualização financeira da sua obra",
  financeiro_vencimento_proximo: "[Ledur] Parcela próxima do vencimento",
};

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

async function getObraNome(db, obraId, fallbackNome) {
  const fallback = normalizeString(fallbackNome);
  if (fallback) return fallback;

  const obraSnap = await db.collection("obras").doc(obraId).get();
  if (!obraSnap.exists) return "sua obra";

  return normalizeString(obraSnap.data()?.nome) || "sua obra";
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

function buildEmailHtml({nomeCliente, obraNome, titulo, mensagem, rotaDestino}) {
  const baseUrl = normalizeString(APP_BASE_URL.value());
  const route = normalizeString(rotaDestino);
  const ctaUrl = baseUrl && route ? `${baseUrl}${route}` : baseUrl || "";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
      <p>Olá, ${nomeCliente}.</p>
      <p><strong>${titulo}</strong></p>
      <p>${mensagem}</p>
      <p>Obra: <strong>${obraNome}</strong></p>
      <p>Acesse a plataforma da Ledur para acompanhar os detalhes.</p>
      ${ctaUrl ? `<p><a href="${ctaUrl}">Abrir plataforma</a></p>` : ""}
      <p style="margin-top:24px">Equipe Ledur</p>
    </div>
  `;
}

async function sendNotificationEmail({users, tipo, titulo, mensagem, obraNome, rotaDestino}) {
  const endpoint = EMAIL_API_URL.value();
  const apiKey = EMAIL_API_KEY.value();
  const from = EMAIL_FROM.value();

  if (!endpoint || !apiKey || !from) {
    logger.warn("[notifications][email] provedor de e-mail não configurado; envio ignorado", {
      tipo,
      recipients: users.length,
    });
    return;
  }

  const subject = EMAIL_SUBJECTS[tipo] || "[Ledur] Atualização da sua obra";

  await Promise.all(users
    .filter((user) => user.email)
    .map(async (user) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: user.email,
          subject,
          html: buildEmailHtml({
            nomeCliente: user.nome,
            obraNome,
            titulo,
            mensagem,
            rotaDestino,
          }),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Falha ao enviar email (${response.status}): ${body}`);
      }
    }));
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
  getObraNome,
  createNotificationsForUsers,
  sendNotificationEmail,
  buildNotificationPayload,
  detectProgressChanges,
  getChangedStatusFields,
  shouldNotifyUpcomingDue,
  normalizeString,
  normalizeNumber,
  toIsoDate,
};