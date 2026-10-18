import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { filterManuscriptTree, validateManuscriptPath } from '../lib/manuscript.js';

test('manuscript tree only exposes Markdown and preserves _AUDITORIA', () => {
  const documents = filterManuscriptTree([
    { path: 'README.md', type: 'blob', sha: 'readme' },
    { path: '_AUDITORIA/check.md', type: 'blob', sha: 'audit' },
    { path: '.github/hidden.md', type: 'blob', sha: 'hidden' },
    { path: 'image.png', type: 'blob', sha: 'image' },
  ]);
  assert.deepEqual(documents.map((document) => document.path), ['_AUDITORIA/check.md', 'README.md']);
});

test('manuscript path validation rejects traversal and non-Markdown files', () => {
  assert.equal(validateManuscriptPath('01_FIRESTORE/GUIA.md'), '01_FIRESTORE/GUIA.md');
  for (const path of ['../secret.md', '/README.md', 'folder\\file.md', 'https://example.test/a.md', 'README.txt']) {
    assert.throws(() => validateManuscriptPath(path), HttpsError);
  }
});
