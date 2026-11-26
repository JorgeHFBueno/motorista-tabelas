import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

// ERP, Aprovar página (Manuscript 01_FIRESTORE/COLECOES/erp-aprovacoes.md): erp-aprovacoes/{página com pontos}. Área
// erp: 'ver' lê, 'editar' grava a decisão assinada por si; sem aprovar, a descrição é obrigatória; ninguém apaga.
const projectId = 'demo-firebase-rules';
let env;

const identities = {
  adm2: 'uid-erp-adm2',
  editar: 'uid-erp-editar',
  ver: 'uid-erp-ver',
  comercial: 'uid-erp-comercial', // só a área comercial
  inativo: 'uid-erp-inativo',
};

const dbAs = (name) => env.authenticatedContext(identities[name]).firestore();

const decisao = (autor, extra = {}) => ({
  schemaVersion: 1, pagina: 'erp/pessoas/:codigo', titulo: 'Cadastro de Clientes e Fornecedores', situacao: 'aprovada',
  descricao: null, decididoPor: { uid: identities[autor], nome: autor }, decididoEm: serverTimestamp(), ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const funcionario = (uid, perfis, areas = {}, ativo = true) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email: `${uid}@example.com`, ativo, perfis: { frentista: false, adm2: false, motorista: false, ...perfis }, areas,
    });
    await funcionario(identities.adm2, { adm2: true });
    await funcionario(identities.editar, {}, { erp: 'editar' });
    await funcionario(identities.ver, {}, { erp: 'ver' });
    await funcionario(identities.comercial, {}, { comercial: 'editar' });
    await funcionario(identities.inativo, {}, { erp: 'editar' }, false);
    await setDoc(doc(db, 'erp-aprovacoes', 'erp.estoques'), {
      ...decisao('adm2'), pagina: 'erp/estoques', titulo: 'Conferência de Estoques', decididoEm: Timestamp.fromMillis(1),
    });
  });
});

after(async () => env?.cleanup());

test('[firestore] erp-aprovacoes: the erp area reads; other areas and inactive people do not', async () => {
  await assertSucceeds(getDoc(doc(dbAs('ver'), 'erp-aprovacoes', 'erp.estoques')));
  await assertSucceeds(getDocs(collection(dbAs('editar'), 'erp-aprovacoes')));
  await assertSucceeds(getDoc(doc(dbAs('adm2'), 'erp-aprovacoes', 'erp.estoques')));
  await assertFails(getDoc(doc(dbAs('comercial'), 'erp-aprovacoes', 'erp.estoques')));
  await assertFails(getDoc(doc(dbAs('inativo'), 'erp-aprovacoes', 'erp.estoques')));
});

test('[firestore] erp-aprovacoes: editar approves or not, signed by itself; ver and other areas do not', async () => {
  await assertSucceeds(setDoc(doc(dbAs('editar'), 'erp-aprovacoes', 'erp.pessoas.:codigo'), decisao('editar')));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), 'erp-aprovacoes', 'erp.estoques.relatorios.giro'),
    decisao('adm2', { pagina: 'erp/estoques/relatorios/giro', titulo: 'Giro de Estoque', situacao: 'reprovada', descricao: 'Falta o filtro por obra.' })));
  await assertSucceeds(setDoc(doc(dbAs('editar'), 'erp-aprovacoes', 'erp.estoques'),
    decisao('editar', { pagina: 'erp/estoques', titulo: 'Conferência de Estoques', situacao: 'reprovada', descricao: 'Coluna de custo errada.' })));
  await assertFails(setDoc(doc(dbAs('ver'), 'erp-aprovacoes', 'erp.pessoas.:codigo'), decisao('ver')));
  await assertFails(setDoc(doc(dbAs('comercial'), 'erp-aprovacoes', 'erp.pessoas.:codigo'), decisao('comercial')));
  await assertFails(setDoc(doc(dbAs('inativo'), 'erp-aprovacoes', 'erp.pessoas.:codigo'), decisao('inativo')));
});

test('[firestore] erp-aprovacoes: invalid decisions fail', async () => {
  const grava = (id, d) => setDoc(doc(dbAs('editar'), 'erp-aprovacoes', id), d);
  const id = 'erp.pessoas.:codigo';
  await assertFails(grava(id, decisao('editar', { situacao: 'reprovada' })));
  await assertFails(grava(id, decisao('editar', { situacao: 'reprovada', descricao: '   ' })));
  await assertFails(grava(id, decisao('editar', { situacao: 'reprovada', descricao: 'x'.repeat(2001) })));
  await assertFails(grava(id, decisao('editar', { situacao: 'pendente' })));
  await assertFails(grava(id, decisao('editar', { decididoPor: { uid: identities.adm2, nome: 'adm2' } })));
  await assertFails(grava(id, decisao('editar', { decididoEm: Timestamp.now() })));
  await assertFails(grava(id, decisao('editar', { extra: true })));
  await assertFails(grava(id, decisao('editar', { titulo: '' })));
  await assertFails(grava('erp.produtos', decisao('editar')));
  await assertFails(grava('logistica.kpi', decisao('editar', { pagina: 'logistica/kpi' })));
});

test('[firestore] erp-aprovacoes: nobody deletes a decision', async () => {
  await assertFails(deleteDoc(doc(dbAs('adm2'), 'erp-aprovacoes', 'erp.estoques')));
  await assertFails(deleteDoc(doc(dbAs('editar'), 'erp-aprovacoes', 'erp.estoques')));
});
