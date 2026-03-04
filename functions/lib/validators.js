const {HttpsError} = require("firebase-functions/v2/https");

const USER_TYPES = ["cliente", "funcionario"];
const USER_ROLES = ["admin", "gerente", "operacional", "cliente"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertObject(data, name) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", `${name} inválido.`);
  }
}

function assertRole(role) {
  if (!USER_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "role inválido.");
  }
}

function assertTipo(tipo) {
  if (!USER_TYPES.includes(tipo)) {
    throw new HttpsError("invalid-argument", "tipo inválido.");
  }
}

function assertUid(uid) {
  if (!isNonEmptyString(uid)) {
    throw new HttpsError("invalid-argument", "uid é obrigatório.");
  }
}

function assertObraId(obraId) {
  if (!isNonEmptyString(obraId)) {
    throw new HttpsError("invalid-argument", "obraId é obrigatório.");
  }
}

function validateAdminCreateUser(data) {
  assertObject(data, "Payload");

  const emailRaw = typeof data.email === "string" ? data.email.trim() : "";
  const emailLower = emailRaw.toLowerCase();
  const password = typeof data.password === "string" ? data.password : "";
  const nome = typeof data.nome === "string" ? data.nome.trim() : "";
  const tipo = data.tipo;
  const role = data.role;
  const obras = data.obras ?? [];

  if (!isNonEmptyString(emailRaw)) {
    throw new HttpsError("invalid-argument", "email é obrigatório.");
  }
  if (!/^\S+@\S+\.\S+$/.test(emailLower)) {
    throw new HttpsError("invalid-argument", "email inválido.");
  }
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "password deve ter no mínimo 6 caracteres.");
  }
  if (!isNonEmptyString(nome)) {
    throw new HttpsError("invalid-argument", "nome é obrigatório.");
  }

  assertTipo(tipo);
  assertRole(role);

  if (!Array.isArray(obras) || !obras.every(isNonEmptyString)) {
    throw new HttpsError("invalid-argument", "obras deve ser um array de strings.");
  }

  return {
    email: emailLower,
    emailLower,
    password,
    nome,
    tipo,
    role,
    obras: obras.map((obra) => obra.trim()),
  };
}

function validateAdminSetRole(data) {
  assertObject(data, "Payload");

  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  const role = data.role;
  const tipo = data.tipo;
  const ativo = data.ativo;

  assertUid(uid);
  assertRole(role);

  if (tipo !== undefined) {
    assertTipo(tipo);
  }

  if (ativo !== undefined && typeof ativo !== "boolean") {
    throw new HttpsError("invalid-argument", "ativo deve ser boolean quando informado.");
  }

  return {
    uid,
    role,
    tipo,
    ativo,
  };
}

function validateAdminLinkObra(data) {
  assertObject(data, "Payload");

  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  const obraId = typeof data.obraId === "string" ? data.obraId.trim() : "";

  assertUid(uid);
  assertObraId(obraId);

  return {uid, obraId};
}

module.exports = {
  validateAdminCreateUser,
  validateAdminSetRole,
  validateAdminLinkObra,
};