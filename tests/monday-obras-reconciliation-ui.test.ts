import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

test('engenharia obras route and navigation stay separate from cronograma', () => {
  const app = source('src/App.tsx');
  const header = source('src/components/Header.tsx');
  assert.match(app, /path="engenharia\/obras" element=\{<EngenhariaObrasPage \/>\}/);
  assert.match(app, /path="engenharia\/cronograma" element=\{<CronogramaObrasPage \/>\}/);
  assert.match(header, /to="\/engenharia\/obras"/);
});

test('reconciliation UI has client-side searches, filters, selection and safe confirmation', () => {
  const page = source('src/pages/EngenhariaObrasPage.tsx');
  assert.match(page, /\[row\.nome, row\.numeroContrato, row\.documentId\]/);
  assert.match(page, /\[row\.nomeObra, row\.siglaObra, row\.codObra, row\.documentId\]/);
  assert.match(page, /<Tab value="Pendentes"/);
  assert.match(page, /<Tab value="Vinculados"/);
  assert.match(page, /setSelectedMonday\(row\)/);
  assert.match(page, /setSelectedObra\(row\)/);
  assert.match(page, /Confirmar vínculo/);
  assert.match(page, /disabled=\{!canLink \|\| saving\}/);
  assert.match(page, /await refresh\(\)/);
  assert.match(page, /setMonday\(\(current\)/);
});

test('frontend uses the authenticated backend instead of a Firestore write', () => {
  const service = source('src/services/mondayObrasReconciliation.ts');
  assert.match(service, /Authorization: `Bearer \$\{await user\.getIdToken\(\)\}`/);
  assert.match(service, /fetch\(/);
  assert.doesNotMatch(service, /updateDoc|setDoc|runTransaction/);
});
