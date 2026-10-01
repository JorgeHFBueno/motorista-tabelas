import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const page = readFileSync(resolve(root, 'src/features/cronograma-obras/CronogramaObrasPage.tsx'), 'utf8');
const service = readFileSync(resolve(root, 'src/services/mondaySync.ts'), 'utf8');
const firebaseConfig = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8')) as { hosting?: { rewrites?: Array<{ source?: string; function?: string; destination?: string }> } };

test('Monday sync button follows the existing adm2 UI authorization contract', () => {
  assert.match(page, /useAdm2Authorization/); assert.match(page, /const \{ authorized: canSyncMonday \} = useAdm2Authorization\(\)/); assert.match(page, /\{canSyncMonday && <button[\s\S]*?Sincronizar Monday/);
});

test('modal flow starts dry-run, blocks duplicate input, exposes summary and expandable details', () => {
  assert.match(page, /runSync\('dry-run'\)/); assert.match(page, /disabled=\{syncing\}/); assert.match(page, /Consultando Monday…/);
  for (const label of ['Novos contratos:', 'Alterados:', 'Sem alteração:', 'Novos lotes:', 'Lotes alterados:', 'Ausentes no Monday:', 'Obras a finalizar:']) assert.match(page, new RegExp(label));
  assert.match(page, /<details><summary>Ver detalhes/); assert.match(page, /setSyncResult\(null\); setSyncError\(null\)/);
});

test('the sync result contract exposes finalization counters so already-finalized works are not presented as pending', () => {
  assert.match(service, /obrasFinalizadasMonday/); assert.match(service, /obrasComObraV2Id/); assert.match(service, /obrasJaFinalizadas/); assert.match(page, /Obras a finalizar: \{syncResult\.obrasFinalizar\}/);
});

test('apply requires confirmation, cannot proceed from a dry-run error, and reloads cronograma on success', () => {
  assert.match(page, /syncResult\?\.mode === 'dry-run' && !syncResult\.erros\.length/); assert.match(page, /window\.confirm\('Aplicar a sincronização recalculada pelo servidor\?'/); assert.match(page, /runSync\('apply'\)/); assert.match(page, /const cronograma = await source\.carregar\(\)/);
});

test('backend errors are rendered safely and the browser client never contains a Monday token', () => {
  assert.match(page, /syncError \? <p role="alert">\{syncError\}<\/p>/); assert.match(service, /Authorization: `Bearer \$\{token\}`/); assert.doesNotMatch(service, /MONDAY_API_TOKEN|api\.monday\.com/); assert.doesNotMatch(page, /MONDAY_API_TOKEN/);
});

test('Hosting keeps the exact Monday rewrite ahead of the broad API rewrite', () => {
  const rewrites = firebaseConfig.hosting?.rewrites ?? [];
  const mondayIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/monday-sync' && rewrite.function === 'mondaySync');
  const broadApiIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/**');
  assert.notEqual(mondayIndex, -1);
  assert.ok(broadApiIndex === -1 || mondayIndex < broadApiIndex);
});
