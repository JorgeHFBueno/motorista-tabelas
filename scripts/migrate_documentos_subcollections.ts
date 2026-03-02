/**
 * Migra arrays legados (auditoria, versoes, assinaturas) para subcoleções:
 * documentos/{docId}/auditoria|versoes|assinaturas
 *
 * Execução sugerida (fora do front-end):
 *  npx tsx scripts/migrate_documentos_subcollections.ts
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  throw new Error("Defina FIREBASE_SERVICE_ACCOUNT_JSON com o JSON da service account.");
}

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
  });
}

const db = getFirestore();

const toTimestamp = (value: unknown): Timestamp => {
  if (value instanceof Timestamp) return value;

  if (value && typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    const maybeDate = (value as { toDate?: () => Date }).toDate?.();
    if (maybeDate instanceof Date) return Timestamp.fromDate(maybeDate);
  }

  if (value instanceof Date) return Timestamp.fromDate(value);

  return Timestamp.now();
};

const migrate = async () => {
  const snap = await db.collection("documentos").get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const batch = db.batch();
    let touched = false;

    const auditoria = Array.isArray(data.auditoria) ? data.auditoria : [];
    for (const item of auditoria) {
      const evt = (item ?? {}) as Record<string, unknown>;
      const ref = docSnap.ref.collection("auditoria").doc();
      batch.set(ref, {
        titulo: String(evt.titulo ?? evt.action ?? "Evento"),
        por: String(evt.por ?? evt.user ?? "Sistema"),
        ip: typeof evt.ip === "string" ? evt.ip : null,
        createdAt: toTimestamp(evt.createdAt ?? evt.em),
        meta: evt.meta ?? null,
      });
      touched = true;
    }

    const versoes = Array.isArray(data.versoes) ? data.versoes : [];
    for (const item of versoes) {
      const ver = (item ?? {}) as Record<string, unknown>;
      const ref = docSnap.ref.collection("versoes").doc();
      batch.set(ref, {
        versao: String(ver.versao ?? ver.version ?? "1.0"),
        descricao: String(ver.descricao ?? ver.changes ?? "—"),
        por: String(ver.por ?? ver.author ?? "Sistema"),
        createdAt: toTimestamp(ver.createdAt ?? ver.em),
      });
      touched = true;
    }

    const assinaturas = Array.isArray(data.assinaturas) ? data.assinaturas : [];
    for (const item of assinaturas) {
      const sig = (item ?? {}) as Record<string, unknown>;
      const ref = docSnap.ref.collection("assinaturas").doc();
      batch.set(ref, {
        nome: String(sig.nome ?? sig.signer ?? "—"),
        papel: String(sig.papel ?? sig.role ?? "—"),
        metodo: typeof sig.metodo === "string" ? sig.metodo : null,
        ip: typeof sig.ip === "string" ? sig.ip : null,
        status: sig.status === "ASSINADO" ? "ASSINADO" : "PENDENTE",
        assinadoEm: sig.assinadoEm ? toTimestamp(sig.assinadoEm) : null,
        createdAt: toTimestamp(sig.createdAt ?? sig.assinadoEm),
        updatedAt: Timestamp.now(),
      });
      touched = true;
    }

    if (touched) {
      batch.update(docSnap.ref, {
        auditoria: null,
        versoes: null,
        assinaturas: null,
      });
      await batch.commit();
      console.log(`Migrado documento ${docSnap.id}`);
    }
  }

  console.log("Migração finalizada.");
};

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});