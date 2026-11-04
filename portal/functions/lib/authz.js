const admin = require("firebase-admin");
const {HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    logger.warn("[admin-functions][auth] missing auth context");
    throw new HttpsError("unauthenticated", "Autenticação obrigatória.");
  }

  return request.auth.uid;
}

async function requireAdmin(callerUid) {
  const callerSnap = await db.collection("users").doc(callerUid).get();

  if (!callerSnap.exists) {
    logger.warn("[admin-functions][authz] caller profile not found", {callerUid});
    throw new HttpsError("permission-denied", "Perfil do usuário não encontrado.");
  }

  const callerData = callerSnap.data() ?? {};
  if (callerData.role !== "admin") {
    logger.warn("[admin-functions][authz] caller without admin role", {
      callerUid,
      role: callerData.role ?? null,
    });
    throw new HttpsError("permission-denied", "Apenas admins podem executar esta ação.");
  }

  return callerData;
}

module.exports = {
  db,
  requireAuth,
  requireAdmin,
};