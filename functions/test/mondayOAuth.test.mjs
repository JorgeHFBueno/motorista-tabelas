import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createMondayOAuthCallbackApp, createMondayOAuthStartApp, MONDAY_OAUTH_ALLOWED_ORIGINS, MONDAY_OAUTH_REDIRECT_URI, pkceChallenge, refreshMondayAccessToken } from '../lib/mondayOAuth.js';

const listen = app => new Promise(resolve => { const server = http.createServer(app); server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })); });
const close = server => new Promise(resolve => server.close(resolve));
class Pending {
  constructor() { this.map = new Map(); }
  async save(hash, value) { this.map.set(hash, value); }
  async consume(hash, now) { const value = this.map.get(hash); this.map.delete(hash); return value && value.expiresAt > now ? value : null; }
}
class Store {
  constructor() { this.value = ''; this.writes = []; }
  async writeRotated(value) { this.value = value; this.writes.push(value); }
  async read() { return this.value; }
}
const json = response => response.json();

test('OAuth start enforces Firebase employee authorization and emits S256 URL without verifier', async () => {
  const pending = new Pending();
  const app = createMondayOAuthStartApp({ clientId: 'client-id', pending, verifyIdToken: async () => ({ uid: 'u1' }), readEmployee: async () => ({ ativo: true, perfis: { adm2: true } }), now: () => 1000 });
  const { server, url } = await listen(app);
  try {
    const response = await fetch(url, { headers: { Authorization: 'Bearer firebase-id-token' } });
    assert.equal(response.status, 200);
    const body = await json(response);
    const auth = new URL(body.authorizationUrl);
    assert.equal(auth.searchParams.get('redirect_uri'), MONDAY_OAUTH_REDIRECT_URI);
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(auth.searchParams.get('scope'), 'boards:read webhooks:read webhooks:write');
    assert.ok(!body.codeVerifier);
    assert.equal(pending.map.size, 1);
    const [hash, value] = pending.map.entries().next().value;
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(pkceChallenge(value.codeVerifier), auth.searchParams.get('code_challenge'));
  } finally { await close(server); }
});

test('OAuth start returns oauth_client_unavailable when the Client ID is absent', async () => {
  const app = createMondayOAuthStartApp({ clientId: '', pending: new Pending(), verifyIdToken: async () => ({ uid: 'u1' }), readEmployee: async () => ({ ativo: true, perfis: { adm2: true } }) });
  const { server, url } = await listen(app);
  try {
    const response = await fetch(url, { headers: { Authorization: 'Bearer firebase-id-token' } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'oauth_client_unavailable' });
  } finally { await close(server); }
});

test('OAuth start includes only the configured Client ID in a valid authorization URL', async () => {
  const app = createMondayOAuthStartApp({ clientId: 'monday-client-id', pending: new Pending(), verifyIdToken: async () => ({ uid: 'u1' }), readEmployee: async () => ({ ativo: true, perfis: { adm2: true } }) });
  const { server, url } = await listen(app);
  try {
    const response = await fetch(url, { headers: { Authorization: 'Bearer firebase-id-token' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    const authorizationUrl = new URL(body.authorizationUrl);
    assert.equal(authorizationUrl.searchParams.get('client_id'), 'monday-client-id');
    assert.ok(authorizationUrl.searchParams.get('state'));
    assert.ok(authorizationUrl.searchParams.get('code_challenge'));
    assert.equal(body.clientSecret, undefined);
    assert.equal(body.codeVerifier, undefined);
    assert.doesNotMatch(body.authorizationUrl, /client-secret|access-token|refresh-token/i);
  } finally { await close(server); }
});

test('OAuth start answers preflight only for the two production Hosting origins', async () => {
  const app = createMondayOAuthStartApp();
  const { server, url } = await listen(app);
  try {
    for (const origin of MONDAY_OAUTH_ALLOWED_ORIGINS) {
      const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization,Content-Type' } });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
      assert.match(response.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
    }
    const denied = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://malicious.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally { await close(server); }
});

test('OAuth start accepts the published UI POST method without changing the OAuth contract', async () => {
  const pending = new Pending();
  const app = createMondayOAuthStartApp({ clientId: 'client-id', pending, verifyIdToken: async () => ({ uid: 'u1' }), readEmployee: async () => ({ ativo: true, perfis: { adm2: true } }), now: () => 1000 });
  const { server, url } = await listen(app);
  try {
    const response = await fetch(url, { method: 'POST', headers: { Origin: MONDAY_OAUTH_ALLOWED_ORIGINS[0], Authorization: 'Bearer firebase-id-token', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), MONDAY_OAUTH_ALLOWED_ORIGINS[0]);
    assert.ok((await response.json()).authorizationUrl);
  } finally { await close(server); }
});

test('OAuth start rejects missing auth and non-adm2 employee', async () => {
  const app = createMondayOAuthStartApp({ verifyIdToken: async () => ({ uid: 'u1' }), readEmployee: async () => ({ ativo: true, perfis: { adm2: false } }) });
  const { server, url } = await listen(app);
  try { assert.equal((await fetch(url)).status, 401); assert.equal((await fetch(url, { headers: { Authorization: 'Bearer t' } })).status, 403); } finally { await close(server); }
});

test('OAuth callback exchanges PKCE, stores only refresh token, and never returns tokens', async () => {
  const pending = new Pending(); const store = new Store();
  await pending.save('unused', { uid: 'u1', codeVerifier: 'verifier', expiresAt: 999999, createdAt: 1, schemaVersion: 1 });
  const state = 'state-for-test';
  const crypto = await import('node:crypto');
  await pending.save(crypto.createHash('sha256').update(state).digest('hex'), { uid: 'u1', codeVerifier: 'verifier', expiresAt: 999999, createdAt: 1, schemaVersion: 1 });
  let request;
  const app = createMondayOAuthCallbackApp({ pending, tokenStore: store, clientId: 'client-id', clientSecret: () => 'client-secret', now: () => 1000, fetch: async (_url, init) => { request = JSON.parse(init.body); return new Response(JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', token_type: 'bearer', scope: 'boards:read webhooks:read webhooks:write' }), { status: 200 }); } });
  const { server, url } = await listen(app);
  try {
    const response = await fetch(`${url}?code=authorization-code&state=${encodeURIComponent(state)}`);
    const body = await response.text();
    assert.equal(response.status, 200); assert.match(body, /concluída com sucesso/); assert.doesNotMatch(body, /access-secret|refresh-secret/);
    assert.equal(request.code_verifier, 'verifier'); assert.equal(request.client_secret, 'client-secret'); assert.deepEqual(store.writes, ['refresh-secret']); assert.equal(pending.map.size, 1);
  } finally { await close(server); }
});

test('OAuth callback rejects replay, missing parameters, expiry, and client verifier', async () => {
  const pending = new Pending(); const app = createMondayOAuthCallbackApp({ pending, tokenStore: new Store(), fetch: async () => { throw new Error('must not call token endpoint'); } });
  const { server, url } = await listen(app);
  try {
    assert.equal((await fetch(url)).status, 400); assert.equal((await fetch(`${url}?code=x`)).status, 400); assert.equal((await fetch(`${url}?code=x&state=unknown&code_verifier=bad`)).status, 400);
  } finally { await close(server); }
});

test('refresh reads the current token, rotates before returning access, and fails closed on store failure', async () => {
  const store = new Store(); store.value = 'old-refresh'; let request;
  const access = await refreshMondayAccessToken({ tokenStore: store, clientId: 'client-id', clientSecret: () => 'client-secret', fetch: async (_url, init) => { request = JSON.parse(init.body); return new Response(JSON.stringify({ access_token: 'temporary-access', refresh_token: 'new-refresh' }), { status: 200 }); } });
  assert.equal(access, 'temporary-access'); assert.equal(request.grant_type, 'refresh_token'); assert.equal(request.refresh_token, 'old-refresh'); assert.deepEqual(store.writes, ['new-refresh']);
  const failingStore = { async read() { return 'old-refresh'; }, async writeRotated() { throw new Error('SECRET_MANAGER_WRITE_FAILED'); } };
  await assert.rejects(() => refreshMondayAccessToken({ tokenStore: failingStore, fetch: async () => new Response(JSON.stringify({ access_token: 'must-not-escape', refresh_token: 'new-refresh' }), { status: 200 }) }), /SECRET_MANAGER_WRITE_FAILED/);
});
