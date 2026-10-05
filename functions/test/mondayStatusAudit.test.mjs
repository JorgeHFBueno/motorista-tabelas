import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { buildDomainLabelMap, buildStatusAuditReport, createMondayStatusAuditApp } from '../lib/mondayStatusAudit.js';
import { MONDAY_API_VERSION, queryMonday } from '../lib/mondayClient.js';

const principalBoard = { id: '8515762377', name: 'Principal', columns: [{ id: 'subtasks', title: 'Subitems', type: 'subtasks', settings: { boardIds: ['9001'] } }] };
const subitemBoard = { id: '9001', name: 'Subitems', columns: [{ id: 'color_mknqcdnw', title: 'Status', type: 'status', settings: { labels: [{ id: 7, index: 0, label: 'Revisar escopo', color: 'yellow', is_done: false }, { id: 9, index: 1, label: 'Finalizado', color: 'green', is_done: true }] } }] };
const candidate = { id: '13149530541', name: 'LOTE 1', board: { id: '9001', name: 'Subitems' }, parent_item: { id: '12581501883', name: 'CARLOS GOMES 181/2026' }, column_values: [{ id: 'color_mknqcdnw', type: 'status', text: 'Revisar escopo', value: '{"index":7}', index: 0, label: 'Revisar escopo' }] };

test('domain mapping preserves stable label id separately from visual index', () => {
  const mapping = buildDomainLabelMap(subitemBoard.columns[0].settings.labels);
  assert.deepEqual(mapping.REVISAR_ESCOPO, { label: 'Revisar escopo', labelId: 7 });
  assert.notEqual(mapping.REVISAR_ESCOPO.labelId, subitemBoard.columns[0].settings.labels[0].index);
});

test('audit report is fixed to server board/column and contains no mutation surface', () => {
  const report = buildStatusAuditReport({ principalBoard, subitemBoard, candidate, subitemBoards: [{ id: '9001', name: 'Subitems' }], apiMeta: [{ requestedApiVersion: MONDAY_API_VERSION, effectiveApiVersion: '2026-07' }] });
  assert.equal(report.candidate.parentMatches, true);
  assert.equal(report.candidate.statusMatchesPersisted, true);
  assert.equal(report.futureWrite.columnId, 'color_mknqcdnw');
  assert.equal(report.futureWrite.create_labels_if_missing, false);
  assert.equal(report.safety.mutationExecuted, 0);
  assert.equal(report.safety.firestoreWrites, 0);
  assert.doesNotMatch(JSON.stringify(report), /mutation\s*\(/i);
});

test('audit route requires auth and rejects client parameters', async () => {
  const authOk = (req, _res, next) => { req.user = { uid: 'adm2' }; next(); };
  const runner = async () => ({ safety: { tokenExposed: false, mutationExecuted: 0, firestoreWrites: 0 } });
  const app = createMondayStatusAuditApp({ authMiddleware: authOk, token: () => 'secret-only-in-memory', runner });
  assert.equal((await request(app, { boardId: 'client-controlled' }, 'Bearer test')).status, 400);
  const response = await request(app, {}, 'Bearer test');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /secret-only-in-memory/);
});

test('queryMonday sends API-Version and never logs or returns the token', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let receivedHeaders;
  globalThis.fetch = async (_url, options) => { receivedHeaders = options.headers; return new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { 'API-Version': '2026-07' } }); };
  const result = await queryMonday('token-that-must-not-leak', 'query { ok }', {}, () => {});
  assert.equal(receivedHeaders['API-Version'], '2026-07');
  assert.deepEqual(result, { ok: true });
  assert.equal(JSON.stringify(result).includes('token-that-must-not-leak'), false);
});

function request(app, body, authorization) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request({ port, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } }, (res) => {
        let data = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { data += chunk; }); res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); });
      });
      req.on('error', (error) => { server.close(); reject(error); }); req.end(JSON.stringify(body));
    });
  });
}
