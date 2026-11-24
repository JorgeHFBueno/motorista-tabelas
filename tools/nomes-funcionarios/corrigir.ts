/* Nomes das pessoas com só a primeira letra de cada palavra maiúscula ("JOÃO PEREIRA DE LIMA" vira "João Pereira de Lima"),
 * em funcionarios/{uid}.nome e no nome da conta de login (displayName), que andam juntos (Meu perfil grava os dois). Regra em
 * ./regra.ts: só muda nome todo em maiúsculas ou todo em minúsculas. Pedido de 2026-11-23.
 *
 * Empacotar (da pasta do repositório WEB):
 *   npx esbuild tools/nomes-funcionarios/corrigir.ts --bundle --platform=node --format=esm --outfile=<scratchpad>/nomes.mjs
 * Rodar:
 *   node <scratchpad>/nomes.mjs <pasta-de-saida>                        → simulação: lê e grava na pasta o plano.txt e o backup. Não grava nada.
 *   node <scratchpad>/nomes.mjs <pasta-de-saida> --aplicar              → grava o plano (backup antes) e relê para conferir.
 *   node <scratchpad>/nomes.mjs <pasta-de-saida> --desfazer <backup>    → volta os nomes de um backup, só onde o nome ainda é o que o script gravou.
 *   ... --emulador host:porta --auth-emulador host:porta                → ensaio nos emuladores do Firestore e do Auth, no lugar da produção.
 * Lê com a sessão do Firebase CLI (firebase login) da conta do responsável, como tools/migrar-crm-friday.
 * Não mexe nos registros já gravados (o nome da época em criadoPor, motorista etc.) nem nos itens do Friday. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { nomeACorrigir, nomeCapitalizado } from './regra';

const args = process.argv.slice(2);
const opcao = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] ?? null : null; };
const EMULADOR = opcao('--emulador');
const AUTH_EMULADOR = opcao('--auth-emulador');
const DESFAZER = opcao('--desfazer');
const APLICAR = args.includes('--aplicar');
const valoresDeOpcao = new Set([EMULADOR, AUTH_EMULADOR, DESFAZER]);
const saida = args.find((a) => !a.startsWith('--') && !valoresDeOpcao.has(a));
if (!saida) throw new Error('Uso: node nomes.mjs <pasta-de-saida> [--aplicar | --desfazer <backup.json>] [--emulador host:porta --auth-emulador host:porta]');
if (APLICAR && args.includes('--desfazer')) throw new Error('--aplicar e --desfazer não vão juntos.');
if (args.includes('--desfazer') && !DESFAZER) throw new Error('--desfazer pede o arquivo de backup.');
if (Boolean(EMULADOR) !== Boolean(AUTH_EMULADOR)) throw new Error('--emulador e --auth-emulador vão juntos.');
fs.mkdirSync(saida, { recursive: true });

const PROJETO = 'app-motor-api';
const BANCO = `${EMULADOR ? `http://${EMULADOR}` : 'https://firestore.googleapis.com'}/v1/projects/${PROJETO}/databases/(default)`;
const CONTAS = `${AUTH_EMULADOR ? `http://${AUTH_EMULADOR}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com'}/v1/projects/${PROJETO}`;
const ONDE = EMULADOR ? 'nos emuladores' : 'na produção';

let token = async () => 'owner';
if (!EMULADOR) {
  const CLI_ROOT = process.env.FIREBASE_TOOLS_LIB ?? 'C:/Users/TI_R3TR0/AppData/Roaming/npm/node_modules/firebase-tools/lib';
  const req = createRequire(import.meta.url);
  const auth = req(`${CLI_ROOT}/auth`);
  const api = req(`${CLI_ROOT}/apiv2`);
  const conta = auth.getGlobalDefaultAccount();
  if (!conta?.tokens?.refresh_token) throw new Error('Sem sessão do Firebase CLI (rode firebase login).');
  api.setRefreshToken(conta.tokens.refresh_token);
  token = async () => (await api.getAccessToken()) as string;
}

type DocFirestore = { name: string; updateTime: string; fields?: { nome?: { stringValue?: string } } };
type Pagina = { documents?: DocFirestore[]; nextPageToken?: string };
type Contas = { users?: { localId: string; displayName?: string }[] };

async function pedir<T>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJETO },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 400)}`);
  return (await r.json()) as T;
}

const nomeDoDoc = (d: DocFirestore): unknown => d.fields?.nome?.stringValue ?? null;

async function lerFuncionarios(): Promise<{ uid: string; nome: unknown }[]> {
  const out: { uid: string; nome: unknown }[] = [];
  let pagina = '';
  do {
    const r = await pedir<Pagina>(`${BANCO}/documents/funcionarios?pageSize=300&mask.fieldPaths=nome${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`);
    for (const d of r.documents ?? []) out.push({ uid: d.name.split('/').pop()!, nome: nomeDoDoc(d) });
    pagina = r.nextPageToken ?? '';
  } while (pagina);
  return out;
}

/** displayName de cada conta de login; uid sem conta fica de fora do mapa. */
async function nomesDeLogin(uids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < uids.length; i += 100) {
    const r = await pedir<Contas>(`${CONTAS}/accounts:lookup`, { localId: uids.slice(i, i + 100) });
    for (const u of r.users ?? []) out.set(u.localId, u.displayName ?? null);
  }
  return out;
}

type Troca = { uid: string; antes: string; depois: string; loginAntes: string | null; temLogin: boolean };

/** Grava uma troca, relendo o documento antes: se o nome já não é o esperado (a pessoa mudou depois da leitura), fica como está. */
async function trocar(uid: string, esperado: string, novo: string, login: { temLogin: boolean; para: string | null }): Promise<'ok' | 'mudou'> {
  const doc = await pedir<DocFirestore>(`${BANCO}/documents/funcionarios/${encodeURIComponent(uid)}?mask.fieldPaths=nome`);
  if (nomeDoDoc(doc) !== esperado) return 'mudou';
  await pedir(`${BANCO}/documents:commit`, { writes: [{
    update: { name: doc.name, fields: { nome: { stringValue: novo } } },
    updateMask: { fieldPaths: ['nome'] },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { updateTime: doc.updateTime },
  }] });
  if (login.temLogin) {
    await pedir(`${CONTAS}/accounts:update`, login.para === null
      ? { localId: uid, deleteAttribute: ['DISPLAY_NAME'] }
      : { localId: uid, displayName: login.para });
  }
  return 'ok';
}

async function gravar(lista: { uid: string; de: string; para: string; login: { temLogin: boolean; para: string | null } }[]) {
  const resultado = { ok: 0, mudou: [] as string[], erro: [] as string[] };
  for (const t of lista) {
    try {
      if ((await trocar(t.uid, t.de, t.para, t.login)) === 'ok') resultado.ok++;
      else resultado.mudou.push(`${t.de} (${t.uid})`);
    } catch (e) {
      resultado.erro.push(`${t.de} (${t.uid}): ${(e as Error).message}`);
    }
  }
  return resultado;
}

/** Relê e conta quantas pessoas ficaram com o nome esperado, no Firestore e no login. */
async function conferir(esperado: { uid: string; nome: string; login: string | null; temLogin: boolean }[]) {
  const atuais = new Map((await lerFuncionarios()).map((f) => [f.uid, f.nome]));
  const logins = await nomesDeLogin(esperado.filter((e) => e.temLogin).map((e) => e.uid));
  const noBanco = esperado.filter((e) => atuais.get(e.uid) === e.nome).length;
  const comLogin = esperado.filter((e) => e.temLogin);
  const noLogin = comLogin.filter((e) => logins.get(e.uid) === e.login).length;
  console.log(`Conferido ${ONDE}: ${noBanco} de ${esperado.length} com o nome certo em funcionarios; ${noLogin} de ${comLogin.length} no login.`);
}

const relatar = (r: Awaited<ReturnType<typeof gravar>>) => {
  console.log(`Gravados: ${r.ok}.`);
  if (r.mudou.length) console.log(`Nome mudou depois da leitura, ficou como está (${r.mudou.length}):\n  ${r.mudou.join('\n  ')}`);
  if (r.erro.length) console.log(`Erros (${r.erro.length}):\n  ${r.erro.join('\n  ')}`);
};

if (DESFAZER) {
  const backup = JSON.parse(fs.readFileSync(DESFAZER, 'utf8')) as { trocas: Troca[] };
  console.log(`Desfazendo ${backup.trocas.length} trocas de ${DESFAZER} ${ONDE}.`);
  relatar(await gravar(backup.trocas.map((t) => ({ uid: t.uid, de: t.depois, para: t.antes, login: { temLogin: t.temLogin, para: t.loginAntes } }))));
  await conferir(backup.trocas.map((t) => ({ uid: t.uid, nome: t.antes, login: t.loginAntes, temLogin: t.temLogin })));
} else {
  const funcionarios = await lerFuncionarios();
  const logins = await nomesDeLogin(funcionarios.map((f) => f.uid));
  const trocas: Troca[] = [];
  const mantidos: string[] = [];
  for (const f of funcionarios) {
    const depois = nomeACorrigir(f.nome);
    if (depois) trocas.push({ uid: f.uid, antes: f.nome as string, depois, loginAntes: logins.get(f.uid) ?? null, temLogin: logins.has(f.uid) });
    else if (typeof f.nome === 'string' && !f.nome.includes('@') && nomeCapitalizado(f.nome) !== f.nome) mantidos.push(`${f.nome}  (a regra daria "${nomeCapitalizado(f.nome)}")`);
  }
  trocas.sort((a, b) => a.antes.localeCompare(b.antes, 'pt-BR'));
  const semLogin = trocas.filter((t) => !t.temLogin);
  const loginDiferente = trocas.filter((t) => t.temLogin && t.loginAntes !== t.antes);

  const lidoEm = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const arquivoBackup = path.join(saida, `backup-${lidoEm.replace(/[-:]/g, '').replace(' ', '-')}.json`);
  const plano = [
    `Nomes das pessoas ${ONDE}, lidos em ${lidoEm} (Brasília). ${funcionarios.length} pessoas em funcionarios.`,
    '',
    `Mudam (${trocas.length}):`,
    ...trocas.map((t) => `  ${t.antes}  →  ${t.depois}`),
    '',
    `Ficam como estão, escritos com maiúsculas e minúsculas por alguém (${mantidos.length}):`,
    ...mantidos.map((m) => `  ${m}`),
    '',
    `Sem conta de login, só muda em funcionarios (${semLogin.length}):`,
    ...semLogin.map((t) => `  ${t.antes}`),
    '',
    `Login com nome diferente do de funcionarios, que passa a ser o novo (${loginDiferente.length}):`,
    ...loginDiferente.map((t) => `  ${t.antes}  (login: ${t.loginAntes ?? 'sem nome'})`),
  ].join('\n');
  fs.writeFileSync(path.join(saida, 'plano.txt'), plano + '\n');
  fs.writeFileSync(arquivoBackup, JSON.stringify({ lidoEm, onde: ONDE, trocas }, null, 2));
  console.log(plano);
  console.log(`\nPlano em ${path.join(saida, 'plano.txt')}; backup em ${arquivoBackup}.`);

  if (APLICAR) {
    console.log(`\nGravando ${trocas.length} nomes ${ONDE}.`);
    relatar(await gravar(trocas.map((t) => ({ uid: t.uid, de: t.antes, para: t.depois, login: { temLogin: t.temLogin, para: t.depois } }))));
    await conferir(trocas.map((t) => ({ uid: t.uid, nome: t.depois, login: t.depois, temLogin: t.temLogin })));
  } else {
    console.log('\nSimulação: nada foi gravado. Para gravar, rode de novo com --aplicar.');
  }
}
