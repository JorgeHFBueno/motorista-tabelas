// Prepara os emuladores do Firebase para testar o Friday localmente: cria pessoas de teste no Auth
// e os documentos funcionarios/{uid} (ativos) no Firestore. Só fala com 127.0.0.1 — nunca com produção.
//
// Uso (com os emuladores no ar: npx firebase emulators:start --only auth,firestore):
//   node scripts/friday-emulador-seed.mjs
// Depois: npx vite --mode emulador (arquivo .env.emulador com VITE_USE_FIREBASE_EMULATORS=true)
// e entre em http://localhost:5173/login com uma das contas abaixo.

const PROJETO = 'app-motor-api';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

// Contas existentes apenas no emulador.
const PESSOAS = [
  { email: 'friday.adm2@ledur.test', senha: 'friday-emulador-1', nome: 'Teste Friday (adm2)', adm2: true },
  { email: 'friday.colega@ledur.test', senha: 'friday-emulador-2', nome: 'Colega de Teste', adm2: false },
];

async function postJson(url, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  return { ok: r.ok, json: await r.json() };
}

async function uidDe(p) {
  const criar = await postJson(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulador`, { email: p.email, password: p.senha, returnSecureToken: true });
  if (criar.ok) return criar.json.localId;
  const entrar = await postJson(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulador`, { email: p.email, password: p.senha, returnSecureToken: true });
  if (!entrar.ok) throw new Error(`Não consegui criar nem entrar com ${p.email}: ${JSON.stringify(entrar.json)}`);
  return entrar.json.localId;
}

async function gravarFuncionario(uid, p) {
  const agora = new Date().toISOString();
  const bool = v => ({ booleanValue: v });
  const fields = {
    nome: { stringValue: p.nome }, email: { stringValue: p.email }, ativo: bool(true),
    perfis: { mapValue: { fields: { adm1: bool(false), adm2: bool(p.adm2), user: bool(true), motorista: bool(false) } } },
    createdAt: { timestampValue: agora }, updatedAt: { timestampValue: agora },
  };
  // "Bearer owner" = acesso de administrador do emulador (ignora as regras).
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJETO}/databases/(default)/documents/funcionarios/${uid}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Falha ao gravar funcionarios/${uid}: ${await r.text()}`);
}

for (const p of PESSOAS) {
  const uid = await uidDe(p);
  await gravarFuncionario(uid, p);
  console.log(`ok: ${p.email} (${p.adm2 ? 'adm2' : 'funcionário'}) uid=${uid}`);
}
