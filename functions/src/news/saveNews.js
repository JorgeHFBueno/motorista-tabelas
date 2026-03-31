const admin = require("firebase-admin");
const {db} = require("../../lib/authz");

async function findExistingByUrlOrHash(category, url, hashDedupe) {
  const byHashSnap = await db.collection("noticias")
    .where("categoria", "==", category)
    .where("hashDedupe", "==", hashDedupe)
    .limit(1)
    .get();

  if (!byHashSnap.empty) return byHashSnap.docs[0];

  if (url) {
    const byUrlSnap = await db.collection("noticias")
      .where("categoria", "==", category)
      .where("url", "==", url)
      .limit(1)
      .get();

    if (!byUrlSnap.empty) return byUrlSnap.docs[0];
  }

  return null;
}

function hasMeaningfulDiff(existing, incoming) {
  const fields = ["titulo", "resumo", "imagemUrl", "publicadoEm", "fonte", "status", "origem"];
  return fields.some((field) => {
    if (field === "publicadoEm") {
      const currentMs = existing.publicadoEm?.toDate?.()?.getTime?.() || 0;
      return currentMs !== incoming.publicadoEm.getTime();
    }
    return (existing[field] || null) !== (incoming[field] || null);
  });
}

async function saveCuratedNews(items) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await findExistingByUrlOrHash(item.categoria, item.url, item.hashDedupe);

    if (!existing) {
      await db.collection("noticias").add({
        ...item,
        publicadoEm: admin.firestore.Timestamp.fromDate(item.publicadoEm),
        createdAt: now,
        updatedAt: now,
        criadoPor: null,
        atualizadoPor: null,
      });
      created += 1;
      continue;
    }

    const data = existing.data();
    if (!hasMeaningfulDiff(data, item)) {
      skipped += 1;
      continue;
    }

    await existing.ref.set({
      titulo: item.titulo,
      resumo: item.resumo,
      imagemUrl: item.imagemUrl,
      fonte: item.fonte,
      publicadoEm: admin.firestore.Timestamp.fromDate(item.publicadoEm),
      updatedAt: now,
      atualizadoPor: null,
    }, {merge: true});
    updated += 1;
  }

  return {created, updated, skipped};
}

module.exports = {saveCuratedNews};