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

    await userRef(db, authUser.uid).set({
      nome: payload.nome,
      tipo: payload.tipo,
      role: payload.role,
      obras: payload.obras,
      ativo: true,
      createdAt: FieldValue.serverTimestamp(),
    });

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