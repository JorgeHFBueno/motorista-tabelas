const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {setGlobalOptions} = require("firebase-functions/v2/options");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {Resend} = require("resend");
const crypto = require("crypto");
const {runExternalNewsIngestion, scheduledIngestNews} = require("./src/news/scheduledIngestNews");

const {db, requireAuth, requireAdmin} = require("./lib/authz");
const {
  validateAdminCreateUser,
  validateAdminSetRole,
  validateAdminLinkObra,
  validateUserUpdateSelfProfile,
} = require("./lib/validators");
const {
  FieldValue,
  userRef,
  ensureUserDocExists,
  buildAdminSetRoleUpdate,
} = require("./lib/firestore");

const {
  getClientUsersByObraId,
  createNotificationsForUsers,
  detectProgressChanges,
  getChangedStatusFields,
  shouldNotifyUpcomingDue,
  normalizeString,
  normalizeNumber,
  toIsoDate,
} = require("./lib/notifications");

if (!admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({maxInstances: 10, region: "southamerica-east1"});

const resendApiKey = defineSecret("RESEND_API_KEY");

const DEFAULT_FROM =
  "Ledur Pré-Fabricados <obras@notificacoes.ledurprefabricados.com.br>";

/**
 * @typedef {Object} EmailNotificationPayload
 * @property {string|string[]=} to
 * @property {string=} subject
 * @property {string=} html
 * @property {string=} text
 * @property {"pending"|"processing"|"sent"|"error"|"skipped_duplicate"=} status
 * @property {string=} dedupeKey
 * @property {string=} tipo
 * @property {string=} obraId
 * @property {string=} clienteUid
 */

exports.adminCreateUser = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireAdmin(callerUid);

  const payload = validateAdminCreateUser(request.data);

  try {
    const authUser = await admin.auth().createUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.nome,
    });

    const userDocPayload = {
      email: payload.email,
      emailLower: payload.emailLower,
      nome: payload.nome,
      tipo: payload.tipo,
      role: payload.role,
      obras: payload.obras,
      ativo: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    let lastWriteError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await userRef(db, authUser.uid).set(userDocPayload, {merge: true});
        lastWriteError = null;
        break;
      } catch (writeError) {
        lastWriteError = writeError;
        logger.error("[admin-functions][adminCreateUser] failed to persist users/{uid}", {
          callerUid,
          newUid: authUser.uid,
          attempt,
          message: writeError instanceof Error ? writeError.message : String(writeError),
        });
      }
    }

    if (lastWriteError) {
      throw new HttpsError("internal", "Usuário Auth criado, mas falhou ao persistir users/{uid}.");
    }

    logger.info("[admin-functions][adminCreateUser] success", {
      callerUid,
      newUid: authUser.uid,
      role: payload.role,
      tipo: payload.tipo,
    });

    return {uid: authUser.uid};
  } catch (error) {
    logger.error("[admin-functions][adminCreateUser] failed", {
      callerUid,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", "Falha ao criar usuário administrativo.");
  }
});

exports.adminSetRole = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireAdmin(callerUid);

  const payload = validateAdminSetRole(request.data);
  const targetRef = await ensureUserDocExists(db, payload.uid);

  if (!targetRef) {
    throw new HttpsError("not-found", "Usuário alvo não encontrado em users/{uid}.");
  }

  await targetRef.update(buildAdminSetRoleUpdate(payload));

  logger.info("[admin-functions][adminSetRole] success", {
    callerUid,
    uid: payload.uid,
    role: payload.role,
    tipo: payload.tipo ?? null,
    ativo: payload.ativo ?? null,
  });

  return {ok: true};
});

exports.adminLinkObra = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireAdmin(callerUid);

  const payload = validateAdminLinkObra(request.data);
  const targetRef = await ensureUserDocExists(db, payload.uid);

  if (!targetRef) {
    throw new HttpsError("not-found", "Usuário alvo não encontrado em users/{uid}.");
  }

  await targetRef.update({
    obras: FieldValue.arrayUnion(payload.obraId),
  });

  logger.info("[admin-functions][adminLinkObra] success", {
    callerUid,
    uid: payload.uid,
    obraId: payload.obraId,
  });

  return {ok: true};
});

exports.adminUnlinkObra = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireAdmin(callerUid);

  const payload = validateAdminLinkObra(request.data);
  const targetRef = await ensureUserDocExists(db, payload.uid);

  if (!targetRef) {
    throw new HttpsError("not-found", "Usuário alvo não encontrado em users/{uid}.");
  }

  await targetRef.update({
    obras: FieldValue.arrayRemove(payload.obraId),
  });

  logger.info("[admin-functions][adminUnlinkObra] success", {
    callerUid,
    uid: payload.uid,
    obraId: payload.obraId,
  });

  return {ok: true};
});

exports.userUpdateSelfProfile = onCall(async (request) => {
  const uid = requireAuth(request);
  const payload = validateUserUpdateSelfProfile(request.data);

  await userRef(db, uid).set({
    nome: payload.nome,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  try {
    await admin.auth().updateUser(uid, {displayName: payload.nome});
  } catch (error) {
    logger.warn("[user-functions][userUpdateSelfProfile] displayName update failed", {
      uid,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info("[user-functions][userUpdateSelfProfile] success", {uid});

  return {ok: true, nome: payload.nome};
});

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickTrashCollection(kind) {
  return kind === "documento" ? "documentos-lixo" : "fotos-lixo";
}

function pickOriginalCollection(value) {
  return value === "documentos" || value === "fotos" ? value : null;
}

function normalizeTrashPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Payload inválido.");
  }

  const kind = data.kind === "documento" || data.kind === "foto" ? data.kind : null;
  const obraId = asText(data.obraId);
  const originalDocId = asText(data.originalDocId);
  const originalCollection = pickOriginalCollection(data.originalCollection);
  const originalStoragePath = asText(data.originalStoragePath);
  const trashedStoragePath = asText(data.trashedStoragePath);
  const extra = data.extra && typeof data.extra === "object" && !Array.isArray(data.extra)
    ? data.extra
    : {};

  if (!kind) throw new HttpsError("invalid-argument", "kind inválido.");
  if (!obraId) throw new HttpsError("invalid-argument", "obraId é obrigatório.");
  if (!originalDocId) throw new HttpsError("invalid-argument", "originalDocId é obrigatório.");
  if (!originalCollection) throw new HttpsError("invalid-argument", "originalCollection inválida.");

  return {
    kind,
    obraId,
    originalDocId,
    originalCollection,
    originalStoragePath,
    trashedStoragePath,
    extra,
  };
}

async function requireStaff(callerUid) {
  const callerSnap = await db.collection("users").doc(callerUid).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Perfil do usuário não encontrado.");
  }
  const role = asText(callerSnap.data()?.role);
  if (!role || role === "cliente") {
    throw new HttpsError("permission-denied", "Sem permissão para mover para lixeira.");
  }
}

exports.trash_move = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireStaff(callerUid);
  const payload = normalizeTrashPayload(request.data);

  const originalRef = db.collection(payload.originalCollection).doc(payload.originalDocId);
  const originalSnap = await originalRef.get();
  if (!originalSnap.exists) {
    throw new HttpsError("not-found", "Documento original não encontrado.");
  }

  const originalData = originalSnap.data() ?? {};
  if (asText(originalData.obraId) !== payload.obraId) {
    throw new HttpsError("failed-precondition", "Item não pertence à obra informada.");
  }

  if (payload.originalStoragePath && payload.trashedStoragePath) {
    const bucket = admin.storage().bucket();
    await bucket.file(payload.originalStoragePath).copy(bucket.file(payload.trashedStoragePath));
    await bucket.file(payload.originalStoragePath).delete({ignoreNotFound: true});
  }

  const trashCollection = pickTrashCollection(payload.kind);
  const trashRef = db.collection(trashCollection).doc(payload.originalDocId);
  const batch = db.batch();
  batch.set(trashRef, {
    ...originalData,
    ...payload.extra,
    obraId: payload.obraId,
    originalCollection: payload.originalCollection,
    originalDocId: payload.originalDocId,
    originalStoragePath: payload.originalStoragePath,
    trashedStoragePath: payload.trashedStoragePath,
    storagePath: payload.trashedStoragePath || payload.originalStoragePath || null,
    filePath: payload.trashedStoragePath || payload.originalStoragePath || null,
    deletedAt: FieldValue.serverTimestamp(),
    deletedByUid: callerUid,
  }, {merge: true});
  batch.delete(originalRef);
  await batch.commit();

  logger.info("[trash][move] success", {
    callerUid,
    obraId: payload.obraId,
    originalDocId: payload.originalDocId,
    kind: payload.kind,
  });

  return {
    ok: true,
    trashedDocId: payload.originalDocId,
    trashedStoragePath: payload.trashedStoragePath,
  };
});

exports.trash_restore = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireStaff(callerUid);
  const payload = normalizeTrashPayload({
    ...request.data,
    originalDocId: request.data?.originalDocId || request.data?.trashedDocId,
  });

  const trashCollection = pickTrashCollection(payload.kind);
  const trashedDocId = asText(request.data?.trashedDocId) || payload.originalDocId;
  const trashRef = db.collection(trashCollection).doc(trashedDocId);
  const trashSnap = await trashRef.get();
  if (!trashSnap.exists) {
    throw new HttpsError("not-found", "Item da lixeira não encontrado.");
  }

  const trashData = trashSnap.data() ?? {};
  if (asText(trashData.obraId) !== payload.obraId) {
    throw new HttpsError("failed-precondition", "Item não pertence à obra informada.");
  }

  if (payload.trashedStoragePath && payload.originalStoragePath) {
    const bucket = admin.storage().bucket();
    await bucket.file(payload.trashedStoragePath).copy(bucket.file(payload.originalStoragePath));
    await bucket.file(payload.trashedStoragePath).delete({ignoreNotFound: true});
  }

  const originalRef = db.collection(payload.originalCollection).doc(payload.originalDocId);
  const restoreData = {
    ...trashData,
    storagePath: payload.originalStoragePath || trashData.originalStoragePath || trashData.storagePath || null,
    filePath: payload.originalStoragePath || trashData.originalStoragePath || trashData.filePath || null,
  };
  delete restoreData.deletedAt;
  delete restoreData.deletedByUid;
  delete restoreData.deletedByNomeSnapshot;
  delete restoreData.originalCollection;
  delete restoreData.originalDocId;
  delete restoreData.originalStoragePath;
  delete restoreData.trashedStoragePath;

  const batch = db.batch();
  batch.set(originalRef, restoreData, {merge: true});
  batch.delete(trashRef);
  await batch.commit();

  logger.info("[trash][restore] success", {
    callerUid,
    obraId: payload.obraId,
    trashedDocId,
    kind: payload.kind,
  });

  return {ok: true, restoredDocId: payload.originalDocId};
});
async function dispatchNotificationFromEvent({
  obraId,
  tipo,
  titulo,
  mensagem,
  origemColecao,
  origemId,
  metadata,
  idempotencyKey,
  users: providedUsers,
  }) {
  const normalizedObraId = normalizeString(obraId);
  if (!normalizedObraId) return;

  const users = Array.isArray(providedUsers)
    ? providedUsers
    : await getClientUsersByObraId(db, normalizedObraId);
  if (users.length === 0) {
    logger.info("[notifications] nenhum usuário elegível para notificar", {obraId: normalizedObraId, tipo});
    return;
  }

  await createNotificationsForUsers(db, users, {
    obraId: normalizedObraId,
    tipo,
    titulo,
    mensagem,
    origemColecao: origemColecao ?? null,
    origemId: origemId ?? null,
    metadata: metadata ?? {},
    idempotencyKey,
  });

  logger.info("[notifications] evento processado", {
    obraId: normalizedObraId,
    tipo,
    totalUsuarios: users.length,
  });
}

function timestampMillis(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value.toMillis === "function") {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof value.toDate === "function") {
    const millis = value.toDate().getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof value.seconds === "number") {
    const millis = value.seconds * 1000;
    return Number.isFinite(millis) ? millis : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function dataHoraComparable(value) {
  if (value === undefined || value === null || value === "") return "";
  const millis = timestampMillis(value);
  if (millis) return `millis:${millis}`;
  return `raw:${String(value)}`;
}

function formatDateTimePtBr(value) {
  const millis = timestampMillis(value);
  if (!millis) return normalizeString(String(value ?? ""));

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(millis));
}

function getObraNome(obraData) {
  const candidates = [
    obraData?.nome,
    obraData?.nomeObra,
    obraData?.titulo,
    obraData?.cliente,
    obraData?.clienteNome,
    obraData?.cliente?.nome,
    obraData?.endereco,
    obraData?.endereco?.logradouro,
    obraData?.identificador,
  ];

  for (const candidate of candidates) {
    const value = normalizeString(candidate);
    if (value) return value;
  }

  return "sua obra";
}

function execucaoEquipeEmailTipo(tipo) {
  return tipo === "saida" || tipo === "saida_equipe" ? "saida_equipe" : "chegada_equipe";
}

function getDedupeDataHoraPart(dataHora, context) {
  const millis = timestampMillis(dataHora);
  if (millis) return String(millis);

  const fallback = normalizeString(String(dataHora ?? ""));
  logger.warn("[ExecucaoEquipeEmail] dataHora sem millis; usando fallback estavel", {
    ...context,
    dataHora: fallback || null,
  });

  return fallback;
}

function buildExecucaoEquipeEmailPayload({obraId, obraData, tipo, dataHora, clienteUid}) {
  const emailTipo = execucaoEquipeEmailTipo(tipo);
  const isSaida = emailTipo === "saida_equipe";
  const obraNome = getObraNome(obraData);
  const dataHoraFormatada = formatDateTimePtBr(dataHora);
  const dedupeDataHora = getDedupeDataHoraPart(dataHora, {obraId, tipo: emailTipo});
  const subject = isSaida
    ? `Equipe a caminho da obra ${obraNome}`
    : `Equipe chegou à obra ${obraNome}`;
  const mensagem = isSaida
    ? "A equipe da Ledur saiu em direção à sua obra."
    : "A equipe da Ledur chegou à sua obra.";
  const html = [
    "<p>Olá,</p>",
    `<p>${mensagem}</p>`,
    `<p><strong>Obra:</strong> ${obraNome}</p>`,
    `<p><strong>Data e hora:</strong> ${dataHoraFormatada}</p>`,
    "<p>Esta é uma notificação automática do sistema da Ledur Pré-Fabricados.</p>",
  ].join("");
  const text = [
    "Olá,",
    "",
    mensagem,
    "",
    `Obra: ${obraNome}`,
    `Data e hora: ${dataHoraFormatada}`,
    "",
    "Esta é uma notificação automática do sistema da Ledur Pré-Fabricados.",
  ].join("\n");

  return {
    subject,
    html,
    text,
    tipo: emailTipo,
    dedupeKey: `${obraId}:${emailTipo}:${clienteUid}:${dedupeDataHora}`,
  };
}

async function createExecucaoEquipeEmailNotifications({
  obraId,
  obraData,
  tipo,
  dataHora,
  confirmadoPorNome,
  clientes,
}) {
  const normalizedObraId = normalizeString(obraId);
  const emailTipo = execucaoEquipeEmailTipo(tipo);

  logger.info("[ExecucaoEquipeEmail] inicio da criacao dos emails", {
    obraId: normalizedObraId,
    tipo: emailTipo,
    confirmadoPorNome: normalizeString(confirmadoPorNome) || null,
  });

  if (!normalizedObraId) return;

  if (dataHora === undefined || dataHora === null || dataHora === "") {
    logger.warn("[ExecucaoEquipeEmail] ausencia de dataHora", {
      obraId: normalizedObraId,
      tipo: emailTipo,
    });
    return;
  }

  try {
    const users = Array.isArray(clientes)
      ? clientes
      : await getClientUsersByObraId(db, normalizedObraId);

    logger.info("[ExecucaoEquipeEmail] quantidade de clientes encontrados", {
      obraId: normalizedObraId,
      tipo: emailTipo,
      totalClientes: users.length,
    });

    if (users.length === 0) {
      logger.warn("[ExecucaoEquipeEmail] ausencia de cliente vinculado", {
        obraId: normalizedObraId,
        tipo: emailTipo,
      });
      return;
    }

    const writes = users.map(async (cliente) => {
      const clienteUid = normalizeString(cliente?.uid);
      const email = normalizeString(cliente?.email) || normalizeString(cliente?.emailLower);

      if (!clienteUid || !email) {
        logger.warn("[ExecucaoEquipeEmail] cliente ignorado por falta de e-mail", {
          obraId: normalizedObraId,
          tipo: emailTipo,
          clienteUid: clienteUid || null,
        });
        return;
      }

      const payloadBase = buildExecucaoEquipeEmailPayload({
        obraId: normalizedObraId,
        obraData,
        tipo: emailTipo,
        dataHora,
        clienteUid,
      });
      const docRef = db.collection("emailNotifications").doc();

      try {
        await docRef.set({
          to: [email],
          subject: payloadBase.subject,
          html: payloadBase.html,
          text: payloadBase.text,
          status: "pending",
          tipo: payloadBase.tipo,
          obraId: normalizedObraId,
          clienteUid,
          dedupeKey: payloadBase.dedupeKey,
          source: "confirmacao_time_execucao",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        logger.info("[ExecucaoEquipeEmail] documento emailNotifications criado", {
          obraId: normalizedObraId,
          tipo: emailTipo,
          clienteUid,
          emailNotificationId: docRef.id,
        });
      } catch (error) {
        logger.error("[ExecucaoEquipeEmail] erro ao criar documento", {
          obraId: normalizedObraId,
          tipo: emailTipo,
          clienteUid,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(writes);
  } catch (error) {
    logger.error("[ExecucaoEquipeEmail] erro ao criar documento", {
      obraId: normalizedObraId,
      tipo: emailTipo,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getExecucaoEquipeChanges(beforeData, afterData, obraId) {
  const beforeExecucao = beforeData?.execucaoEquipe ?? {};
  const afterExecucao = afterData?.execucaoEquipe ?? {};

  return ["saida", "chegada"]
    .map((tipo) => {
      const beforeConfirmacao = beforeExecucao?.[tipo] ?? null;
      const afterConfirmacao = afterExecucao?.[tipo] ?? null;
      const beforeDataHoraKey = dataHoraComparable(beforeConfirmacao?.dataHora);
      const afterDataHoraKey = dataHoraComparable(afterConfirmacao?.dataHora);
      const afterMillis = timestampMillis(afterConfirmacao?.dataHora);
      if (afterConfirmacao?.confirmado === true && !afterDataHoraKey) {
        logger.warn("[ExecucaoEquipeEmail] ausencia de dataHora", {obraId, tipo});
      }
      const changed = Boolean(
        afterConfirmacao?.confirmado === true &&
        afterDataHoraKey &&
        (beforeConfirmacao?.confirmado !== true || beforeDataHoraKey !== afterDataHoraKey),
      );

      return {
        tipo,
        changed,
        dataHora: afterConfirmacao?.dataHora,
        millis: afterMillis,
        dataHoraKey: afterDataHoraKey,
        confirmadoPorNome: afterConfirmacao?.confirmadoPorNome,
      };
    })
    .filter((item) => item.changed);
}

exports.notifyOnNewPhoto = onDocumentCreated("fotos/{fotoId}", async (event) => {
  const data = event.data?.data() ?? {};
  const obraId = normalizeString(data.obraId);
  if (!obraId) return;

  await dispatchNotificationFromEvent({
    obraId,
    tipo: "foto_nova",
    titulo: "Nova foto adicionada",
    mensagem: "Uma nova foto foi publicada na sua obra.",
    origemColecao: "fotos",
    origemId: event.params.fotoId,
    metadata: {
      nomeArquivo: normalizeString(data.displayName) || normalizeString(data.originalName),
      etapa: normalizeString(data.etapaLabel) || normalizeString(data.etapa),
      rotaDestino: "/cliente/fotos",
    },
    idempotencyKey: `fotos:${event.params.fotoId}`,
  });
});

exports.notifyOnNewDocument = onDocumentCreated("documentos/{documentoId}", async (event) => {
  const data = event.data?.data() ?? {};
  const obraId = normalizeString(data.obraId);
  if (!obraId) return;

  await dispatchNotificationFromEvent({
    obraId,
    tipo: "documento_novo",
    titulo: "Novo documento disponível",
    mensagem: "Um novo documento foi enviado para a sua obra.",
    origemColecao: "documentos",
    origemId: event.params.documentoId,
    metadata: {
      nomeArquivo: normalizeString(data.displayName) || normalizeString(data.originalName),
      rotaDestino: "/cliente/documentos",
    },
    idempotencyKey: `documentos:${event.params.documentoId}`,
  });
});

exports.notifyOnObraProgressUpdate = onDocumentUpdated("obras/{obraId}", async (event) => {
  const beforeData = event.data?.before?.data() ?? {};
  const afterData = event.data?.after?.data() ?? {};
  const obraId = event.params.obraId;

  const diff = detectProgressChanges(beforeData.statusObra, afterData.statusObra);
  const execucaoEquipeChanges = getExecucaoEquipeChanges(beforeData, afterData, obraId);
  if (!diff.changed && execucaoEquipeChanges.length === 0) {
    return;
  }

  let execucaoEquipeClientes = null;

  if (diff.changed) {
    const etapa = diff.etapa;

    const mensagem = diff.toggledCount > 1
      ? `A etapa '${etapa}' teve ${diff.toggledCount} itens com progresso atualizado.`
      : `A etapa '${etapa}' teve atualizacao no andamento.`;

    await dispatchNotificationFromEvent({
      obraId,
      tipo: "progresso_obra",
      titulo: "Atualizacao no progresso da obra",
      mensagem,
      origemColecao: "obras",
      origemId: obraId,
      metadata: {
        etapa,
        toggledCount: diff.toggledCount,
        changedStages: diff.changedStages,
        rotaDestino: "/cliente/obra",
      },
      idempotencyKey: `status:${obraId}:${event.data.after.updateTime.toMillis()}`,
    });
  }

  for (const change of execucaoEquipeChanges) {
    if (!execucaoEquipeClientes) {
      execucaoEquipeClientes = await getClientUsersByObraId(db, obraId);
    }

    const dataHoraLabel = formatDateTimePtBr(change.dataHora);
    const obraNome = normalizeString(afterData.nome) || "obra";
    const isSaida = change.tipo === "saida";

    await dispatchNotificationFromEvent({
      obraId,
      tipo: isSaida ? "equipe_saida_confirmada" : "equipe_chegada_confirmada",
      titulo: isSaida ? "Equipe a caminho da obra" : "Equipe chegou a obra",
      mensagem: isSaida
        ? `A equipe de execucao teve saida confirmada para a obra ${obraNome} em ${dataHoraLabel}.`
        : `A chegada da equipe de execucao na obra ${obraNome} foi confirmada em ${dataHoraLabel}.`,
      origemColecao: "obras",
      origemId: obraId,
      metadata: {
        rotaDestino: "/cliente/obra",
        eventoExecucaoEquipe: change.tipo,
        dataHoraConfirmada: change.millis ? new Date(change.millis).toISOString() : null,
      },
      idempotencyKey: `execucaoEquipe:${obraId}:${change.tipo}:${change.dataHoraKey}`,
      users: execucaoEquipeClientes,
    });

    try {
      await createExecucaoEquipeEmailNotifications({
        obraId,
        obraData: afterData,
        tipo: isSaida ? "saida_equipe" : "chegada_equipe",
        dataHora: change.dataHora,
        confirmadoPorNome: change.confirmadoPorNome,
        clientes: execucaoEquipeClientes,
      });
    } catch (error) {
      logger.error("[ExecucaoEquipeEmail] erro ao criar documento", {
        obraId,
        tipo: isSaida ? "saida_equipe" : "chegada_equipe",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

exports.notifyOnFinancialInstallmentCreated = onDocumentCreated("financeiroParcelas/{parcelaId}", async (event) => {
  const data = event.data?.data() ?? {};
  const obraId = normalizeString(data.obraId);
  if (!obraId) return;

  const numeroParcela = normalizeNumber(data.numero);

  await dispatchNotificationFromEvent({
    obraId,
    tipo: "financeiro_nova_parcela",
    titulo: "Nova parcela criada",
    mensagem: `Uma nova parcela${numeroParcela ? ` (#${numeroParcela})` : ""} foi adicionada ao financeiro da sua obra.`,
    origemColecao: "financeiroParcelas",
    origemId: event.params.parcelaId,
    metadata: {
      numeroParcela: numeroParcela ?? undefined,
      valor: normalizeNumber(data.valor) ?? undefined,
      vencimento: toIsoDate(data.vencimento) || undefined,
      rotaDestino: "/cliente/financas",
    },
    idempotencyKey: `fin:create:${event.params.parcelaId}`,
  });
});

exports.notifyOnFinancialInstallmentUpdated = onDocumentUpdated("financeiroParcelas/{parcelaId}", async (event) => {
  const beforeData = event.data?.before?.data() ?? {};
  const afterData = event.data?.after?.data() ?? {};
  const obraId = normalizeString(afterData.obraId || beforeData.obraId);
  if (!obraId) return;

  const parcelaId = event.params.parcelaId;
  const numeroParcela = normalizeNumber(afterData.numero) ?? normalizeNumber(beforeData.numero);

  const beforeBoleto = normalizeString(beforeData.boletoPath || beforeData.boletoUrl || beforeData?.boleto?.path || beforeData?.boleto?.url);
  const afterBoleto = normalizeString(afterData.boletoPath || afterData.boletoUrl || afterData?.boleto?.path || afterData?.boleto?.url);

  if (!beforeBoleto && afterBoleto) {
    await dispatchNotificationFromEvent({
      obraId,
      tipo: "financeiro_boleto_disponivel",
      titulo: "Boleto disponível",
      mensagem: `O boleto da parcela${numeroParcela ? ` #${numeroParcela}` : ""} foi disponibilizado para você.`,
      origemColecao: "financeiroParcelas",
      origemId: parcelaId,
      metadata: {
        numeroParcela: numeroParcela ?? undefined,
        rotaDestino: "/cliente/financas",
      },
      idempotencyKey: `fin:boleto:${parcelaId}:${event.data.after.updateTime.toMillis()}`,
    });
    return;
  }

  const statusDiff = getChangedStatusFields(beforeData, afterData);
  if (statusDiff.changed) {
    await dispatchNotificationFromEvent({
      obraId,
      tipo: "financeiro_status_alterado",
      titulo: "Status financeiro atualizado",
      mensagem: `A parcela${numeroParcela ? ` #${numeroParcela}` : ""} mudou de status para '${statusDiff.after || "atualizado"}'.`,
      origemColecao: "financeiroParcelas",
      origemId: parcelaId,
      metadata: {
        numeroParcela: numeroParcela ?? undefined,
        statusAnterior: statusDiff.before || undefined,
        statusNovo: statusDiff.after || undefined,
        rotaDestino: "/cliente/financas",
      },
      idempotencyKey: `fin:status:${parcelaId}:${statusDiff.before}->${statusDiff.after}:${event.data.after.updateTime.toMillis()}`,
    });
  }
});

exports.sendEmailNotification = onDocumentCreated(
  {
    document: "emailNotifications/{emailId}",
    region: "southamerica-east1",
    secrets: [resendApiKey],
    maxInstances: 5,
  },
  async (event) => {
    const emailId = event.params.emailId;
    const snapshot = event.data;
    let lockId = null;
    let rawDedupeKey = null;

    if (!snapshot) {
      logger.warn("[EmailNotification] Evento sem snapshot", {emailId});
      return;
    }

    try {
      logger.info("[EmailNotification] Inicio do processamento", {emailId});

    /** @type {EmailNotificationPayload} */
    const payload = snapshot.data();

    if (payload.status !== "pending") {
      logger.info("[EmailNotification] Documento ignorado: status diferente de pending", {
        emailId,
        status: payload.status,
      });
      return;
    }

    const to = Array.isArray(payload.to)
      ? payload.to.filter((email) => typeof email === "string" && email.trim()).map((email) => email.trim())
      : typeof payload.to === "string" && payload.to.trim()
        ? [payload.to.trim()]
        : [];
    const subject = typeof payload.subject === "string" ? payload.subject : "";
    const html = typeof payload.html === "string" ? payload.html : "";

    if (!to.length || !subject.trim() || !html.trim()) {
      await snapshot.ref.update({
        status: "error",
        errorAt: FieldValue.serverTimestamp(),
        error: "Campos obrigatórios ausentes: to, subject ou html.",
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.error("[EmailNotification] Campos obrigatórios ausentes", {
        emailId,
        hasTo: to.length > 0,
        hasSubject: Boolean(subject.trim()),
        hasHtml: Boolean(html.trim()),
      });

      return;
    }

      if (typeof payload.dedupeKey === "string" && payload.dedupeKey.trim()) {
        rawDedupeKey = payload.dedupeKey.trim();
      } else {
        rawDedupeKey = emailId;
        logger.warn("[EmailNotification] dedupeKey ausente; usando emailId como fallback", {
          emailId,
          dedupeKey: rawDedupeKey,
        });
      }

      lockId = crypto.createHash("sha256").update(rawDedupeKey).digest("hex");
      const lockRef = db.collection("emailNotificationLocks").doc(lockId);

      const shouldSend = await db.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        const lock = lockSnap.exists ? lockSnap.data() ?? {} : null;

        if (lock && (lock.status === "processing" || lock.status === "sent")) {
          transaction.update(snapshot.ref, {
            status: "skipped_duplicate",
            duplicateOf: lock.emailNotificationId || null,
            dedupeKey: rawDedupeKey,
            lockId,
            skippedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return false;
        }

        transaction.set(lockRef, {
          dedupeKey: rawDedupeKey,
          emailNotificationId: emailId,
          status: "processing",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        transaction.update(snapshot.ref, {
          status: "processing",
          dedupeKey: rawDedupeKey,
          lockId,
          attempts: FieldValue.increment(1),
          processingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return true;
      });

      if (!shouldSend) {
        logger.warn("[EmailNotification] Duplicado ignorado", {
          emailId,
          dedupeKey: rawDedupeKey,
          lockId,
        });
        return;
      }

      logger.info("[EmailNotification] Lock criado ou assumido", {
        emailId,
        dedupeKey: rawDedupeKey,
        lockId,
      });

      const resend = new Resend(resendApiKey.value());

      logger.info("[EmailNotification] Envio iniciado", {
        emailId,
        dedupeKey: rawDedupeKey,
        lockId,
        toCount: to.length,
      });

      const result = await resend.emails.send({
        from: DEFAULT_FROM,
        to,
        subject,
        html,
        text: payload.text,
      });

      if (result.error) {
        const errorMessage = JSON.stringify(result.error);
        const batch = db.batch();

        batch.update(snapshot.ref, {
          status: "error",
          error: errorMessage,
          errorAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batch.update(lockRef, {
          status: "error",
          error: errorMessage,
          errorAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();

        logger.error("[EmailNotification] Erro retornado pelo Resend", {
          emailId,
          dedupeKey: rawDedupeKey,
          lockId,
          error: result.error,
        });

        return;
      }

      const providerMessageId = result.data?.id ?? null;
      const batch = db.batch();

      batch.update(snapshot.ref, {
        status: "sent",
        provider: "resend",
        providerMessageId,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.update(lockRef, {
        status: "sent",
        provider: "resend",
        providerMessageId,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      logger.info("[EmailNotification] Envio concluido", {
        emailId,
        dedupeKey: rawDedupeKey,
        lockId,
        providerMessageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await snapshot.ref.update({
        status: "error",
        error: message,
        errorAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (lockId) {
        try {
          await db.collection("emailNotificationLocks").doc(lockId).update({
            status: "error",
            error: message,
            errorAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (lockError) {
          logger.error("[EmailNotification] Erro inesperado ao atualizar lock", {
            emailId,
            dedupeKey: rawDedupeKey,
            lockId,
            error: lockError instanceof Error ? lockError.message : String(lockError),
          });
        }
      }

      logger.error("[EmailNotification] Erro inesperado", {
        emailId,
        dedupeKey: rawDedupeKey,
        lockId,
        error: message,
      });
    }
  },
);

exports.notifyUpcomingFinancialDueDates = onSchedule({
  schedule: "every day 08:00",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const limitDate = new Date(startOfToday);
  limitDate.setDate(limitDate.getDate() + 5);

  const snap = await db
    .collection("financeiroParcelas")
    .where("status", "in", ["pendente", "comprovante_enviado", "rejeitado"])
    .where("vencimento", ">=", admin.firestore.Timestamp.fromDate(startOfToday))
    .where("vencimento", "<=", admin.firestore.Timestamp.fromDate(limitDate))
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() ?? {};
    const dueDate = data.vencimento?.toDate ? data.vencimento.toDate() : null;
    if (!dueDate) continue;

    const daysUntilDue = Math.ceil((dueDate.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    if (!shouldNotifyUpcomingDue(data, daysUntilDue)) {
      continue;
    }

    const warningKey = `${docSnap.id}:${dueDate.toISOString().slice(0, 10)}`;

    await dispatchNotificationFromEvent({
      obraId: normalizeString(data.obraId),
      tipo: "financeiro_vencimento_proximo",
      titulo: "Parcela próxima do vencimento",
      mensagem: `A parcela${normalizeNumber(data.numero) ? ` #${normalizeNumber(data.numero)}` : ""} vence em ${daysUntilDue} dia(s).`,
      origemColecao: "financeiroParcelas",
      origemId: docSnap.id,
      metadata: {
        numeroParcela: normalizeNumber(data.numero) ?? undefined,
        vencimento: toIsoDate(data.vencimento) || undefined,
        valor: normalizeNumber(data.valor) ?? undefined,
        diasParaVencimento: daysUntilDue,
        warningKey,
        rotaDestino: "/cliente/financas",
      },
      idempotencyKey: `fin:due:${warningKey}`,
    });
  }

  logger.info("[notifications] rotina de vencimentos executada", {
    totalParcelasAvaliadas: snap.size,
  });
});

exports.adminRefreshExternalNews = onCall(async (request) => {
  const callerUid = requireAuth(request);
  await requireStaff(callerUid);

  const result = await runExternalNewsIngestion({
    trigger: "manual_admin",
    callerUid,
  });

  return {
    ok: true,
    ...result,
  };
});

exports.scheduledIngestNews = scheduledIngestNews;
