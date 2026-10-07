import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MONDAY_OAUTH_START_ENDPOINT, MondayOAuthStartError, startMondayOAuth } from '../src/services/mondayOAuth';

const page = readFileSync('src/features/cronograma-obras/CronogramaObrasPage.tsx', 'utf8');
const fakeUser = { getIdToken: async () => 'firebase-id-token' } as any;

test('button is visible only through the existing adm2 authorization gate', () => {
  assert.match(page, /useAdm2Authorization/);
  assert.match(page, /\{canSyncMonday && \([\s\S]*className="co-dev-menu" hidden/);
  assert.match(page, /Autorizar Monday/);
  assert.match(page, /runViewTransition\(next, view, \(\) => setView\(next\)\)/);
});

test('OAuth start sends the Firebase ID token to the exact endpoint with an empty body', async () => {
  let received: { url?: string; options?: RequestInit } = {};
  await startMondayOAuth({ currentUser: fakeUser, fetch: async (url, options) => { received = { url: String(url), options }; return new Response(JSON.stringify({ authorizationUrl: 'https://auth.monday.com/oauth' }), { status: 200 }); }, assign: () => undefined });
  const headers = received.options?.headers as Record<string, string>;
  assert.equal(received.url, MONDAY_OAUTH_START_ENDPOINT);
  assert.equal(headers.Authorization, 'Bearer firebase-id-token');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(received.options?.method, 'POST');
  assert.deepEqual(JSON.parse(String(received.options?.body)), {});
});

test('missing authorizationUrl is a safe user-facing error', async () => {
  await assert.rejects(() => startMondayOAuth({ currentUser: fakeUser, fetch: async () => new Response('{}', { status: 200 }), assign: () => undefined }), (error: unknown) => error instanceof MondayOAuthStartError && error.message === 'Não foi possível iniciar a autorização do Monday.');
});

test('success navigates the current window and does not send client-side OAuth parameters', async () => {
  let assigned = '';
  let body = '';
  await startMondayOAuth({ currentUser: fakeUser, fetch: async (_url, options) => { body = String(options?.body); return new Response(JSON.stringify({ authorizationUrl: 'https://auth.monday.com/oauth' }), { status: 200 }); }, assign: (url) => { assigned = url; } });
  assert.equal(assigned, 'https://auth.monday.com/oauth');
  assert.doesNotMatch(body, /uid|secret|scope|redirect|code_challenge|state/i);
  assert.doesNotMatch(page, /client.?secret|signing.?secret|refresh.?token|access.?token|scope|redirect_uri|code_challenge/i);
});

test('loading state prevents duplicate clicks and errors restore the action', () => {
  assert.match(page, /if \(authorizingMonday\) return/);
  assert.match(page, /disabled=\{authorizingMonday\}/);
  assert.match(page, /Preparando autorização…/);
  assert.match(page, /setAuthorizingMonday\(false\)/);
});
