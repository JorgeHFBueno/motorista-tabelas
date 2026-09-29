// tests/kiosk-credentials.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/services/kioskCredentialsUtils.ts
var KIOSK_STATUS_BATCH_SIZE = 200;
function isKioskPin(value) {
  return /^\d{6}$/.test(value);
}
function uniqueUidBatches(uids) {
  const unique = [...new Set(uids.filter((uid) => uid.trim().length > 0))];
  return Array.from({ length: Math.ceil(unique.length / KIOSK_STATUS_BATCH_SIZE) }, (_, index) => unique.slice(index * KIOSK_STATUS_BATCH_SIZE, (index + 1) * KIOSK_STATUS_BATCH_SIZE));
}
function qrStatusLabel(status) {
  if (!status?.qrConfigured) return "N\xE3o emitido";
  return status.qrRevoked ? "Revogado" : "Ativo";
}
function pinStatusLabel(status) {
  if (!status?.pinConfigured) return "N\xE3o configurado";
  return status.pinEnabled ? "Ativo" : "Desativado";
}
function sanitizeKioskFilename(uid) {
  return `kiosk-qr-${uid.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "credencial"}.png`;
}
function formatKioskUpdatedAt(value) {
  if (!value) return "\u2014";
  const serializedSeconds = typeof value === "object" && value !== null ? typeof value.seconds === "number" ? value.seconds : typeof value._seconds === "number" ? value._seconds : null : null;
  const candidate = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : serializedSeconds !== null ? new Date(serializedSeconds * 1e3) : typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : null;
  if (!candidate || Number.isNaN(candidate.getTime())) return "\u2014";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(candidate);
}

// tests/kiosk-credentials.test.ts
test("kiosk status labels map QR and PIN states", () => {
  assert.equal(qrStatusLabel(void 0), "N\xE3o emitido");
  assert.equal(qrStatusLabel({ uid: "a", qrConfigured: true, qrRevoked: false, pinConfigured: false, pinEnabled: false, updatedAt: null, updatedBy: null }), "Ativo");
  assert.equal(qrStatusLabel({ uid: "a", qrConfigured: true, qrRevoked: true, pinConfigured: false, pinEnabled: false, updatedAt: null, updatedBy: null }), "Revogado");
  assert.equal(pinStatusLabel(void 0), "N\xE3o configurado");
  assert.equal(pinStatusLabel({ uid: "a", qrConfigured: false, qrRevoked: false, pinConfigured: true, pinEnabled: false, updatedAt: null, updatedBy: null }), "Desativado");
});
test("UIDs are deduplicated and split into 200-entry batches", () => {
  const batches = uniqueUidBatches([...Array.from({ length: 205 }, (_, i) => `u${i}`), "u0", ""]);
  assert.deepEqual(batches.map((batch) => batch.length), [200, 5]);
});
test("frontend PIN validation matches the six-digit policy", () => {
  assert.equal(isKioskPin("123456"), true);
  assert.equal(isKioskPin("12345"), false);
  assert.equal(isKioskPin("1234567"), false);
  assert.equal(isKioskPin("12a456"), false);
});
test("filename and timestamps are defensive", () => {
  assert.equal(sanitizeKioskFilename("../bad uid"), "kiosk-qr-bad_uid.png");
  assert.equal(formatKioskUpdatedAt(null), "\u2014");
  assert.equal(formatKioskUpdatedAt("invalid"), "\u2014");
  assert.match(formatKioskUpdatedAt({ toDate: () => /* @__PURE__ */ new Date("2026-09-17T15:30:00Z") }), /^17\/09\/2026/);
  assert.match(formatKioskUpdatedAt({ seconds: 1789659e3 }), /^17\/09\/2026/);
});
