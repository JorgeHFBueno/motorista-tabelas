const admin = require("firebase-admin");

const {FieldValue} = admin.firestore;

function userRef(db, uid) {
  return db.collection("users").doc(uid);
}

async function ensureUserDocExists(db, uid) {
  const ref = userRef(db, uid);
  const snap = await ref.get();

  if (!snap.exists) {
    return null;
  }

  return ref;
}

function buildAdminSetRoleUpdate({role, tipo, ativo}) {
  const payload = {role};

  if (tipo !== undefined) payload.tipo = tipo;
  if (ativo !== undefined) payload.ativo = ativo;

  return payload;
}

module.exports = {
  FieldValue,
  userRef,
  ensureUserDocExists,
  buildAdminSetRoleUpdate,
};