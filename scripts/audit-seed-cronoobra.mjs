import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'app-motor-api';
const contracts = ['12806288209', '12808776050', '12980608147', '12998583588', '12999477696'];
const masters = [
  ['dine', 'DINE', '376f55'], ['dilamar', 'DILAMAR', '245f61'], ['jefe', 'JEFE', '654084'],
  ['vanderlei', 'VANDERLEI', '743f78'], ['rudimar', 'RUDIMAR', '4d548b'], ['everaldo', 'EVERALDO', 'a0522d'],
  ['amilton', 'AMILTON', '70483a'], ['antonio', 'ANTÔNIO', '6a5136'], ['tiago', 'TIAGO', '2f6f8f'],
];

if (!getApps().length) initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const result = { contracts: [], mastersBefore: 0, created: [], ok: [], conflicts: [], mastersAfter: 0 };

for (const id of contracts) {
  const snap = await db.collection('monday-obras').doc(id).get();
  const raw = snap.get('raw');
  const subitems = raw && Array.isArray(raw.subitems) ? raw.subitems : null;
  result.contracts.push({
    id, exists: snap.exists, rawId: raw?.id ?? null, nome: raw?.nome ?? null, empresa: raw?.empresa ?? null,
    status: raw?.status ?? null, inicio: raw?.inicio ?? null, subitemsArray: Boolean(subitems),
    subitems: subitems?.map((item) => ({ id: item?.id ?? null, nome: item?.nome ?? null })) ?? null,
  });
}

const before = await db.collection('monday-mestres').get();
result.mastersBefore = before.size;
const existing = new Map(before.docs.map((item) => [item.id, item.data()]));
for (const [id, nome, cor] of masters) {
  const current = existing.get(id);
  if (!current) {
    await db.collection('monday-mestres').doc(id).create({ nome, cor });
    result.created.push(id);
  } else if (current.nome === nome && current.cor === cor && Object.keys(current).length === 2) {
    result.ok.push(id);
  } else {
    result.conflicts.push({ id, current });
  }
}
result.mastersAfter = (await db.collection('monday-mestres').get()).size;
console.log(JSON.stringify(result, null, 2));
