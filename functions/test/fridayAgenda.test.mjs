import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  candidatosDoItem, cifrar, configAgenda, decifrar, desafioPkce, emailDoIdToken, eventoDoItem, eventoId, grupoMudouParaAgenda,
  hashState, intervalo, itemMudouParaAgenda, origemPermitida, planejarItem, quadroMudouParaAgenda,
} from '../lib/fridayAgendaDominio.js';
import { criarAplicador, criarGoogle, criarRetorno, criarServicoAgenda, REDIRECT_URI } from '../lib/fridayAgenda.js';

const FRIDAY = { ativo: true, areas: { friday: 'editar' } };
const SEM_FRIDAY = { ativo: true, areas: { logistica: 'editar' } };
const ADM2 = { ativo: true, perfis: { adm2: true } };
const SEGREDOS = { clientId: 'cliente-id', clientSecret: 'cliente-segredo', chave: 'chave-de-teste' };

const QUADRO = { id: 7, nome: 'Obras', config: { agenda: { coluna_pessoa: 2, coluna_data: 3 } } };
const COLUNAS = [{ id: 2, tipo: 'pessoa' }, { id: 3, tipo: 'periodo' }, { id: 4, tipo: 'pessoa' }, { id: 5, tipo: 'data' }];
const ITEM = { id: 99, quadro_id: 7, grupo_id: 1, nome: 'Entrega', pessoas: ['ana', 'bia'], valores: { 2: ['ana'], 3: { inicio: '2026-11-20', fim: '2026-11-22' }, 4: ['bia'] } };
const contas = (...uids) => new Map(uids.map(uid => [uid, { uid, origem: 'https://app-motor-api.web.app' }]));
const funcs = (mapa) => new Map(Object.entries(mapa));

test('id do evento: fixo por item e só com 0-9 e a-v', () => {
  assert.equal(eventoId(123), 'ledurfd123');
  assert.equal(eventoId('123'), 'ledurfd123');
  for (const id of [eventoId(1), eventoId('abc-XYZ'), eventoId('Á')]) assert.match(id, /^[a-v0-9]{5,1024}$/);
});

test('dias: Data, Período, uma ponta só, invertido e data inválida', () => {
  assert.deepEqual(intervalo('2026-11-20', 'data'), { inicio: '2026-11-20', fim: '2026-11-20' });
  assert.deepEqual(intervalo({ inicio: '2026-11-20', fim: '2026-11-22' }, 'periodo'), { inicio: '2026-11-20', fim: '2026-11-22' });
  assert.deepEqual(intervalo({ fim: '2026-11-22' }, 'periodo'), { inicio: '2026-11-22', fim: '2026-11-22' });
  assert.deepEqual(intervalo({ inicio: '2026-11-25', fim: '2026-11-22' }, 'periodo'), { inicio: '2026-11-22', fim: '2026-11-25' });
  assert.equal(intervalo('2026-02-30', 'data'), null);
  assert.equal(intervalo('', 'data'), null);
  assert.equal(intervalo('2026-11-20', 'texto'), null);
  assert.equal(intervalo({}, 'periodo'), null);
});

test('evento de dia inteiro: fim exclusivo no dia seguinte, link para o item, não marca ocupado', () => {
  const e = eventoDoItem(ITEM, QUADRO, { inicio: '2026-12-30', fim: '2026-12-31' }, 'https://app-motor-api.web.app');
  assert.deepEqual(e.start, { date: '2026-12-30' });
  assert.deepEqual(e.end, { date: '2027-01-01' });
  assert.equal(e.summary, 'Entrega');
  assert.equal(e.transparency, 'transparent');
  assert.equal(e.source.url, 'https://app-motor-api.web.app/friday/quadros/7?item=99');
  assert.match(e.description, /Quadro: Obras/);
  assert.equal(eventoDoItem({ ...ITEM, nome: '  ' }, QUADRO, { inicio: '2026-01-01', fim: '2026-01-01' }, 'x').summary, '(sem nome)');
});

test('origem da volta: site, prévias e servidor local; o resto não', () => {
  for (const o of ['https://app-motor-api.web.app', 'https://app-motor-api.firebaseapp.com', 'https://app-motor-api--pr12-abc.web.app', 'http://localhost:5173']) assert.equal(origemPermitida(o), o);
  for (const o of ['https://evil.web.app', 'https://app-motor-api.web.app.evil.com', 'http://app-motor-api.web.app', 'javascript:alert(1)', 42, null]) assert.equal(origemPermitida(o), null);
});

test('configuração do quadro: as duas colunas, numéricas', () => {
  assert.deepEqual(configAgenda(QUADRO), { coluna_pessoa: 2, coluna_data: 3 });
  assert.equal(configAgenda({ config: { agenda: { coluna_pessoa: 2 } } }), null);
  assert.equal(configAgenda({ config: {} }), null);
  assert.equal(configAgenda(null), null);
});

test('candidatos: índice pessoas e listas de UIDs dos valores, antes e depois', () => {
  assert.deepEqual([...candidatosDoItem({ pessoas: ['a'], valores: { 1: ['b'], 2: 'texto', 3: { inicio: 'x' } } }, null, { valores: { 9: ['c'] } })].sort(), ['a', 'b', 'c']);
});

test('plano: grava para quem está na coluna da agenda e remove dos outros conectados', () => {
  const plano = planejarItem({ item: ITEM, candidatos: candidatosDoItem(ITEM), quadro: QUADRO, grupo: {}, colunas: COLUNAS, contas: contas('ana', 'bia'), funcionarios: funcs({ ana: FRIDAY, bia: FRIDAY }) });
  assert.deepEqual(plano.gravar.map(g => g.uid), ['ana']);
  assert.deepEqual(plano.gravar[0].evento.end, { date: '2026-11-23' });
  assert.deepEqual(plano.remover, ['bia']);
});

test('plano: só contas conectadas entram', () => {
  const plano = planejarItem({ item: ITEM, candidatos: candidatosDoItem(ITEM), quadro: QUADRO, grupo: {}, colunas: COLUNAS, contas: contas('bia'), funcionarios: funcs({ bia: FRIDAY }) });
  assert.deepEqual(plano, { gravar: [], remover: ['bia'] });
});

test('plano: evento sai quando o item, grupo ou quadro some, sem data, sem configuração, subitem ou coluna trocada de tipo', () => {
  const base = { item: ITEM, candidatos: new Set(['ana']), quadro: QUADRO, grupo: {}, colunas: COLUNAS, contas: contas('ana'), funcionarios: funcs({ ana: FRIDAY }) };
  const casos = {
    apagado: { item: null },
    arquivado: { item: { ...ITEM, arquivado_em: 'x' } },
    lixeira: { item: { ...ITEM, excluido_em: 'x' } },
    grupo: { grupo: { arquivado_em: 'x' } },
    quadroLixeira: { quadro: { ...QUADRO, excluido_em: 'x' } },
    semData: { item: { ...ITEM, valores: { 2: ['ana'] } } },
    semConfig: { quadro: { ...QUADRO, config: {} } },
    subitem: { item: { ...ITEM, item_pai_id: 5 } },
    tipoTrocado: { colunas: [{ id: 2, tipo: 'pessoa' }, { id: 3, tipo: 'texto' }] },
    semFriday: { funcionarios: funcs({ ana: SEM_FRIDAY }) },
    restrito: { quadro: { ...QUADRO, restrito: 1, acesso: ['bia'] } },
  };
  for (const [nome, troca] of Object.entries(casos)) {
    assert.deepEqual(planejarItem({ ...base, ...troca }), { gravar: [], remover: ['ana'] }, nome);
  }
  assert.equal(planejarItem({ ...base, quadro: { ...QUADRO, restrito: 1, acesso: ['ana'] } }).gravar.length, 1);
  assert.equal(planejarItem({ ...base, quadro: { ...QUADRO, restrito: 1, acesso: [] }, funcionarios: funcs({ ana: ADM2 }) }).gravar.length, 1);
});

test('mudanças que importam para a agenda', () => {
  const cfg = configAgenda(QUADRO);
  assert.equal(itemMudouParaAgenda(ITEM, { ...ITEM, atualizado_em: 'agora', busca: [] }, cfg), false);
  assert.equal(itemMudouParaAgenda(ITEM, { ...ITEM, valores: { ...ITEM.valores, 4: ['caio'] } }, cfg), false);
  assert.equal(itemMudouParaAgenda(ITEM, { ...ITEM, valores: { ...ITEM.valores, 2: ['caio'] } }, cfg), true);
  assert.equal(itemMudouParaAgenda(ITEM, { ...ITEM, nome: 'Outro' }, cfg), true);
  assert.equal(itemMudouParaAgenda(ITEM, { ...ITEM, excluido_em: 'x' }, cfg), true);
  assert.equal(itemMudouParaAgenda(ITEM, null, cfg), true);
  assert.equal(quadroMudouParaAgenda(QUADRO, { ...QUADRO, config: { ...QUADRO.config, largura_nome: 300 } }), false);
  assert.equal(quadroMudouParaAgenda(QUADRO, { ...QUADRO, config: {} }), true);
  assert.equal(quadroMudouParaAgenda(QUADRO, { ...QUADRO, acesso: ['x'] }), true);
  assert.equal(grupoMudouParaAgenda({ nome: 'a' }, { nome: 'b' }), false);
  assert.equal(grupoMudouParaAgenda({}, { arquivado_em: 'x' }), true);
});

test('autorização guardada cifrada; outra chave não abre', () => {
  const c = cifrar('1//refresh', 'k1');
  assert.notEqual(c, cifrar('1//refresh', 'k1'));
  assert.equal(decifrar(c, 'k1'), '1//refresh');
  assert.throws(() => decifrar(c, 'k2'));
});

test('e-mail do id_token', () => {
  const tok = `x.${Buffer.from(JSON.stringify({ email: 'ana@gmail.com' })).toString('base64url')}.y`;
  assert.equal(emailDoIdToken(tok), 'ana@gmail.com');
  assert.equal(emailDoIdToken('quebrado'), null);
});

// ---------------------------------------------------------------- serviço, volta e aplicador com Google e Firestore falsos
function storeFalso(funcionarios = { ana: FRIDAY }) {
  const pendentes = new Map(); const contasMap = new Map();
  return {
    pendentes, contas: contasMap,
    async funcionario(uid) { return funcionarios[uid]; },
    async salvarPendente(h, p) { pendentes.set(h, p); },
    async consumirPendente(h, agora) { const p = pendentes.get(h); pendentes.delete(h); return p && p.expira_em > agora ? p : null; },
    async conta(uid) { return contasMap.get(uid); },
    async gravarConta(uid, d) { contasMap.set(uid, d); },
    async atualizarConta(uid, d) { contasMap.set(uid, { ...contasMap.get(uid), ...d }); },
    async apagarConta(uid) { contasMap.delete(uid); },
  };
}

function fetchFalso(respostas) {
  const chamadas = [];
  const f = async (url, init = {}) => {
    const chamada = { url: String(url), metodo: init.method ?? 'GET', corpo: init.body };
    chamadas.push(chamada);
    const r = respostas(chamada) ?? { status: 200, json: {} };
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.json ?? {} };
  };
  return { f, chamadas };
}

const ID_TOKEN = `x.${Buffer.from(JSON.stringify({ email: 'ana@gmail.com' })).toString('base64url')}.y`;
const TOKEN_OK = { status: 200, json: { access_token: 'acesso', refresh_token: 'refresh-1', scope: 'openid https://www.googleapis.com/auth/calendar.app.created email', id_token: ID_TOKEN } };

test('conectar: endereço do Google com PKCE, offline e escopo da agenda; pede a área friday', async () => {
  const store = storeFalso({ ana: FRIDAY, bia: SEM_FRIDAY });
  const servico = criarServicoAgenda({ store, google: criarGoogle(() => SEGREDOS, fetchFalso(() => null).f), segredos: () => SEGREDOS, agora: () => 1000 });
  const { url } = await servico('ana', { acao: 'conectar', origem: 'http://localhost:5173' });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('client_id'), 'cliente-id');
  assert.equal(u.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /calendar\.app\.created/);
  const pendente = store.pendentes.get(hashState(u.searchParams.get('state')));
  assert.equal(pendente.uid, 'ana');
  assert.equal(pendente.origem, 'http://localhost:5173');
  assert.equal(desafioPkce(pendente.verificador), u.searchParams.get('code_challenge'));
  await assert.rejects(servico('bia', { acao: 'conectar' }), /Acesso não autorizado/);
  await assert.rejects(servico(undefined, { acao: 'status' }), /Autenticação/);
  assert.deepEqual(await servico('bia', { acao: 'status' }), { conectado: false });
});

test('volta do Google: cria a agenda Friday, guarda a autorização cifrada e pede a carga inicial', async () => {
  const store = storeFalso();
  const { f, chamadas } = fetchFalso(c => (c.url.endsWith('/token') ? TOKEN_OK : c.url.endsWith('/calendars') ? { status: 200, json: { id: 'cal-1@group' } } : null));
  const deps = { store, google: criarGoogle(() => SEGREDOS, f), segredos: () => SEGREDOS, agora: () => 1000 };
  const { url } = await criarServicoAgenda(deps)('ana', { acao: 'conectar', origem: 'https://app-motor-api.web.app' });
  const state = new URL(url).searchParams.get('state');
  assert.equal(await criarRetorno(deps)({ state, code: 'codigo' }), 'https://app-motor-api.web.app/perfil?agenda=conectada');
  const troca = new URLSearchParams(chamadas[0].corpo);
  assert.equal(troca.get('code'), 'codigo');
  assert.equal(troca.get('client_secret'), 'cliente-segredo');
  assert.ok(troca.get('code_verifier'));
  const conta = store.contas.get('ana');
  assert.equal(conta.calendario_id, 'cal-1@group');
  assert.equal(conta.email, 'ana@gmail.com');
  assert.equal(conta.sincronizar, true);
  assert.notEqual(conta.token, 'refresh-1');
  assert.equal(decifrar(conta.token, 'chave-de-teste'), 'refresh-1');
  // O state só vale uma vez.
  assert.equal(await criarRetorno(deps)({ state, code: 'codigo' }), 'https://app-motor-api.web.app/perfil?agenda=erro');
  const status = await criarServicoAgenda(deps)('ana', { acao: 'status' });
  assert.deepEqual({ ...status, conectado_em: undefined }, { conectado: true, email: 'ana@gmail.com', erro: null, sincronizando: true, conectado_em: undefined });
});

test('volta do Google: reconectar reaproveita a agenda; sem permissão da agenda, cancelado e state vencido', async () => {
  const store = storeFalso();
  store.contas.set('ana', { calendario_id: 'cal-antiga', token: 'x' });
  let token = TOKEN_OK;
  const { f, chamadas } = fetchFalso(c => (c.url.endsWith('/token') ? token : null));
  let agora = 1000;
  const deps = { store, google: criarGoogle(() => SEGREDOS, f), segredos: () => SEGREDOS, agora: () => agora };
  const conectar = async () => new URL((await criarServicoAgenda(deps)('ana', { acao: 'conectar' })).url).searchParams.get('state');

  assert.equal(await criarRetorno(deps)({ state: await conectar(), code: 'c' }), 'https://app-motor-api.web.app/perfil?agenda=conectada');
  assert.equal(store.contas.get('ana').calendario_id, 'cal-antiga');
  assert.ok(!chamadas.some(c => c.metodo === 'POST' && c.url.endsWith('/calendars')));

  token = { status: 200, json: { ...TOKEN_OK.json, scope: 'openid email' } };
  assert.equal(await criarRetorno(deps)({ state: await conectar(), code: 'c' }), 'https://app-motor-api.web.app/perfil?agenda=sem-permissao');
  assert.ok(chamadas.at(-1).url.endsWith('/revoke'));

  assert.equal(await criarRetorno(deps)({ state: await conectar(), error: 'access_denied' }), 'https://app-motor-api.web.app/perfil?agenda=cancelada');

  const vencido = await conectar();
  agora += 11 * 60 * 1000;
  assert.equal(await criarRetorno(deps)({ state: vencido, code: 'c' }), 'https://app-motor-api.web.app/perfil?agenda=erro');
});

test('desconectar: apaga a agenda Friday, revoga e apaga a conta', async () => {
  const store = storeFalso();
  store.contas.set('ana', { uid: 'ana', token: cifrar('refresh-1', 'chave-de-teste'), calendario_id: 'cal 1' });
  const { f, chamadas } = fetchFalso(c => (c.url.endsWith('/token') ? { status: 200, json: { access_token: 'acesso' } } : null));
  const servico = criarServicoAgenda({ store, google: criarGoogle(() => SEGREDOS, f), segredos: () => SEGREDOS });
  assert.deepEqual(await servico('ana', { acao: 'desconectar' }), { conectado: false });
  assert.ok(chamadas.some(c => c.metodo === 'DELETE' && c.url.endsWith('/calendars/cal%201')));
  assert.ok(chamadas.some(c => c.url.endsWith('/revoke') && new URLSearchParams(c.corpo).get('token') === 'refresh-1'));
  assert.equal(store.contas.has('ana'), false);
});

test('aplicador: PUT, cria quando não existe, remove ignorando 404 e marca a conta que perdeu a autorização', async () => {
  const conta = (uid) => ({ uid, origem: 'x', token: cifrar(`r-${uid}`, 'k'), calendario_id: `cal-${uid}` });
  const contasMap = new Map([['ana', conta('ana')], ['bia', conta('bia')], ['caio', conta('caio')]]);
  const { f, chamadas } = fetchFalso(c => {
    if (c.url.endsWith('/token')) return new URLSearchParams(c.corpo).get('refresh_token') === 'r-caio' ? { status: 400, json: { error: 'invalid_grant' } } : { status: 200, json: { access_token: 'a' } };
    if (c.metodo === 'PUT') return { status: 404 };
    if (c.metodo === 'DELETE') return { status: 410 };
    return null;
  });
  const erros = [];
  const aplicar = criarAplicador(criarGoogle(() => SEGREDOS, f), () => 'k', async (uid, motivo) => { erros.push([uid, motivo]); });
  const evento = { summary: 'x' };
  await aplicar({ gravar: [{ uid: 'ana', evento }, { uid: 'caio', evento }], remover: ['bia', 'caio'] }, 99, contasMap);
  const cal = chamadas.filter(c => c.url.includes('/calendar/v3/'));
  assert.deepEqual(cal.map(c => `${c.metodo} ${c.url.split('/calendar/v3')[1]}`), [
    'PUT /calendars/cal-ana/events/ledurfd99', 'POST /calendars/cal-ana/events', 'DELETE /calendars/cal-bia/events/ledurfd99',
  ]);
  assert.equal(JSON.parse(cal[1].corpo).id, 'ledurfd99');
  assert.deepEqual(erros, [['caio', 'reconectar']]);
});

test('Google: limite de uso espera e tenta de novo', async () => {
  let n = 0;
  const { f } = fetchFalso(() => (++n < 3 ? { status: 429 } : { status: 200, json: { ok: 1 } }));
  const esperas = [];
  const google = criarGoogle(() => SEGREDOS, f, async ms => { esperas.push(ms); });
  const r = await google.api('a', 'GET', '/x');
  assert.equal(r.status, 200);
  assert.deepEqual(esperas, [1000, 2000]);
});
