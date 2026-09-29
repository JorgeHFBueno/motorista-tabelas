import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'app-motor-api';
const contracts = ['12806288209', '12808776050', '12980608147', '12998583588', '12999477696'];

if (!getApps().length) initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const result = { contracts: [], masters: [] };

for (const id of contracts) {
  const snap = await db.collection('monday-obras').doc(id).get();
  const raw = snap.get('raw');
  const subitems = raw && Array.isArray(raw.subitems) ? raw.subitems : null;
  result.contracts.push({
    id, exists: snap.exists, rawId: raw?.id ?? null, nome: raw?.nome ?? null,
    empresa: raw?.empresa ?? null, status: raw?.status ?? null, inicio: raw?.inicio ?? null,
    subitemsArray: Array.isArray(subitems), subitems: subitems?.map((item) => ({ id: item?.id ?? null, nome: item?.nome ?? null })) ?? null,
  });
}

const masters = await db.collection('monday-mestres').get();
result.masters = masters.docs.map((item) => ({ id: item.id, data: item.data() }));
console.log(JSON.stringify(result, null, 2));
