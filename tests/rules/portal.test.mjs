import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

// Client portal (Manuscript 01_FIRESTORE/COLECOES/users.md and portal.md): clients in users/{uid}, linked to the
// contracts by CNPJ/CPF; staff side is adm2 only.
const projectId = 'demo-firebase-rules';
const CNPJ_A = '12345678000195';
const CNPJ_B = '98765432000110';
let env;

const identities = {
  cliente: 'uid-portal-cliente',
  socio: 'uid-portal-socio', // same CNPJ as cliente
  outro: 'uid-portal-outro', // CNPJ_B
  inativo: 'uid-portal-inativo',
  semPerfil: 'uid-portal-sem-perfil',
  adm2: 'uid-portal-adm2',
  engenharia: 'uid-portal-engenharia',
};

function dbAs(name) {
  return env.authenticatedContext(identities[name]).firestore();
}

function storageAs(name) {
  return env.authenticatedContext(identities[name]).storage();
}

const pessoa = (name) => ({ uid: identities[name], nome: name });

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const t = Timestamp.fromMillis(1);
    const funcionario = (uid, perfis) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email: `${uid}@example.com`, ativo: true, perfis: { frentista: false, adm2: false, motorista: false, ...perfis },
    });
    await funcionario(identities.adm2, { adm2: true });
    await funcionario(identities.engenharia, { engenharia: true });

    const cliente = (uid, documentos, ativo = true) => setDoc(doc(db, 'users', uid), {
      nome: uid, email: `${uid}@example.com`, documentos, ativo, criadoEm: t, atualizadoEm: t, criadoPor: pessoa('adm2'),
    });
    await cliente(identities.cliente, [CNPJ_A]);
    await cliente(identities.socio, [CNPJ_A]);
    await cliente(identities.outro, [CNPJ_B]);
    await cliente(identities.inativo, [CNPJ_A], false);
    await setDoc(doc(db, 'users', identities.cliente, 'notificacoes', 'n1'), { tipo: 'documento', titulo: 'Novo', mensagem: 'x', lida: false, criadoEm: t });

    await setDoc(doc(db, 'obras-v2', 'pob-a'), { nomeObra: 'Obra A' });
    await setDoc(doc(db, 'obras-v2', 'pob-b'), { nomeObra: 'Obra B' });
    await setDoc(doc(db, 'obras-v2', 'pob-nova'), { nomeObra: 'Obra nova' });
    const obra = (id, clienteDocumento) => setDoc(doc(db, 'portal-obras', id), {
      clienteDocumento, nome: id, valorContrato: 100000, criadoEm: t, criadoPor: pessoa('adm2'), atualizadoEm: t,
    });
    await obra('pob-a', CNPJ_A);
    await obra('pob-b', CNPJ_B);

    const arquivo = (obraId, id) => ({ path: `portal/obras/${obraId}/documentos/${id}/a.pdf`, nome: 'a.pdf', contentType: 'application/pdf', bytes: 10 });
    const registro = (obraId, clienteDocumento, id, excluidoEm = null) => ({
      obraId, clienteDocumento, titulo: id, categoria: 'contratos', arquivo: arquivo(obraId, id), criadoEm: t, criadoPor: pessoa('adm2'), excluidoEm, excluidoPor: null,
    });
    await setDoc(doc(db, 'portal-documentos', 'pd-a'), registro('pob-a', CNPJ_A, 'pd-a'));
    await setDoc(doc(db, 'portal-documentos', 'pd-a-lixeira'), registro('pob-a', CNPJ_A, 'pd-a-lixeira', t));
    await setDoc(doc(db, 'portal-documentos', 'pd-b'), registro('pob-b', CNPJ_B, 'pd-b'));
    await setDoc(doc(db, 'portal-fotos', 'pf-a'), registro('pob-a', CNPJ_A, 'pf-a'));

    const parcela = (id, status) => setDoc(doc(db, 'portal-parcelas', id), {
      obraId: 'pob-a', clienteDocumento: CNPJ_A, numero: 1, valor: 50000, vencimento: '2026-12-10', status,
      boleto: null, comprovante: null, comprovanteEnviadoEm: null, comprovanteEnviadoPor: null,
      observacaoCliente: null, observacaoAdm: null, criadoEm: t, atualizadoEm: t, excluidoEm: null, excluidoPor: null,
    });
    await parcela('pp-pendente', 'pendente');
    await parcela('pp-paga', 'pago');
    await parcela('pp-rejeitada', 'rejeitado');

    await setDoc(doc(db, 'portal-atendimentos', 'pa-a'), {
      obraId: 'pob-a', clienteDocumento: CNPJ_A, criadoPor: pessoa('cliente'), titulo: 'Dúvida', categoria: 'obra', status: 'aberto',
      responsavel: null, ultimaMensagem: { resumo: 'Oi', em: t, autorTipo: 'cliente' }, naoLidasCliente: 0, naoLidasEquipe: 1, criadoEm: t, atualizadoEm: t,
    });
    await setDoc(doc(db, 'portal-atendimentos', 'pa-a', 'mensagens', 'm1'), { autor: pessoa('cliente'), autorTipo: 'cliente', texto: 'Oi', anexos: [], criadoEm: t });

    const noticia = (id, status, excluidoEm = null) => setDoc(doc(db, 'portal-noticias', id), {
      titulo: id, resumo: 'r', categoria: 'institucional', origem: 'institucional', status, destaque: false, publicadoEm: t, criadoEm: t, atualizadoEm: t, excluidoEm,
    });
    await noticia('pn-publicada', 'publicada');
    await noticia('pn-rascunho', 'rascunho');
    await setDoc(doc(db, 'portal-emails', 'pe1'), { para: 'x@example.com' });
  });
}

before(async () => {
  const emulatorConfig = {
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  };
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    emulatorConfig.storage = { rules: await readFile('storage.rules', 'utf8') };
  }
  env = await initializeTestEnvironment(emulatorConfig);
  await seed();
});

after(async () => env?.cleanup());

// ---------------------------------------------------------------- users

test('[firestore] portal users: the client reads only its own profile; adm2 reads and lists', async () => {
  await assertSucceeds(getDoc(doc(dbAs('cliente'), 'users', identities.cliente)));
  await assertFails(getDoc(doc(dbAs('cliente'), 'users', identities.outro)));
  await assertFails(getDocs(collection(dbAs('cliente'), 'users')));
  await assertFails(getDocs(collection(dbAs('engenharia'), 'users')));
  await assertSucceeds(getDoc(doc(dbAs('adm2'), 'users', identities.cliente)));
  await assertSucceeds(getDocs(collection(dbAs('adm2'), 'users')));
});

test('[firestore] portal users: the client changes only its name, with the server time', async () => {
  const db = dbAs('socio');
  const ref_ = doc(db, 'users', identities.socio);
  await assertSucceeds(updateDoc(ref_, { nome: 'Sócio', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref_, { nome: '', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref_, { nome: 'Sócio', atualizadoEm: Timestamp.fromMillis(5) }));
  await assertFails(updateDoc(ref_, { documentos: [CNPJ_A, CNPJ_B] }));
  await assertFails(updateDoc(ref_, { ativo: false, atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'users', identities.cliente), { nome: 'Outro', atualizadoEm: serverTimestamp() }));
});

test('[firestore] portal users: created only by a Function; adm2 edits; nobody deletes', async () => {
  await assertFails(setDoc(doc(dbAs('semPerfil'), 'users', identities.semPerfil), { nome: 'Eu', documentos: [CNPJ_A], ativo: true }));
  await assertFails(setDoc(doc(dbAs('adm2'), 'users', 'uid-portal-novo'), { nome: 'Novo', documentos: [CNPJ_A], ativo: true }));
  await assertSucceeds(updateDoc(doc(dbAs('adm2'), 'users', identities.outro), { documentos: [CNPJ_B], atualizadoEm: serverTimestamp() }));
  await assertFails(deleteDoc(doc(dbAs('cliente'), 'users', identities.cliente)));
  await assertFails(deleteDoc(doc(dbAs('adm2'), 'users', identities.cliente)));
});

test('[firestore] portal users/notificacoes: the client reads its own and only marks them as read', async () => {
  const db = dbAs('cliente');
  const ref_ = doc(db, 'users', identities.cliente, 'notificacoes', 'n1');
  await assertSucceeds(getDoc(ref_));
  await assertSucceeds(getDocs(collection(db, 'users', identities.cliente, 'notificacoes')));
  await assertSucceeds(updateDoc(ref_, { lida: true }));
  await assertFails(updateDoc(ref_, { titulo: 'Mudado' }));
  await assertFails(setDoc(doc(db, 'users', identities.cliente, 'notificacoes', 'n2'), { titulo: 'x', lida: false }));
  await assertFails(deleteDoc(ref_));
  await assertFails(getDoc(doc(dbAs('socio'), 'users', identities.cliente, 'notificacoes', 'n1')));
});

// ---------------------------------------------------------------- portal-obras

test('[firestore] portal-obras: the client and partners of the same CNPJ read the contract; others do not', async () => {
  await assertSucceeds(getDoc(doc(dbAs('cliente'), 'portal-obras', 'pob-a')));
  await assertSucceeds(getDoc(doc(dbAs('socio'), 'portal-obras', 'pob-a')));
  await assertFails(getDoc(doc(dbAs('cliente'), 'portal-obras', 'pob-b')));
  await assertFails(getDoc(doc(dbAs('inativo'), 'portal-obras', 'pob-a')));
  await assertFails(getDoc(doc(dbAs('semPerfil'), 'portal-obras', 'pob-a')));
  await assertFails(getDoc(doc(dbAs('engenharia'), 'portal-obras', 'pob-a')));
  await assertSucceeds(getDoc(doc(dbAs('adm2'), 'portal-obras', 'pob-b')));
});

test('[firestore] portal-obras: the client lists with clienteDocumento in its own CNPJ/CPF', async () => {
  const db = dbAs('cliente');
  await assertSucceeds(getDocs(query(collection(db, 'portal-obras'), where('clienteDocumento', 'in', [CNPJ_A]))));
  await assertFails(getDocs(query(collection(db, 'portal-obras'), where('clienteDocumento', 'in', [CNPJ_A, CNPJ_B]))));
  await assertFails(getDocs(collection(db, 'portal-obras')));
});

test('[firestore] portal-obras: adm2 publishes an obras-v2 contract with a valid CNPJ/CPF and integer value', async () => {
  const db = dbAs('adm2');
  const base = { clienteDocumento: CNPJ_A, nome: 'Obra nova', valorContrato: 123456, criadoEm: serverTimestamp(), criadoPor: pessoa('adm2') };
  await assertFails(setDoc(doc(db, 'portal-obras', 'pob-inexistente'), base));
  await assertFails(setDoc(doc(db, 'portal-obras', 'pob-nova'), { ...base, clienteDocumento: '12.345.678/0001-95' }));
  await assertFails(setDoc(doc(db, 'portal-obras', 'pob-nova'), { ...base, valorContrato: 1234.56 }));
  await assertFails(setDoc(doc(db, 'portal-obras', 'pob-nova'), { ...base, criadoPor: pessoa('cliente') }));
  await assertFails(setDoc(doc(dbAs('engenharia'), 'portal-obras', 'pob-nova'), { ...base, criadoPor: pessoa('engenharia') }));
  await assertSucceeds(setDoc(doc(db, 'portal-obras', 'pob-nova'), base));
  await assertSucceeds(updateDoc(doc(db, 'portal-obras', 'pob-nova'), { valorContrato: null }));
  await assertFails(updateDoc(doc(db, 'portal-obras', 'pob-nova'), { criadoPor: pessoa('engenharia') }));
  await assertFails(updateDoc(doc(dbAs('cliente'), 'portal-obras', 'pob-a'), { nome: 'Minha' }));
  await assertFails(deleteDoc(doc(db, 'portal-obras', 'pob-nova')));
});

// ---------------------------------------------------------------- portal-documentos and portal-fotos

test('[firestore] portal-documentos: the client reads its own outside the trash', async () => {
  const db = dbAs('cliente');
  await assertSucceeds(getDoc(doc(db, 'portal-documentos', 'pd-a')));
  await assertFails(getDoc(doc(db, 'portal-documentos', 'pd-a-lixeira')));
  await assertFails(getDoc(doc(db, 'portal-documentos', 'pd-b')));
  await assertSucceeds(getDocs(query(collection(db, 'portal-documentos'),
    where('clienteDocumento', 'in', [CNPJ_A]), where('obraId', '==', 'pob-a'), where('excluidoEm', '==', null))));
  await assertFails(getDocs(query(collection(db, 'portal-documentos'), where('clienteDocumento', 'in', [CNPJ_A]))));
  await assertSucceeds(getDoc(doc(db, 'portal-fotos', 'pf-a')));
  await assertFails(getDoc(doc(dbAs('outro'), 'portal-fotos', 'pf-a')));
});

test('[firestore] portal-documentos: adm2 sends for a published contract with its CNPJ/CPF; nobody deletes', async () => {
  const db = dbAs('adm2');
  const novo = { obraId: 'pob-a', clienteDocumento: CNPJ_A, titulo: 'ART', categoria: 'art_rrt', arquivo: { path: 'portal/obras/pob-a/documentos/pd-novo/art.pdf' }, criadoEm: serverTimestamp(), criadoPor: pessoa('adm2'), excluidoEm: null, excluidoPor: null };
  await assertFails(setDoc(doc(db, 'portal-documentos', 'pd-novo'), { ...novo, clienteDocumento: CNPJ_B }));
  await assertFails(setDoc(doc(db, 'portal-documentos', 'pd-novo'), { ...novo, obraId: 'pob-nao-publicada' }));
  await assertFails(setDoc(doc(dbAs('cliente'), 'portal-documentos', 'pd-novo'), { ...novo, criadoPor: pessoa('cliente') }));
  await assertSucceeds(setDoc(doc(db, 'portal-documentos', 'pd-novo'), novo));
  await assertSucceeds(updateDoc(doc(db, 'portal-documentos', 'pd-novo'), { excluidoEm: serverTimestamp(), excluidoPor: pessoa('adm2') }));
  await assertSucceeds(updateDoc(doc(db, 'portal-documentos', 'pd-novo'), { excluidoEm: null, excluidoPor: null }));
  await assertFails(updateDoc(doc(db, 'portal-documentos', 'pd-novo'), { obraId: 'pob-b', clienteDocumento: CNPJ_B }));
  await assertFails(deleteDoc(doc(db, 'portal-documentos', 'pd-novo')));
  await assertSucceeds(setDoc(doc(db, 'portal-fotos', 'pf-novo'), { ...novo, etapa: 'fundacao' }));
  await assertFails(setDoc(doc(dbAs('cliente'), 'portal-fotos', 'pf-cliente'), { ...novo, criadoPor: pessoa('cliente') }));
});

// ---------------------------------------------------------------- portal-parcelas

const comprovante = (parcelaId) => ({
  status: 'comprovante_enviado',
  comprovante: { path: `portal/obras/pob-a/parcelas/${parcelaId}/comprovante/pix.pdf`, nome: 'pix.pdf', contentType: 'application/pdf', bytes: 10 },
  comprovanteEnviadoEm: serverTimestamp(),
  comprovanteEnviadoPor: pessoa('cliente'),
  observacaoCliente: 'Pago via PIX',
  atualizadoEm: serverTimestamp(),
});

test('[firestore] portal-parcelas: the client sends the receipt of a pending installment and nothing else', async () => {
  const db = dbAs('cliente');
  await assertSucceeds(getDoc(doc(db, 'portal-parcelas', 'pp-pendente')));
  await assertFails(getDoc(doc(dbAs('outro'), 'portal-parcelas', 'pp-pendente')));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), { ...comprovante('pp-pendente'), status: 'pago' }));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), { ...comprovante('pp-pendente'), valor: 1 }));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), { ...comprovante('pp-pendente'), comprovanteEnviadoPor: pessoa('socio') }));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), comprovante('pp-paga')));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-paga'), comprovante('pp-paga')));
  await assertFails(updateDoc(doc(dbAs('outro'), 'portal-parcelas', 'pp-pendente'), { ...comprovante('pp-pendente'), comprovanteEnviadoPor: pessoa('outro') }));
  await assertSucceeds(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), comprovante('pp-pendente')));
  // A rejected receipt can be sent again; one already sent cannot be replaced.
  await assertSucceeds(updateDoc(doc(db, 'portal-parcelas', 'pp-rejeitada'), comprovante('pp-rejeitada')));
  await assertFails(updateDoc(doc(db, 'portal-parcelas', 'pp-pendente'), comprovante('pp-pendente')));
});

test('[firestore] portal-parcelas: adm2 types installments in integer cents; nobody deletes', async () => {
  const db = dbAs('adm2');
  const nova = { obraId: 'pob-a', clienteDocumento: CNPJ_A, numero: 2, valor: 75000, vencimento: '2027-01-10', status: 'pendente', criadoEm: serverTimestamp(), excluidoEm: null };
  await assertFails(setDoc(doc(db, 'portal-parcelas', 'pp-nova'), { ...nova, valor: 750.0 + 0.5 }));
  await assertFails(setDoc(doc(dbAs('cliente'), 'portal-parcelas', 'pp-nova'), nova));
  await assertSucceeds(setDoc(doc(db, 'portal-parcelas', 'pp-nova'), nova));
  await assertSucceeds(updateDoc(doc(db, 'portal-parcelas', 'pp-nova'), { status: 'pago', conferidoEm: serverTimestamp(), conferidoPor: pessoa('adm2') }));
  await assertFails(deleteDoc(doc(db, 'portal-parcelas', 'pp-nova')));
});

// ---------------------------------------------------------------- portal-atendimentos

test('[firestore] portal-atendimentos: the client opens a ticket for its own contract and updates only the summary', async () => {
  const db = dbAs('socio');
  const novo = { obraId: 'pob-a', clienteDocumento: CNPJ_A, criadoPor: pessoa('socio'), titulo: 'Prazo', categoria: 'obra', status: 'aberto', responsavel: null, naoLidasCliente: 0, naoLidasEquipe: 1, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() };
  await assertFails(setDoc(doc(db, 'portal-atendimentos', 'pa-novo'), { ...novo, obraId: 'pob-b', clienteDocumento: CNPJ_B }));
  await assertFails(setDoc(doc(db, 'portal-atendimentos', 'pa-novo'), { ...novo, criadoPor: pessoa('cliente') }));
  await assertFails(setDoc(doc(db, 'portal-atendimentos', 'pa-novo'), { ...novo, status: 'resolvido' }));
  await assertSucceeds(setDoc(doc(db, 'portal-atendimentos', 'pa-novo'), novo));
  await assertSucceeds(getDoc(doc(dbAs('cliente'), 'portal-atendimentos', 'pa-novo')));
  await assertFails(getDoc(doc(dbAs('outro'), 'portal-atendimentos', 'pa-novo')));
  await assertSucceeds(updateDoc(doc(db, 'portal-atendimentos', 'pa-novo'), { naoLidasCliente: 0, naoLidasEquipe: 2, atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'portal-atendimentos', 'pa-novo'), { status: 'fechado' }));
  await assertSucceeds(updateDoc(doc(dbAs('adm2'), 'portal-atendimentos', 'pa-novo'), { status: 'em_andamento', responsavel: pessoa('adm2') }));
  await assertFails(updateDoc(doc(dbAs('adm2'), 'portal-atendimentos', 'pa-novo'), { clienteDocumento: CNPJ_B, obraId: 'pob-b' }));
  await assertFails(deleteDoc(doc(dbAs('adm2'), 'portal-atendimentos', 'pa-novo')));
  await assertSucceeds(getDocs(query(collection(dbAs('cliente'), 'portal-atendimentos'), where('clienteDocumento', 'in', [CNPJ_A]))));
});

test('[firestore] portal-atendimentos/mensagens: immutable, written as the signed-in client or team', async () => {
  const msgs = (name) => collection(dbAs(name), 'portal-atendimentos', 'pa-a', 'mensagens');
  const msg = (name, autorTipo) => ({ autor: pessoa(name), autorTipo, texto: 'Olá', anexos: [], criadoEm: serverTimestamp() });
  await assertSucceeds(getDocs(msgs('socio')));
  await assertFails(getDocs(msgs('outro')));
  await assertSucceeds(setDoc(doc(msgs('cliente'), 'm-cliente'), msg('cliente', 'cliente')));
  await assertFails(setDoc(doc(msgs('cliente'), 'm-falsa'), msg('cliente', 'equipe')));
  await assertFails(setDoc(doc(msgs('cliente'), 'm-forjada'), msg('socio', 'cliente')));
  await assertFails(setDoc(doc(msgs('outro'), 'm-outro'), msg('outro', 'cliente')));
  await assertSucceeds(setDoc(doc(msgs('adm2'), 'm-equipe'), msg('adm2', 'equipe')));
  await assertFails(updateDoc(doc(msgs('cliente'), 'm-cliente'), { texto: 'Editado' }));
  await assertFails(deleteDoc(doc(msgs('adm2'), 'm-cliente')));
});

// ---------------------------------------------------------------- portal-noticias and portal-emails

test('[firestore] portal-noticias: active clients read the published ones; adm2 writes', async () => {
  const db = dbAs('cliente');
  await assertSucceeds(getDoc(doc(db, 'portal-noticias', 'pn-publicada')));
  await assertFails(getDoc(doc(db, 'portal-noticias', 'pn-rascunho')));
  await assertFails(getDoc(doc(dbAs('inativo'), 'portal-noticias', 'pn-publicada')));
  await assertFails(getDoc(doc(dbAs('engenharia'), 'portal-noticias', 'pn-publicada')));
  await assertSucceeds(getDocs(query(collection(db, 'portal-noticias'), where('status', '==', 'publicada'), where('excluidoEm', '==', null))));
  await assertFails(getDocs(collection(db, 'portal-noticias')));
  await assertFails(setDoc(doc(db, 'portal-noticias', 'pn-cliente'), { titulo: 'x', status: 'publicada' }));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), 'portal-noticias', 'pn-nova'), { titulo: 'Nova', status: 'rascunho', excluidoEm: null }));
  await assertFails(deleteDoc(doc(dbAs('adm2'), 'portal-noticias', 'pn-nova')));
});

test('[firestore] portal-emails: Functions only', async () => {
  await assertFails(getDoc(doc(dbAs('cliente'), 'portal-emails', 'pe1')));
  await assertFails(getDoc(doc(dbAs('adm2'), 'portal-emails', 'pe1')));
  await assertFails(setDoc(doc(dbAs('adm2'), 'portal-emails', 'pe2'), { para: 'y@example.com' }));
});

test('[firestore] a portal client reads no internal collection', async () => {
  await assertFails(getDoc(doc(dbAs('cliente'), 'obras-v2', 'pob-a')));
  await assertFails(getDoc(doc(dbAs('cliente'), 'funcionarios', identities.adm2)));
});

// ---------------------------------------------------------------- Storage

const storageTest = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? test : test.skip;
const pdf = new Uint8Array([37, 80, 68, 70]);

storageTest('[storage] portal: adm2 sends contract files; clients of the CNPJ/CPF read them', async () => {
  const caminho = 'portal/obras/pob-a/documentos/pd-a/contrato.pdf';
  await assertFails(uploadBytes(ref(storageAs('cliente'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(uploadBytes(ref(storageAs('adm2'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('adm2'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('cliente'), caminho)));
  await assertSucceeds(getBytes(ref(storageAs('socio'), caminho)));
  await assertFails(getBytes(ref(storageAs('outro'), caminho)));
  await assertFails(getBytes(ref(storageAs('inativo'), caminho)));
  await assertFails(getBytes(ref(storageAs('engenharia'), caminho)));
  await assertFails(deleteObject(ref(storageAs('adm2'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('adm2'), 'portal/obras/pob-a/fotos/pf-a/foto.pdf'), pdf, { contentType: 'application/pdf' }));
});

storageTest('[storage] portal: the client sends the receipt only for its own contract, as PDF or image', async () => {
  const caminho = 'portal/obras/pob-a/parcelas/pp-pendente/comprovante/pix.pdf';
  await assertFails(uploadBytes(ref(storageAs('outro'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('cliente'), 'portal/obras/pob-a/parcelas/pp-pendente/comprovante/x.zip'), pdf, { contentType: 'application/zip' }));
  await assertSucceeds(uploadBytes(ref(storageAs('cliente'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('adm2'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('cliente'), 'portal/obras/pob-a/parcelas/pp-pendente/boleto/b.pdf'), pdf, { contentType: 'application/pdf' }));
});

storageTest('[storage] portal: ticket attachments by the clients of the ticket; news images by adm2', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('cliente'), 'portal/atendimentos/pa-a/m1/foto.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('outro'), 'portal/atendimentos/pa-a/m1/outro.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('socio'), 'portal/atendimentos/pa-a/m1/foto.pdf')));
  await assertFails(uploadBytes(ref(storageAs('cliente'), 'portal/noticias/pn-publicada/capa.png'), pdf, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(storageAs('adm2'), 'portal/noticias/pn-publicada/capa.png'), pdf, { contentType: 'image/png' }));
  await assertSucceeds(getBytes(ref(storageAs('outro'), 'portal/noticias/pn-publicada/capa.png')));
  await assertFails(getBytes(ref(storageAs('inativo'), 'portal/noticias/pn-publicada/capa.png')));
});
