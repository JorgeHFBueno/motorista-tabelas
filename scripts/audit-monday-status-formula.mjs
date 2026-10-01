import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'app-motor-api';
const expectedItems = 65;
const carlosId = '12581501883';
const token = process.env.MONDAY_API_TOKEN?.trim();
if (!token) throw new Error('MONDAY_API_TOKEN_REQUIRED');

if (!getApps().length) initializeApp({ projectId, credential: applicationDefault() });
const { readMondayBoard, createPlan } = await import('../functions/lib/mondaySync.js');
const db = getFirestore();
const [mondayItems, snapshot] = await Promise.all([readMondayBoard(token), db.collection('monday-obras').get()]);
const documents = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
const byId = new Map(documents.map((doc) => [doc.id, doc.data]));
const distribution = {};
const transitions = {};
const audit = { itens: mondayItems.length, rawStatusJaCorreto: 0, rawStatusDivergente: 0, formulaVazia: 0, rawStatusInexistente: 0 };
const fieldAudit = () => ({ preenchidos: 0, null: 0, inexistente: 0, jaIgual: 0, divergente: 0, updatesProjetados: 0, valores: {} });
const ordemInicio = fieldAudit();
const confirmacaoRecurso = fieldAudit();
const subitemsAudit = { monday: 0, firebase: 0, idsCasados: 0, novos: 0, ausentes: 0, statusIguais: 0, statusDivergentes: 0, null: 0 };
const distribuicaoStatusLotes = {};
function auditField(auditFieldResult, currentRaw, value, key) {
  if (value === null) auditFieldResult.null++; else { auditFieldResult.preenchidos++; auditFieldResult.valores[value] = (auditFieldResult.valores[value] ?? 0) + 1; }
  if (!Object.prototype.hasOwnProperty.call(currentRaw ?? {}, key)) auditFieldResult.inexistente++;
  else if (currentRaw[key] === value) auditFieldResult.jaIgual++;
  else auditFieldResult.divergente++;
  if (!currentRaw || currentRaw[key] !== value) auditFieldResult.updatesProjetados++;
}

for (const item of mondayItems) {
  const current = byId.get(item.id);
  const rawStatus = current?.raw?.status;
  auditField(ordemInicio, current?.raw, item.ordemInicio, 'ordemInicio');
  auditField(confirmacaoRecurso, current?.raw, item.confirmacaoRecurso, 'confirmacaoRecurso');
  const firebaseSubitems = Array.isArray(current?.raw?.subitems) ? current.raw.subitems : [];
  subitemsAudit.firebase += firebaseSubitems.length;
  const firebaseById = new Map(firebaseSubitems.map((subitem) => [String(subitem?.id), subitem]));
  subitemsAudit.monday += item.subitems.length;
  for (const subitem of item.subitems) {
    if (subitem.status === null) subitemsAudit.null++;
    else distribuicaoStatusLotes[subitem.status] = (distribuicaoStatusLotes[subitem.status] ?? 0) + 1;
    const firebaseSubitem = firebaseById.get(subitem.id);
    if (!firebaseSubitem) { subitemsAudit.novos++; continue; }
    subitemsAudit.idsCasados++;
    if (firebaseSubitem.status === subitem.status) subitemsAudit.statusIguais++; else subitemsAudit.statusDivergentes++;
  }
  for (const firebaseSubitem of firebaseSubitems) if (!item.subitems.some((subitem) => subitem.id === String(firebaseSubitem?.id))) subitemsAudit.ausentes++;
  const hasRawStatus = typeof rawStatus !== 'undefined';
  if (item.status === null) audit.formulaVazia++;
  else distribution[item.status] = (distribution[item.status] ?? 0) + 1;
  if (item.status === null) continue;
  if (!hasRawStatus) { audit.rawStatusInexistente++; continue; }
  if (rawStatus === item.status) { audit.rawStatusJaCorreto++; continue; }
  audit.rawStatusDivergente++;
  const key = `${JSON.stringify(rawStatus)} -> ${JSON.stringify(item.status)}`;
  transitions[key] = (transitions[key] ?? 0) + 1;
}

const carlos = mondayItems.find((item) => item.id === carlosId);
const carlosCurrent = byId.get(carlosId);
const finalized = mondayItems.filter((item) => item.status === 'Obra Finalizada');
const finalizedWithObraV2Id = finalized.filter((item) => typeof byId.get(item.id)?.obraV2Id === 'string' && byId.get(item.id).obraV2Id.trim());
const finalizedObras = await db.getAll(...finalizedWithObraV2Id.map((item) => db.collection('obras-v2').doc(byId.get(item.id).obraV2Id)));
const obrasV2AlreadyFinalized = finalizedObras.filter((item) => item.get('status') === 'FINALIZADA').length;
const obraV2Statuses = new Map(finalizedObras.map((item) => [item.id, item.get('status')]));
const plan = createPlan(mondayItems, documents, obraV2Statuses);
const unexpected = [
  ...(mondayItems.length === expectedItems ? [] : [`EXPECTED_${expectedItems}_ITEMS_GOT_${mondayItems.length}`]),
  ...plan.summary.erros,
];
const report = {
  mode: 'dry-run', projectId, expectedItems, audit, distribuicaoStatusCorreto: distribution,
  transicoesRawStatus: transitions,
  ordemInicio, confirmacaoRecurso, subitemsStatus: { ...subitemsAudit, distribuicao: distribuicaoStatusLotes },
  carlosGomes: carlos ? { mondayId: carlosId, nomeMonday: carlos.nome, statusContratoMonday: carlos.status, statusContratoFirebase: carlosCurrent?.raw?.status ?? null, statusContratoProjetado: carlos.status, ordemInicio: { monday: carlos.ordemInicio, firebaseAtual: carlosCurrent?.raw?.ordemInicio ?? null, projetado: carlos.ordemInicio }, confirmacaoRecurso: { monday: carlos.confirmacaoRecurso, firebaseAtual: carlosCurrent?.raw?.confirmacaoRecurso ?? null, projetado: carlos.confirmacaoRecurso }, lotes: carlos.subitems.map((subitem) => ({ subitemId: subitem.id, nome: subitem.nome, statusMonday: subitem.status, statusFirebase: (carlosCurrent?.raw?.subitems ?? []).find((current) => String(current?.id) === subitem.id)?.status ?? null, statusProjetadoUI: subitem.status ?? 'Sem status' })) } : null,
  finalizacao: { itensComObraFinalizada: finalized.length, comObraV2Id: finalizedWithObraV2Id.length, jaFinalizada: obrasV2AlreadyFinalized, writesObrasV2RealmenteNecessarios: plan.summary.obrasFinalizar, updatesObrasV2Projetados: plan.summary.obrasFinalizar },
  planSummary: plan.summary,
  firestoreWrites: 0, mondayWrites: 0, unexpected,
};
console.log(JSON.stringify(report, null, 2));
if (unexpected.length) process.exitCode = 2;
