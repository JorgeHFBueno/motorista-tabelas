const admin = require("firebase-admin");
const {db} = require("../../lib/authz");
const {CURATION_CONFIG} = require("./config");
const {jaccardSimilarity} = require("./normalizers/text");

async function findExistingByUrlOrHash(category, url, hashDedupe) {
  const byHashSnap = await db.collection("noticias")
    .where("categoria", "==", category)
    .where("origem", "==", "externa")
    .where("hashDedupe", "==", hashDedupe)
    .limit(1)
    .get();

  if (!byHashSnap.empty) return byHashSnap.docs[0];

  if (url) {
    const byUrlSnap = await db.collection("noticias")
      .where("categoria", "==", category)
      .where("origem", "==", "externa")
      .where("url", "==", url)
      .limit(1)
      .get();

    if (!byUrlSnap.empty) return byUrlSnap.docs[0];
  }

  return null;
}

async function findSimilarTitle(category, title) {
  const recentSnap = await db.collection("noticias")
    .where("categoria", "==", category)
    .where("status", "==", "publicada")
    .orderBy("publicadoEm", "desc")
    .limit(20)
    .get();

  return recentSnap.docs.find((docSnap) => {
    const current = docSnap.data();
    if (current.origem !== "externa") return false;
    return jaccardSimilarity(current.titulo || "", title) >= CURATION_CONFIG.titleSimilarityThreshold;
  }) || null;
}

function hasMeaningfulDiff(existing, incoming) {
  const fields = ["titulo", "resumo", "imagemUrl", "publicadoEm", "fonte", "status", "origem", "url", "hashDedupe", "relevanciaScore"];
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
  const touchedCategories = new Set();

  for (const item of items) {
    touchedCategories.add(item.categoria);

    const existing = await findExistingByUrlOrHash(item.categoria, item.url, item.hashDedupe);
    const existingByTitle = existing || await findSimilarTitle(item.categoria, item.titulo);
    const target = existingByTitle;

    if (!target) {
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

    const data = target.data();
    if (data.origem !== "externa") {
      skipped += 1;
      continue;
    }
    if (!hasMeaningfulDiff(data, item)) {
      skipped += 1;
      continue;
    }

    await target.ref.set({
      titulo: item.titulo,
      resumo: item.resumo,
      imagemUrl: item.imagemUrl,
      url: item.url,
      fonte: item.fonte,
      tags: item.tags,
      hashDedupe: item.hashDedupe,
      relevanciaScore: item.relevanciaScore,
      publicadoEm: admin.firestore.Timestamp.fromDate(item.publicadoEm),
      updatedAt: now,
      atualizadoPor: null,
    }, {merge: true});
    updated += 1;
  }

  for (const category of touchedCategories) {
    await enforceVisibilityLimit(category, CURATION_CONFIG.maxPerCategory, now);
  }

  return {created, updated, skipped};
}

async function enforceVisibilityLimit(category, maxPerCategory, now) {
  const visibleSnap = await db.collection("noticias")
    .where("categoria", "==", category)
    .where("status", "==", "publicada")
    .orderBy("publicadoEm", "desc")
    .limit(30)
    .get();

  const externalVisible = visibleSnap.docs.filter((docSnap) => docSnap.data().origem === "externa");
  const overflow = externalVisible.slice(maxPerCategory);
  if (!overflow.length) return;

  await Promise.all(overflow.map((docSnap) => docSnap.ref.set({
    status: "rascunho",
    updatedAt: now,
    atualizadoPor: null,
  }, {merge: true})));
}

module.exports = {saveCuratedNews};
