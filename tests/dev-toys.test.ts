import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAVE_BOOT_VISTO, deveMostrarBoot, linhasBoot } from '../src/features/dev-toys/boot';

const sessao = (valores: Record<string, string>) => ({ getItem: (k: string) => valores[k] ?? null });

test('boot do /dev: uma vez por sessão, ou sempre pela preferência', () => {
  assert.equal(deveMostrarBoot(false, sessao({})), true);
  assert.equal(deveMostrarBoot(false, sessao({ [CHAVE_BOOT_VISTO]: '1' })), false);
  assert.equal(deveMostrarBoot(true, sessao({ [CHAVE_BOOT_VISTO]: '1' })), true);
  assert.equal(deveMostrarBoot(false, null), true, 'sem sessionStorage, mostra');
  assert.equal(deveMostrarBoot(false, { getItem: () => { throw new Error('bloqueado'); } }), true);
});

test('boot do /dev: texto sem acento, com build, rede e PWA, e nada além disso', () => {
  const linhas = linhasBoot({ modo: 'production', online: false, serviceWorker: true });
  assert.ok(linhas.includes('BUILD .............. PRODUCTION'));
  assert.ok(linhas.includes('NETWORK ............ OFFLINE'));
  assert.ok(linhas.includes('PWA ................ SERVICE WORKER OK'));
  assert.ok(linhasBoot({ modo: 'dev', online: true, serviceWorker: false }).includes('PWA ................ SEM SERVICE WORKER'));
  // A Monaco não tem acentos nem reticências.
  for (const linha of linhas) assert.match(linha, /^[\x20-\x7E]*$/, linha);
  assert.doesNotMatch(linhas.join('\n'), /@|uid/i);
});
