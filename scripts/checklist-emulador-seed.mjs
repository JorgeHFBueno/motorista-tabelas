// Prepara os emuladores do Firebase para testar o checklist do mecânico (/checklist) localmente: uma conta de
// mecânico no Auth, dois motoristas, um veículo e uma máquina em veiculos-v2 e um checklist anterior do veículo (com
// "Não se aplica" para lembrar). Só fala com 127.0.0.1, nunca com produção.
//
// Uso (com os emuladores no ar: npx firebase emulators:start --only auth,firestore,storage):
//   node scripts/checklist-emulador-seed.mjs
// Depois: npx vite --mode emulador (arquivo .env.emulador com VITE_USE_FIREBASE_EMULATORS=true)
// e entre em http://localhost:5173/login com a conta abaixo; abra /checklist.

const PROJETO = 'app-motor-api';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

// Conta existente apenas no emulador.
const MECANICO = { email: 'checklist.mecanico@ledur.test', senha: 'checklist-emulador-1', nome: 'Mecânico de Teste' };

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

// Valor JS → valor da API REST do Firestore.
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
}

async function gravar(caminho, dados) {
  // "Bearer owner" = acesso de administrador do emulador (ignora as regras).
  const r = await fetch(`${FIRESTORE}/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify(valor(dados).mapValue),
  });
  if (!r.ok) throw new Error(`Falha ao gravar ${caminho}: ${await r.text()}`);
}

const agora = new Date();
const perfis = (extra) => ({ adm2: false, motorista: false, frentista: false, mecanico: false, ...extra });

const uid = await uidDe(MECANICO);
await gravar(`funcionarios/${uid}`, { nome: MECANICO.nome, email: MECANICO.email, ativo: true, perfis: perfis({ mecanico: true }), createdAt: agora, updatedAt: agora });
await gravar('funcionarios/ck-motorista-ana', { nome: 'Ana Motorista', ativo: true, perfis: perfis({ motorista: true }), motorista: { ordem: 1 }, createdAt: agora, updatedAt: agora });
await gravar('funcionarios/ck-motorista-bruno', { nome: 'Bruno Operador', ativo: true, perfis: perfis({ motorista: true }), motorista: { ordem: 2 }, createdAt: agora, updatedAt: agora });
await gravar('veiculos-v2/ck-caminhao', {
  schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'PLACA', identificador: 'CKL1A23', nome: 'Caminhão de teste' },
  operacional: { quilometragemUltima: 125000, dataUltimaAtualizacao: agora },
});
await gravar('veiculos-v2/ck-carregadeira', {
  schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'EXTRA', identificador: 'CARREGADEIRA TESTE', nome: 'Carregadeira de teste' },
  operacional: { quilometragemUltima: 8700 },
});
await gravar('checklists-v2/ChecklistAnteriorTst1', {
  schemaVersion: 1, tipo: 'chegada', catalogo: 'veiculos', catalogoVersao: '1',
  item_frota_id: 'ck-caminhao', item_frota_snapshot: { categoria: 'PLACA', identificador: 'CKL1A23', nome: 'Caminhão de teste' },
  medidor: { tipo: 'km', valor: 125000, anterior: 124000, corrigido: false }, guincho: false,
  motoristaOperador: { uid: 'ck-motorista-ana', nome: 'Ana Motorista' },
  assinatura: { status: 'ausente', motivo: 'Seed do emulador', em: agora },
  criadoPor: { uid, nome: MECANICO.nome }, criadoPorUid: uid,
  iniciadoEm: agora, concluidoEm: agora, registradoEm: agora,
  totais: { ok: 0, avaria: 0, naoSeAplica: 2 },
  itens: [
    { itemId: 'traseira_sirene_re', parte: 'traseira', titulo: 'Sirene de ré', status: 'nao_se_aplica', observacao: null, fotos: [] },
    { itemId: 'lateral_esquerda_cabine_suplementar', parte: 'lateral_esquerda', titulo: 'Cabine suplementar', status: 'nao_se_aplica', observacao: null, fotos: [] },
  ],
});
console.log(`ok: ${MECANICO.email} (mecânico) uid=${uid}; 2 motoristas, CKL1A23 e CARREGADEIRA TESTE, 1 checklist anterior`);
