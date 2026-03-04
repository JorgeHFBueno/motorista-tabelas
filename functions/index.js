const admin = require("firebase-admin");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2/options");
const logger = require("firebase-functions/logger");

const {db, requireAuth, requireAdmin} = require("./lib/authz");
const {
  validateAdminCreateUser,
  validateAdminSetRole,
  validateAdminLinkObra,
} = require("./lib/validators");
const {
  FieldValue,
  userRef,
  ensureUserDocExists,
  buildAdminSetRoleUpdate,
} = require("./lib/firestore");

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