const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {setGlobalOptions} = require("firebase-functions/v2/options");
const logger = require("firebase-functions/logger");
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
  }) {
  const normalizedObraId = normalizeString(obraId);
  if (!normalizedObraId) return;

  const users = await getClientUsersByObraId(db, normalizedObraId);
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
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

function formatDateTimePtBr(value) {
  const millis = timestampMillis(value);
  if (!millis) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(millis));
}

function getExecucaoEquipeChanges(beforeData, afterData) {
  const beforeExecucao = beforeData?.execucaoEquipe ?? {};
  const afterExecucao = afterData?.execucaoEquipe ?? {};

  return ["saida", "chegada"]
    .map((tipo) => {
      const beforeConfirmacao = beforeExecucao?.[tipo] ?? null;
      const afterConfirmacao = afterExecucao?.[tipo] ?? null;
      const beforeMillis = timestampMillis(beforeConfirmacao?.dataHora);
      const afterMillis = timestampMillis(afterConfirmacao?.dataHora);
      const changed = Boolean(afterConfirmacao?.confirmado === true && afterMillis && beforeMillis !== afterMillis);

      return {
        tipo,
        changed,
        dataHora: afterConfirmacao?.dataHora,
        millis: afterMillis,
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

  const diff = detectProgressChanges(beforeData.statusObra, afterData.statusObra);
  const execucaoEquipeChanges = getExecucaoEquipeChanges(beforeData, afterData);
  if (!diff.changed && execucaoEquipeChanges.length === 0) {
    return;
  }

  const obraId = event.params.obraId;

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
      idempotencyKey: `execucaoEquipe:${obraId}:${change.tipo}:${change.millis}`,
    });
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
