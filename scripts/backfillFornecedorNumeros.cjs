const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const FORNECEDORES_COLLECTION = 'notas-fornecedores';
const FORNECEDORES_NUMEROS_COLLECTION = 'notas-fornecedores-numeros';
const COUNTER_DOC = 'app-metadata/notas-fornecedores-numero';
const BATCH_LIMIT = 450;

const normalizeFornecedorNumero = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const getProjectId = () => {
  const projectArg = process.argv.find((arg) => arg.startsWith('--project='));
  return projectArg?.split('=')[1] || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
};

const initialize = () => {
  const projectId = getProjectId();
  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
};

const commitBatch = async (db, pendingWrites) => {
  for (let i = 0; i < pendingWrites.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    pendingWrites.slice(i, i + BATCH_LIMIT).forEach((write) => write(batch));
    await batch.commit();
  }
};

const main = async () => {
  initialize();
  const db = getFirestore();
  const snapshot = await db.collection(FORNECEDORES_COLLECTION).get();

  const docs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ref: doc.ref,
      data,
      numero: normalizeFornecedorNumero(data.numero),
      hasValidNumero: Boolean(normalizeFornecedorNumero(data.numero)),
    };
  });

  const used = new Map();
  const missing = [];
  let maxNumero = 0;

  docs.forEach((item) => {
    if (!item.hasValidNumero) {
      missing.push(item);
      return;
    }

    maxNumero = Math.max(maxNumero, item.numero);
    used.set(item.numero, [...(used.get(item.numero) || []), item.id]);
  });

  const duplicates = [...used.entries()].filter(([, ids]) => ids.length > 1);
  if (duplicates.length > 0) {
    console.warn('Duplicidades historicas encontradas em notas-fornecedores:');
    duplicates.forEach(([numero, ids]) => {
      console.warn(`- numero ${numero}: ${ids.join(', ')}`);
    });
    console.warn('O script nao altera documentos que ja possuem numero; apenas preenche faltantes.');
  }

  const usedNumbers = new Set(used.keys());
  let nextNumero = maxNumero + 1;
  const assigned = [];

  missing.forEach((item) => {
    while (usedNumbers.has(nextNumero)) {
      nextNumero += 1;
    }
    item.assignedNumero = nextNumero;
    assigned.push(item);
    usedNumbers.add(nextNumero);
    nextNumero += 1;
  });

  const pendingWrites = [];

  assigned.forEach((item) => {
    pendingWrites.push((batch) => {
      batch.update(item.ref, {
        numero: item.assignedNumero,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.collection(FORNECEDORES_NUMEROS_COLLECTION).doc(String(item.assignedNumero)), {
        fornecedorId: item.id,
        numero: item.assignedNumero,
        backfilledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  });

  [...used.entries()].forEach(([numero, ids]) => {
    if (ids.length !== 1) return;
    pendingWrites.push((batch) => {
      batch.set(db.collection(FORNECEDORES_NUMEROS_COLLECTION).doc(String(numero)), {
        fornecedorId: ids[0],
        numero,
        indexedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  });

  const finalMaxNumero = Math.max(maxNumero, ...assigned.map((item) => item.assignedNumero), 0);
  pendingWrites.push((batch) => {
    batch.set(db.doc(COUNTER_DOC), {
      ultimoNumero: finalMaxNumero,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await commitBatch(db, pendingWrites);

  console.log(`Documentos lidos: ${docs.length}`);
  console.log(`Fornecedores sem numero preenchidos: ${assigned.length}`);
  console.log(`Maior numero valido final: ${finalMaxNumero}`);
  if (duplicates.length > 0) {
    console.log('Concluido com alerta: existem duplicidades historicas que precisam de revisao manual.');
  } else {
    console.log('Concluido sem duplicidades historicas detectadas.');
  }
};

main().catch((error) => {
  console.error('Falha no backfill de numeros de fornecedores:', error);
  process.exit(1);
});
