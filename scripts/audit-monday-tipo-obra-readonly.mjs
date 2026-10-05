import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BOARD_ID = '8515762377';
const token = (await new Promise((resolve, reject) => {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => resolve(input.trim()));
  process.stdin.on('error', reject);
})).trim();
if (!token) throw new Error('MONDAY_API_TOKEN_REQUIRED_ON_STDIN');

const monday = async (query, variables) => {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': '2026-07' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) throw new Error(`MONDAY_API: ${payload.errors?.map((error) => error.message).join('; ') ?? response.status}`);
  return payload.data;
};

const schema = await monday('query ($boardId: ID!) { boards(ids: [$boardId]) { columns { id title type settings_str } } }', { boardId: BOARD_ID });
const columns = schema.boards?.[0]?.columns ?? [];
const column = columns.find((candidate) => candidate.title === 'Tipo de Obra') ?? columns.find((candidate) => candidate.title?.trim().toLocaleLowerCase('pt-BR') === 'tipo de obra');
if (!column) throw new Error('TIPO_DE_OBRA_COLUMN_NOT_FOUND');

const query = `query ($boardId: ID!, $columnId: String!) {
  boards(ids: [$boardId]) { items_page(limit: 100) { items {
    id name column_values(ids: [$columnId]) { id type text value ... on FormulaValue { display_value } }
  } } }
}`;
const response = await monday(query, { boardId: BOARD_ID, columnId: column.id });
const items = response.boards?.[0]?.items_page?.items ?? [];

if (!getApps().length) initializeApp({ projectId: 'app-motor-api', credential: applicationDefault() });
const firestore = getFirestore();
const snapshot = await firestore.collection('monday-obras').get();
const documents = new Map(snapshot.docs.map((document) => [document.id, document.data()]));
const canonical = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const valueOf = (item) => {
  const current = item.column_values?.[0];
  return canonical(current?.type === 'formula' ? current.display_value : current?.text);
};
const rows = items.map((item) => {
  const before = documents.get(String(item.id))?.raw?.tipoObra;
  const mondayValue = valueOf(item);
  return { id: String(item.id), nome: item.name ?? null, firestore: before === undefined ? undefined : before, monday: mondayValue, projetado: mondayValue, update: before !== mondayValue };
});
const { readMondayBoard, createPlan } = await import('../functions/lib/mondaySync.js');
const fullMondayItems = await readMondayBoard(token);
const firestoreDocuments = snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
const fullDocuments = new Map(firestoreDocuments.map((document) => [document.id, document.data]));
const obraV2Ids = [...new Set(firestoreDocuments.map((document) => document.data?.obraV2Id).filter((id) => typeof id === 'string' && id.trim()))];
const obraV2Documents = obraV2Ids.length ? await firestore.getAll(...obraV2Ids.map((id) => firestore.collection('obras-v2').doc(id))) : [];
const obraV2Statuses = new Map(obraV2Documents.map((document) => [document.id, document.get('status')]));
const fullPlan = createPlan(fullMondayItems, firestoreDocuments, obraV2Statuses);
const finalizacao = fullMondayItems.filter((item) => item.status === 'Obra Finalizada').map((item) => {
  const current = fullDocuments.get(item.id);
  const obraV2Id = typeof current?.obraV2Id === 'string' && current.obraV2Id.trim() ? current.obraV2Id : null;
  const obraV2Status = obraV2Id ? obraV2Statuses.get(obraV2Id) ?? null : null;
  return { itemId: item.id, nome: item.nome, obraV2Id, rawStatusProjetado: item.status, obraV2StatusAtual: obraV2Status, writeProjetado: Boolean(obraV2Id && obraV2Status !== 'FINALIZADA'), motivo: obraV2Id ? (obraV2Status === 'FINALIZADA' ? 'ALREADY_FINALIZED_NO_WRITE' : 'STATUS_NOT_FINALIZADA') : 'NO_OBRA_V2_ID' };
});
const item66Candidato = fullMondayItems.find((item) => item.id === '13192396801') ?? null;
const item66Documento = item66Candidato ? fullDocuments.get(item66Candidato.id) : null;
const distribution = rows.reduce((result, row) => {
  const key = row.monday ?? 'null';
  result[key] = (result[key] ?? 0) + 1;
  return result;
}, {});
const result = {
  boardId: BOARD_ID,
  column: { id: column.id, title: column.title, type: column.type, settings: column.settings_str },
  mondayItems: items.length,
  mondayObras: snapshot.size,
  tipoObra: {
    preenchidos: rows.filter((row) => row.monday !== null).length,
    null: rows.filter((row) => row.monday === null).length,
    campoInexistente: rows.filter((row) => row.firestore === undefined).length,
    jaIguais: rows.filter((row) => row.firestore !== undefined && row.firestore === row.monday).length,
    divergentes: rows.filter((row) => row.firestore !== undefined && row.firestore !== row.monday).length,
    documentosAtualizar: rows.filter((row) => row.update).length,
    distribuicao: distribution,
  },
  finalizacao: {
    contratosMondayFinalizados: finalizacao.length,
    comObraV2Id: finalizacao.filter((row) => row.obraV2Id).length,
    jaFinalizada: finalizacao.filter((row) => row.obraV2StatusAtual === 'FINALIZADA').length,
    realmenteAFinalizar: finalizacao.filter((row) => row.writeProjetado).length,
    statusObrasV2: finalizacao.filter((row) => row.obraV2Id).reduce((result, row) => { const key = row.obraV2StatusAtual ?? 'null'; result[key] = (result[key] ?? 0) + 1; return result; }, {}),
    itens: finalizacao.filter((row) => row.obraV2Id),
  },
  item66Candidato: item66Candidato ? { itemId: item66Candidato.id, nome: item66Candidato.nome, obraV2Id: item66Documento?.obraV2Id ?? null, status: item66Candidato.status, tipoObra: item66Candidato.tipoObra, participaFinalizacao: Boolean(item66Candidato.status === 'Obra Finalizada' && item66Documento?.obraV2Id) } : null,
  dryRun: { ...fullPlan.summary, firestoreWrites: 0, mondayWrites: 0 },
  carlosGomes: rows.find((row) => row.id === '12581501883') ?? null,
  amostras: rows.filter((row) => row.id === '12581501883' || row.update).slice(0, 12),
};
console.log(JSON.stringify(result, null, 2));
