import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpsError } from 'firebase-functions/v2/https';
import { extractMarkdownLinks, filterManuscriptTree, resolveManuscriptLink, validateManuscriptPath } from '../lib/manuscript.js';

test('manuscript tree only exposes Markdown and preserves _AUDITORIA', () => {
  const documents = filterManuscriptTree([
    { path: 'README.md', type: 'blob', sha: 'readme' },
    { path: '_AUDITORIA/check.md', type: 'blob', sha: 'audit' },
    { path: '.github/hidden.md', type: 'blob', sha: 'hidden' },
    { path: 'image.png', type: 'blob', sha: 'image' },
  ]);
  assert.deepEqual(documents.map((document) => document.path), ['_AUDITORIA/check.md', 'README.md']);
});

test('Markdown link resolution supports relatives, anchors and rejects unsafe or external paths', () => {
  assert.deepEqual(resolveManuscriptLink('03_APLICACAO_WEB/README.md', '../01_FIRESTORE/03_COMBUSTIVEL.md#schema'), { path: '01_FIRESTORE/03_COMBUSTIVEL.md', anchor: 'schema' });
  assert.deepEqual(resolveManuscriptLink('README.md', './01_FIRESTORE/GUIA.md'), { path: '01_FIRESTORE/GUIA.md' });
  assert.equal(resolveManuscriptLink('README.md', 'https://example.test/a.md'), null);
  assert.equal(resolveManuscriptLink('README.md', '../../secret.md'), null);
  assert.deepEqual(extractMarkdownLinks('Veja [guia](./GUIA.md) e [site](https://example.test).').map((link) => link.href), ['./GUIA.md', 'https://example.test']);
});

test('manuscript path validation rejects traversal and non-Markdown files', () => {
  assert.equal(validateManuscriptPath('01_FIRESTORE/GUIA.md'), '01_FIRESTORE/GUIA.md');
  for (const path of ['../secret.md', '/README.md', 'folder\\file.md', 'https://example.test/a.md', 'README.txt']) {
    assert.throws(() => validateManuscriptPath(path), HttpsError);
  }
});
