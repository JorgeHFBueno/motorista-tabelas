import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LOTE_STATUS_COLORS, LOTE_STATUS_FALLBACK_COLOR, LOTE_STATUS_OPTIONS, LoteStatusRequestError, loteStatusColor, loteStatusFromLabel, updateLoteStatus } from '../src/services/loteStatusService';
import { adaptObrasV2Cronograma } from '../src/features/cronograma-obras/data/source/obrasV2CronogramaAdapter';
import { sameObraExceptMasters, updateObraStatusByLoteId } from '../src/features/cronograma-obras/application/localPlanner';
import { buildStartedFlatWorkStages, groupObrasByContract } from '../src/features/cronograma-obras/domain/contractGroups';
import { separarObrasPorSituacao } from '../src/features/cronograma-obras/domain/contractStatus';
import { classificarLotePorStatus } from '../src/features/cronograma-obras/domain/contractStatus';

const contrato = (id: string, data: Record<string, unknown>) => ({ id, exists: true, data: { friday: { ok: true }, ...data } });
const lotes = (...items: Array<[id: string, nome: string, status: string]>) => Object.fromEntries(items.map(([id, nome, status], ordem) => [id, { nome, status, ordem }]));

test('LOTE without a name remains visible as Analisar Contrato', () => { const data = adaptObrasV2Cronograma([contrato('contract', { nomeObra: 'PARENT NAME', ordemInicio: 'ORDEM X', confirmacaoRecurso: 'RECURSO Y', lotes: lotes(['child', '   ', 'Revisar escopo']) })]); assert.equal(data.obras[0].nomeObra, 'Analisar Contrato'); assert.equal(data.contratos[0].ordemInicio, 'ORDEM X'); assert.equal(data.contratos[0].confirmacaoRecurso, 'RECURSO Y'); });

test('real LOTEs expose loteId while synthetic contract rows never do', () => {
  const data = adaptObrasV2Cronograma([contrato('contract', { nomeObra: 'Contrato', lotes: lotes(['13149530541', 'LOTE 1', 'Revisar escopo']) }), contrato('synthetic', { nomeObra: 'Sem LOTE', lotes: {} })]);
  assert.equal(data.obras[0].loteId, '13149530541'); assert.equal(data.obras[0].contratoId, 'contract'); assert.equal(data.obras[1].loteId, undefined); assert.equal(data.obras[1].targetType, 'contrato');
});

test('the six UI labels map only to controlled frontend codes', () => {
  assert.deepEqual(LOTE_STATUS_OPTIONS.map((item) => item.code), ['EM_ANDAMENTO', 'FINALIZADO', 'PARADA', 'PROXIMA_A_INICIAR', 'REVISAR_ESCOPO', 'NAO_INICIADA']);
  assert.equal(loteStatusFromLabel('Revisar escopo')?.code, 'REVISAR_ESCOPO'); assert.equal(loteStatusFromLabel('Livre') ?? null, null);
});

test('LOTE status colors are manually mapped and unknown labels use a neutral fallback', () => {
  assert.deepEqual(LOTE_STATUS_COLORS, { 'Finalizado': '#33D391', 'Em andamento': '#FDBC64', 'Parada': '#E8697D', 'Não iniciada': '#797E93', 'Próxima a Iniciar': '#339ECD', 'Revisar escopo': '#B57DE3' });
  assert.equal(loteStatusColor('Parada'), '#E8697D');
  assert.equal(loteStatusColor('Novo status'), LOTE_STATUS_FALLBACK_COLOR);
});

test('the request goes to fridayCadastroGravar by the obras-v2 record, with the label text', async () => {
  let received: unknown;
  const result = await updateLoteStatus('V2-DOC', '13149530541', 'PARADA', async (data) => { received = data; return { data: { ok: true, valor: 'Parada' } }; });
  assert.deepEqual(result, { code: 'PARADA', label: 'Parada' });
  assert.deepEqual(received, { op: 'valor', registro: { colecao: 'obras-v2', id: 'V2-DOC', sub: '13149530541' }, campo: 'status', texto: 'Parada' });
});

test('errors and unconfirmed answers become readable messages without retrying', async () => {
  let calls = 0;
  await assert.rejects(() => updateLoteStatus('V', 'L', 'PARADA', async () => { calls++; throw Object.assign(new Error('Acesso não autorizado.'), { code: 'functions/permission-denied' }); }),
    (error: unknown) => error instanceof LoteStatusRequestError && /não possui permissão/.test(error.message));
  await assert.rejects(() => updateLoteStatus('V', 'L', 'PARADA', async () => { calls++; throw Object.assign(new Error('Este registro não está ligado a um item do Friday.'), { code: 'functions/failed-precondition' }); }),
    (error: unknown) => error instanceof LoteStatusRequestError && /não está ligado a um item do Friday/.test(error.message));
  await assert.rejects(() => updateLoteStatus('V', 'L', 'PARADA', async () => { calls++; return { data: { ok: true } }; }),
    (error: unknown) => error instanceof LoteStatusRequestError && /não confirmou/.test(error.message));
  assert.equal(calls, 3);
});

test('confirmed status updates the canonical LOTEs by contract and LOTE key and rederives sections and counters', () => {
  const obras = adaptObrasV2Cronograma([contrato('c1', { nomeObra: 'Contrato', lotes: lotes(['a', 'LOTE A', 'Não iniciada'], ['b', 'LOTE B', 'Parada']) }), contrato('c2', { nomeObra: 'Outro', lotes: lotes(['a', 'LOTE A de outro contrato', 'Não iniciada']) })]).obras;
  const updated = updateObraStatusByLoteId(obras, 'c1', 'a', 'Em andamento');
  const sections = separarObrasPorSituacao(updated);
  assert.deepEqual(sections['nao-iniciada'].map((obra) => [obra.contratoId, obra.loteId]), [['c2', 'a']]);
  assert.deepEqual(sections.iniciada.map((obra) => obra.loteId), ['a', 'b']);
  assert.equal(new Set(sections.iniciada.map((obra) => obra.contratoId)).size, 1);
  assert.equal(updated.find((obra) => obra.contratoId === 'c1' && obra.loteId === 'a')?.status, 'Em andamento');
});

test('same-category confirmation and pre-confirmation failure leave grouping intact', () => {
  const obras = adaptObrasV2Cronograma([contrato('c1', { nomeObra: 'Contrato', lotes: lotes(['a', 'LOTE A', 'Em andamento']) })]).obras;
  const unchanged = separarObrasPorSituacao(obras);
  const confirmed = separarObrasPorSituacao(updateObraStatusByLoteId(obras, 'c1', 'a', 'Parada'));
  assert.deepEqual(confirmed.iniciada.map((obra) => obra.id), unchanged.iniciada.map((obra) => obra.id));
  assert.deepEqual(separarObrasPorSituacao(obras), unchanged);
});

test('start action follows section classification, never a specific label', () => {
  assert.equal(classificarLotePorStatus('Não iniciada'), 'nao-iniciada');
  assert.equal(classificarLotePorStatus('Revisar escopo'), 'nao-iniciada');
  assert.equal(classificarLotePorStatus('Próxima a Iniciar'), 'iniciada');
  assert.equal(classificarLotePorStatus('Outro status'), 'nao-iniciada');
  const table = readFileSync('src/features/cronograma-obras/components/ContractTextTable.tsx', 'utf8');
  const control = readFileSync('src/features/cronograma-obras/components/LoteStatusControl.tsx', 'utf8');
  assert.match(table, /canStart=\{notStarted\}/);
  assert.match(control, /canStart: boolean/);
  assert.doesNotMatch(control, /status\.normalize|status ===|status ==/);
});

test('UI integration writes only through the Friday Function and keeps the accessible menu', () => {
  const service = readFileSync('src/services/loteStatusService.ts', 'utf8'); const control = readFileSync('src/features/cronograma-obras/components/LoteStatusControl.tsx', 'utf8'); const styles = readFileSync('src/features/cronograma-obras/styles/cronograma-obras.css', 'utf8'); const page = readFileSync('src/features/cronograma-obras/CronogramaObrasPage.tsx', 'utf8');
  assert.match(service, /'fridayCadastroGravar'/); assert.match(service, /colecao: 'obras-v2'/); assert.doesNotMatch(service, /monday|setDoc|updateDoc|fetch\(/iu);
  assert.match(control, /disabled=\{saving\}/); assert.match(control, /'EM_ANDAMENTO'/); assert.match(control, /Iniciar/); assert.doesNotMatch(control, /<select/); assert.match(control, /LOTE_STATUS_OPTIONS/); assert.match(control, /aria-haspopup="listbox"/); assert.match(control, /role="listbox"/); assert.match(control, /role="option"/); assert.match(control, /loteStatusColor/); assert.match(control, /onOptionKeyDown/); assert.match(control, /event\.key === 'Escape'/); assert.match(control, /closeOnOutsidePointer/); assert.match(control, /statusTriggerRef/); assert.match(control, /statusMenuRef/); assert.match(control, /createPortal\(/); assert.match(control, /document\.body/); assert.match(styles, /\.co-monday-status-list[^}]*position: fixed/); assert.match(control, /void saveStatus\(status\.code\)/); assert.doesNotMatch(control, /setDoc|updateDoc|mondaySubitem|mondayStatus|Monday\./); // classes co-monday-status-* são só estilo
  assert.match(control, /onStatusConfirmed\?\.\(obra\.contratoId!, obra\.loteId!, gravado\)/);
  assert.match(page, /applyConfirmedLoteStatus/); assert.match(page, /updateObraStatusByLoteId/); assert.match(page, /onStatusConfirmed=\{applyConfirmedLoteStatus\}/);
  assert.match(page, /V-1\.665 · MK6A/); assert.doesNotMatch(page, /Planejador local · MK2/);
  assert.doesNotMatch(page, /onday/);
});

test('started work finalization reuses the same Function call and shared control', async () => {
  let body: unknown;
  await updateLoteStatus('V2-DOC', '13149530541', 'FINALIZADO', async (data) => { body = data; return { data: { ok: true, valor: 'Finalizado' } }; });
  assert.deepEqual(body, { op: 'valor', registro: { colecao: 'obras-v2', id: 'V2-DOC', sub: '13149530541' }, campo: 'status', texto: 'Finalizado' });
  const gantt = readFileSync('src/features/cronograma-obras/components/GanttGrid.tsx', 'utf8');
  const control = readFileSync('src/features/cronograma-obras/components/LoteStatusControl.tsx', 'utf8');
  assert.match(gantt, /LoteStatusControl obra=\{obra\} canStart=\{false\} canFinish/);
  assert.match(control, /'FINALIZADO'/);
  assert.match(control, /Finalizar/);
  assert.match(control, /disabled=\{saving\}/);
});

test('status control renders either the available action or the badge, never both', () => {
  const control = readFileSync('src/features/cronograma-obras/components/LoteStatusControl.tsx', 'utf8');
  assert.match(control, /if \(!realLote \|\| !action \|\| alreadyFinished\) return <StatusBadge status=\{obra\.status\} \/>;/);
  assert.match(control, /canFinish \? "finish" : canStart \? "start" : null/);
  assert.match(control, /Finalizando/);
  assert.match(control, /Iniciando/);
  const actionReturn = control.slice(control.indexOf('const verb'), control.indexOf('\n}'));
  assert.doesNotMatch(actionReturn, /<StatusBadge/);
});

test('Obra iniciada inclui Próxima a Iniciar; a lista corrida a separa por divisória e mantém Públicas/Privadas', () => {
  const lote = (id: string, contratoId: string, status: string) => ({ id, targetType: 'obra' as const, loteId: id, sourceRow: 0, contratoId, contratoNome: contratoId, codObra: id, siglaObra: 'LOTE', nomeObra: id, local: id, status, empresa: 'LEDUR', mestreInicial: null, descricao: null, inicioPlanejado: null, tempoPlanejado: null, mestresPlanejados: [] });
  const obras = [lote('prox-priv', 'c3', 'Próxima a Iniciar'), lote('and-pub', 'c1', 'Em andamento'), lote('prox-pub', 'c2', 'Próxima a Iniciar'), lote('parada', 'c1', 'Parada')];
  assert.deepEqual(separarObrasPorSituacao(obras).iniciada.map((obra) => obra.id), ['prox-priv', 'and-pub', 'prox-pub', 'parada']);
  const contratos = new Map([['c1', { numeroContrato: '1', tipoObra: 'Pública' }], ['c2', { numeroContrato: '2', tipoObra: 'Pública' }], ['c3', { numeroContrato: '3', tipoObra: 'Privada' }]]) as never;
  assert.deepEqual(buildStartedFlatWorkStages(obras, contratos).map((stage) => [stage.kind, stage.label, stage.workTypes.map((group) => [group.kind, group.obras.map((obra) => obra.id)])]), [
    ['iniciada', null, [['publica', ['and-pub', 'parada']]]],
    ['proxima-a-iniciar', 'PRÓXIMA A INICIAR', [['publica', ['prox-pub']], ['privada', ['prox-priv']]]],
  ]);
  assert.deepEqual(buildStartedFlatWorkStages(obras.filter((obra) => obra.status !== 'Próxima a Iniciar'), contratos).map((stage) => stage.label), [null]);
  // The contracts view has no stage division: it keeps every contract in source order.
  assert.deepEqual(groupObrasByContract(obras).map((group) => group.id), ['c3', 'c1', 'c2']);
});

test('realtime rehydration reuses a LOTE only when its obras-v2 data did not change', () => {
  const [obra] = adaptObrasV2Cronograma([contrato('contract', { nomeObra: 'Contrato', lotes: lotes(['1', 'LOTE 1', 'Em andamento']) })]).obras;
  const hydrated = { ...obra, mestresPlanejados: [{ localId: 'a', nome: 'DILAMAR', inicio: '2026-10-05', tempoPlanejado: 7 }] };
  assert.equal(sameObraExceptMasters(hydrated, obra), true);
  assert.equal(sameObraExceptMasters(hydrated, { ...obra, nomeObra: 'LOTE RENOMEADO', local: 'LOTE RENOMEADO' }), false);
  assert.equal(sameObraExceptMasters(hydrated, { ...obra, status: 'Finalizado' }), false);
  assert.equal(sameObraExceptMasters(hydrated, { ...obra, contratoNome: 'Contrato renomeado' }), false);
  assert.equal(sameObraExceptMasters(hydrated, { ...obra, inicioPlanejado: '2026-11-01' }), false);
});
