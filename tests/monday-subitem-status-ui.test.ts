import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MONDAY_SUBITEM_STATUS_OPTIONS, MondaySubitemStatusRequestError, mondayStatusFromLabel, updateMondaySubitemStatus } from '../src/services/mondaySubitemStatusService';
import { adaptRawCronograma } from '../src/features/cronograma-obras/data/source/rawCronogramaAdapter';
import { updateObraStatusByMondaySubitemId } from '../src/features/cronograma-obras/application/localPlanner';
import { separarObrasPorSituacao } from '../src/features/cronograma-obras/domain/contractStatus';
import { classificarLotePorStatus } from '../src/features/cronograma-obras/domain/contractStatus';

test('subitem without a name remains visible as Analisar Contrato', () => { const data = adaptRawCronograma([{ id: 'contract', exists: true, data: { obraV2Id: 'v2', raw: { nome: 'PARENT NAME', ordemInicio: 'ORDEM X', confirmacaoRecurso: 'RECURSO Y', subitems: [{ id: 'child', nome: '   ', status: 'Revisar escopo' }] } } }]); assert.equal(data.obras[0].nomeObra, 'Analisar Contrato'); assert.equal(data.contratos[0].ordemInicio, 'ORDEM X'); assert.equal(data.contratos[0].confirmacaoRecurso, 'RECURSO Y'); });

test('real LOTEs expose mondaySubitemId while synthetic contract rows never do', () => {
  const data = adaptRawCronograma([{ id: 'contract', exists: true, data: { obraV2Id: 'v2', raw: { nome: 'Contrato', subitems: [{ id: '13149530541', nome: 'LOTE 1', status: 'Revisar escopo' }] } } }, { id: 'synthetic', exists: true, data: { obraV2Id: 'v2', raw: { nome: 'Sem LOTE', subitems: [] } } }]);
  assert.equal(data.obras[0].mondaySubitemId, '13149530541'); assert.equal(data.obras[1].mondaySubitemId, undefined); assert.equal(data.obras[1].targetType, 'contrato');
});

test('the six UI labels map only to controlled frontend codes', () => {
  assert.deepEqual(MONDAY_SUBITEM_STATUS_OPTIONS.map((item) => item.code), ['EM_ANDAMENTO', 'FINALIZADO', 'PARADA', 'PROXIMA_A_INICIAR', 'REVISAR_ESCOPO', 'NAO_INICIADA']);
  assert.equal(mondayStatusFromLabel('Revisar escopo')?.code, 'REVISAR_ESCOPO'); assert.equal(mondayStatusFromLabel('Livre') ?? null, null);
});

test('frontend request sends only subitemId, controlled code and dryRun false with Firebase token', async () => {
  let received: { url?: string; options?: RequestInit } = {};
  const result = await updateMondaySubitemStatus('13149530541', 'PARADA', { currentUser: () => ({ getIdToken: async () => 'firebase-id-token' }) as any, fetch: async (url, options) => { received = { url: String(url), options }; return new Response(JSON.stringify({ result: 'UPDATED', subitemId: '13149530541', statusAnterior: { code: 'REVISAR_ESCOPO', label: 'Revisar escopo' }, statusAtual: { code: 'PARADA', label: 'Parada' } }), { status: 200 }); } });
  assert.equal(result.result, 'UPDATED'); assert.match(received.url!, /mondayUpdateSubitemStatus$/); assert.equal((received.options?.headers as Record<string, string>).Authorization, 'Bearer firebase-id-token');
  assert.deepEqual(JSON.parse(String(received.options?.body)), { subitemId: '13149530541', novoStatus: 'PARADA', dryRun: false });
});

test('snapshot failure retains the confirmed Monday status for the UI without retrying a mutation', async () => {
  await assert.rejects(
    () => updateMondaySubitemStatus('13149530541', 'PARADA', { currentUser: () => ({ getIdToken: async () => 'firebase-id-token' }) as any, fetch: async () => new Response(JSON.stringify({ error: 'SNAPSHOT_UPDATE_FAILED', mondayUpdated: true, subitemId: '13149530541', statusAtual: { code: 'PARADA', label: 'Parada' } }), { status: 500 }) }),
    (error: unknown) => error instanceof MondaySubitemStatusRequestError && error.code === 'SNAPSHOT_UPDATE_FAILED' && error.mondayUpdated && error.statusAtual?.label === 'Parada',
  );
});

test('confirmed status updates the canonical LOTEs by mondaySubitemId and rederives sections and counters', () => {
  const obras = adaptRawCronograma([{ id: 'c1', exists: true, data: { obraV2Id: 'v2', raw: { nome: 'Contrato', subitems: [{ id: 'a', nome: 'LOTE A', status: 'Não iniciada' }, { id: 'b', nome: 'LOTE B', status: 'Parada' }] } } }]).obras;
  const updated = updateObraStatusByMondaySubitemId(obras, 'a', 'Em andamento');
  const sections = separarObrasPorSituacao(updated);
  assert.deepEqual(sections['nao-iniciada'].map((obra) => obra.mondaySubitemId), []);
  assert.deepEqual(sections.iniciada.map((obra) => obra.mondaySubitemId), ['a', 'b']);
  assert.equal(new Set(sections.iniciada.map((obra) => obra.contratoId)).size, 1);
  assert.equal(updated[0].status, 'Em andamento');
  assert.equal(updated[1].status, 'Parada');
});

test('same-category confirmation and pre-confirmation failure leave grouping intact', () => {
  const obras = adaptRawCronograma([{ id: 'c1', exists: true, data: { obraV2Id: 'v2', raw: { nome: 'Contrato', subitems: [{ id: 'a', nome: 'LOTE A', status: 'Em andamento' }] } } }]).obras;
  const unchanged = separarObrasPorSituacao(obras);
  const confirmed = separarObrasPorSituacao(updateObraStatusByMondaySubitemId(obras, 'a', 'Parada'));
  assert.deepEqual(confirmed.iniciada.map((obra) => obra.id), unchanged.iniciada.map((obra) => obra.id));
  assert.deepEqual(separarObrasPorSituacao(obras), unchanged);
});

test('start action follows section classification, never a specific Monday label', () => {
  assert.equal(classificarLotePorStatus('Não iniciada'), 'nao-iniciada');
  assert.equal(classificarLotePorStatus('Revisar escopo'), 'nao-iniciada');
  assert.equal(classificarLotePorStatus('Próxima a Iniciar'), 'nao-iniciada');
  assert.equal(classificarLotePorStatus('Outro status'), 'nao-iniciada');
  const table = readFileSync('src/features/cronograma-obras/components/ContractTextTable.tsx', 'utf8');
  const control = readFileSync('src/features/cronograma-obras/components/MondaySubitemStatusControl.tsx', 'utf8');
  assert.match(table, /canStart=\{notStarted\}/);
  assert.match(control, /canStart: boolean/);
  assert.doesNotMatch(control, /status\.normalize|status ===|status ==/);
});

test('UI integration does not expose Monday internals or write Firestore/sync automatically', () => {
  const service = readFileSync('src/services/mondaySubitemStatusService.ts', 'utf8'); const control = readFileSync('src/features/cronograma-obras/components/MondaySubitemStatusControl.tsx', 'utf8'); const adapter = readFileSync('src/features/cronograma-obras/data/source/rawCronogramaAdapter.ts', 'utf8'); const page = readFileSync('src/features/cronograma-obras/CronogramaObrasPage.tsx', 'utf8');
  assert.doesNotMatch(service, /MONDAY_API_TOKEN|boardId|columnId|labelId|graphql|firestore|mondaySync/iu); assert.match(service, /Authorization: `Bearer \$\{token\}`/); assert.match(service, /dryRun: false/);
  assert.match(control, /disabled=\{saving\}/); assert.match(control, /'EM_ANDAMENTO'/); assert.match(control, /statusAtual/); assert.match(control, /Iniciar/); assert.match(control, /<select/); assert.match(control, /MONDAY_SUBITEM_STATUS_OPTIONS/); assert.doesNotMatch(control, /setDoc|updateDoc|mondaySync/);
  assert.match(control, /SNAPSHOT_UPDATE_FAILED/); assert.match(control, /mondayUpdated/);
  assert.match(control, /onStatusConfirmed/); assert.match(control, /result\.statusAtual/);
  assert.match(page, /applyConfirmedMondayStatus/); assert.match(page, /updateObraStatusByMondaySubitemId/); assert.match(page, /onStatusConfirmed=\{applyConfirmedMondayStatus\}/);
  assert.match(page, /V-1\.665 · MK6A/); assert.doesNotMatch(page, /Planejador local · MK2/);
  assert.match(adapter, /mondaySubitemId = obra\.id/);
});

test('started work finalization reuses the controlled callable status and shared control', async () => {
  let body: unknown;
  await updateMondaySubitemStatus('13149530541', 'FINALIZADO', {
    currentUser: () => ({ getIdToken: async () => 'firebase-id-token' }) as any,
    fetch: async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({ result: 'NO_CHANGE', subitemId: '13149530541', statusAnterior: { code: 'FINALIZADO', label: 'Finalizado' }, statusAtual: { code: 'FINALIZADO', label: 'Finalizado' } }), { status: 200 });
    },
  });
  assert.deepEqual(body, { subitemId: '13149530541', novoStatus: 'FINALIZADO', dryRun: false });
  const gantt = readFileSync('src/features/cronograma-obras/components/GanttGrid.tsx', 'utf8');
  const control = readFileSync('src/features/cronograma-obras/components/MondaySubitemStatusControl.tsx', 'utf8');
  assert.match(gantt, /MondaySubitemStatusControl obra=\{obra\} canStart=\{false\} canFinish/);
  assert.match(control, /'FINALIZADO'/);
  assert.match(control, /Finalizar/);
  assert.match(control, /disabled=\{saving\}/);
});

test('status control renders either the available action or the badge, never both', () => {
  const control = readFileSync('src/features/cronograma-obras/components/MondaySubitemStatusControl.tsx', 'utf8');
  assert.match(control, /if \(!realLote \|\| !action \|\| alreadyFinished\) return <StatusBadge status=\{obra\.status\} \/>;/);
  assert.match(control, /canFinish \? "finish" : canStart \? "start" : null/);
  assert.match(control, /Finalizando/);
  assert.match(control, /Iniciando/);
  const actionReturn = control.slice(control.indexOf('const verb'), control.indexOf('\n}'));
  assert.doesNotMatch(actionReturn, /<StatusBadge/);
});
