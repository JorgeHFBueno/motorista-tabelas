import express from 'express';
import cors from 'cors';
import type { UserRecord } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminAuth, db } from './firebaseAdmin.js';
import { exigirCredenciais, AdminRequest } from './adminAuth.js';
import { CREDENCIAIS, credenciaisDe, lerCredenciais, mesclarCredenciais, migrarPerfis, temCredencialSoAdm2, type Credencial, type Credenciais } from './credenciais.js';
import { lerNovoCliente } from './portalClientes.js';

// Users administration of the WEB (Cadastros), adm2 only. Contract: Manuscript funcionarios.md ("Credenciais",
// "Usuários na WEB"). Users are born here or, without a password, in the Friday import of monday people
// (fridayMondayPessoas); each one is an Auth account plus funcionarios/{uid}.
const adminApp = express();
const employeesCollection = db.collection('funcionarios');
// Client portal logins (Manuscript users.md): Auth account plus users/{uid}; a client is never an employee.
const clientsCollection = db.collection('users');

// TODO: restrict origin once hosting domain is finalized.
adminApp.use(cors({ origin: true }));
adminApp.use(express.json());

// Firebase Auth plus the credentials of each WEB area in funcionarios/{uid}.perfis, by the first segment after
// /api/admin (adm2 always enters): users (Cadastros) = escritorio; clientes (Portal do cliente) = engenharia,
// escritorio; anything else (maintenance) = adm2 only.
const CREDENCIAIS_DA_ROTA = new Map<string, Credencial[]>([['users', ['escritorio']], ['clientes', ['engenharia', 'escritorio']]]);
adminApp.use('/api/admin', (req: AdminRequest, res, next) =>
  exigirCredenciais(...(CREDENCIAIS_DA_ROTA.get(req.path.split('/')[1]) ?? []))(req, res, next));

const ehAdm2 = (req: AdminRequest) => req.authorization?.credenciais.adm2 === true;

const PHONE_LOGIN_DOMAIN = '@example.com';

function normalizeEmail(rawEmail: unknown) {
  return typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
}

function normalizeAuthorizedEmail(rawEmail: unknown, celular: unknown) {
  const baseEmail = normalizeEmail(rawEmail);
  if (!baseEmail || celular !== true) return baseEmail;
  return baseEmail.endsWith(PHONE_LOGIN_DOMAIN) ? baseEmail : `${baseEmail}${PHONE_LOGIN_DOMAIN}`;
}

const algumaCredencial = (c: Credenciais) => CREDENCIAIS.some((k) => c[k]);

const isoDe = (valor: unknown) => (valor instanceof Timestamp ? valor.toDate().toISOString() : null);

async function formatAdminUser(user: UserRecord) {
  const employeeDoc = await employeesCollection.doc(user.uid).get();
  const f = employeeDoc.exists ? employeeDoc.data() : undefined;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.metadata.creationTime,
    lastLoginAt: user.metadata.lastSignInTime,
    disabled: user.disabled,
    // null = account without an employee (for example, created by the old open sign-up).
    funcionario: f ? {
      nome: typeof f.nome === 'string' ? f.nome : null,
      email: typeof f.email === 'string' ? f.email : null,
      ativo: f.ativo === true,
      credenciais: credenciaisDe(f.perfis),
      ultimoAcesso: isoDe(f.ultimoAcesso),
    } : null,
  };
}

// GET /api/admin/users - every Auth account (up to 1000), with its employee. Client portal logins (users/{uid}
// without an employee) are left out: they are managed in the portal area (/api/admin/clientes).
adminApp.get('/api/admin/users', async (_req, res) => {
  try {
    const [list, clients] = await Promise.all([adminAuth.listUsers(1000), clientsCollection.select().get()]);
    const clientUids = new Set(clients.docs.map((d) => d.id));
    const users = (await Promise.all(list.users.map((user) => formatAdminUser(user))))
      .filter((user) => user.funcionario || !clientUids.has(user.uid));
    res.json({ users });
  } catch (err) {
    console.error('Failed to list users', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/users/register - Auth account + funcionarios/{uid} with the credentials
adminApp.post('/api/admin/users/register', async (req: AdminRequest, res) => {
  const { nome, email, password, credenciais, celular } = req.body ?? {};
  const normalizedNome = typeof nome === 'string' ? nome.trim() : '';
  const normalizedEmail = normalizeAuthorizedEmail(email, celular);
  const passwordValue = typeof password === 'string' ? password.trim() : '';
  const perfis = lerCredenciais(credenciais);

  if (!normalizedNome) { res.status(400).json({ error: 'missing_nome' }); return; }
  if (!normalizedEmail) { res.status(400).json({ error: 'missing_email' }); return; }
  if (!passwordValue) { res.status(400).json({ error: 'missing_password' }); return; }
  if (!perfis || !algumaCredencial(perfis)) { res.status(400).json({ error: 'invalid_credenciais' }); return; }
  if (!ehAdm2(req) && temCredencialSoAdm2(perfis)) { res.status(403).json({ error: 'forbidden_credencial' }); return; }

  let createdUid: string | null = null;
  let reusedExistingAuth = false;

  try {
    let userRecord: UserRecord;
    try {
      userRecord = await adminAuth.createUser({ email: normalizedEmail, password: passwordValue, displayName: normalizedNome });
      createdUid = userRecord.uid;
    } catch (createError: any) {
      if (createError?.code !== 'auth/email-already-exists') throw createError;
      // Existing Auth account without an employee: it is provisioned by UID (below).
      userRecord = await adminAuth.getUserByEmail(normalizedEmail);
      reusedExistingAuth = true;
    }

    const existingEmployee = await employeesCollection.doc(userRecord.uid).get();
    if (existingEmployee.exists) {
      res.status(409).json({ error: 'employee_already_exists' });
      return;
    }
    if (reusedExistingAuth && (await clientsCollection.doc(userRecord.uid).get()).exists) {
      res.status(409).json({ error: 'client_account' });
      return;
    }
    if (reusedExistingAuth) {
      // Whoever created the account before (for example, through the old open sign-up) may know its password:
      // the administrator's password replaces it, the account is enabled and every open session ends.
      await adminAuth.updateUser(userRecord.uid, { displayName: normalizedNome, password: passwordValue, disabled: false });
      await adminAuth.revokeRefreshTokens(userRecord.uid);
    }
    await employeesCollection.doc(userRecord.uid).set({
      nome: normalizedNome,
      email: normalizedEmail,
      ativo: true,
      perfis,
      ...(perfis.motorista ? { motorista: { ordem: 0 } } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      user: { uid: userRecord.uid, email: userRecord.email, displayName: userRecord.displayName },
      funcionarioDocumentId: userRecord.uid,
      contaExistente: reusedExistingAuth,
    });
  } catch (err: any) {
    if (createdUid) {
      try {
        await adminAuth.deleteUser(createdUid);
      } catch (rollbackError) {
        console.error('Failed to rollback user creation after authorization write error', rollbackError);
      }
    }
    console.error('Failed to register authorized user', err);
    res.status(400).json({ error: err?.code ?? err?.message ?? 'register_user_failed' });
  }
});

// PATCH /api/admin/users/:uid - credentials and situation of an employee. Name and login are not edited here:
// each person changes their own in Meu perfil.
adminApp.patch('/api/admin/users/:uid', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const { ativo, credenciais } = req.body ?? {};
  if (typeof ativo !== 'boolean') { res.status(400).json({ error: 'invalid_ativo' }); return; }
  if (!lerCredenciais(credenciais)) { res.status(400).json({ error: 'invalid_credenciais' }); return; }

  try {
    const employeeRef = employeesCollection.doc(uid);
    const employee = await employeeRef.get();
    if (!employee.exists) { res.status(404).json({ error: 'employee_not_found' }); return; }
    // Credentials left out of the request keep their current value.
    const perfis = mesclarCredenciais(employee.get('perfis'), credenciais)!;
    if (uid === req.user?.uid && (!ativo || !(ehAdm2(req) ? perfis.adm2 : perfis.escritorio))) {
      res.status(400).json({ error: ehAdm2(req) ? 'cannot_remove_own_adm2' : 'cannot_remove_own_access' });
      return;
    }
    if (!ehAdm2(req) && temCredencialSoAdm2(credenciaisDe(employee.get('perfis')))) { res.status(403).json({ error: 'protected_account' }); return; }
    if (!ehAdm2(req) && temCredencialSoAdm2(perfis)) { res.status(403).json({ error: 'forbidden_credencial' }); return; }
    await adminAuth.updateUser(uid, { disabled: !ativo });
    await employeeRef.update({
      ativo,
      perfis,
      ...(perfis.motorista && employee.get('motorista') == null ? { motorista: { ordem: 0 } } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ user: await formatAdminUser(await adminAuth.getUser(uid)) });
  } catch (err: any) {
    console.error('Failed to update user', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? err?.message ?? 'update_user_failed' });
  }
});

// POST /api/admin/users/:uid/senha - new password set in Cadastros (there is no "forgot my password"); ends every
// session. Only adm2 sets the password of an account holding adm2 or retr0.
adminApp.post('/api/admin/users/:uid/senha', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (password.length < 6) { res.status(400).json({ error: 'invalid_password' }); return; }
  try {
    if (!ehAdm2(req) && temCredencialSoAdm2(credenciaisDe((await employeesCollection.doc(uid).get()).get('perfis')))) {
      res.status(403).json({ error: 'protected_account' });
      return;
    }
    await adminAuth.updateUser(uid, { password });
    await adminAuth.revokeRefreshTokens(uid);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to set password', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'set_password_failed' });
  }
});

// DELETE /api/admin/users/:uid - only accounts without an employee; an employee is deactivated, never deleted.
// A client portal login is not deleted either: it is deactivated in /api/admin/clientes/:uid.
adminApp.delete('/api/admin/users/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    if ((await employeesCollection.doc(uid).get()).exists) { res.status(409).json({ error: 'employee_exists' }); return; }
    if ((await clientsCollection.doc(uid).get()).exists) { res.status(409).json({ error: 'client_account' }); return; }
    await adminAuth.deleteUser(uid);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete user', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'delete_user_failed' });
  }
});

// POST /api/admin/clientes - client portal login: Auth account (displayName = nome) + users/{uid}. An Auth account
// with this login that is neither an employee nor a client (for example, from the old open sign-up) is reused like in
// /users/register: the administrator's password replaces its own, it is enabled and every open session ends.
adminApp.post('/api/admin/clientes', async (req: AdminRequest, res) => {
  const lido = lerNovoCliente(req.body);
  if ('erro' in lido) { res.status(400).json({ error: lido.erro }); return; }
  const { nome, email, password, documentos } = lido.cliente;

  let createdUid: string | null = null;
  let contaExistente = false;
  try {
    let userRecord: UserRecord;
    try {
      userRecord = await adminAuth.createUser({ email, password, displayName: nome });
      createdUid = userRecord.uid;
    } catch (createError: any) {
      if (createError?.code !== 'auth/email-already-exists') throw createError;
      userRecord = await adminAuth.getUserByEmail(email);
      contaExistente = true;
    }

    const [employee, client] = await Promise.all([
      employeesCollection.doc(userRecord.uid).get(),
      clientsCollection.doc(userRecord.uid).get(),
    ]);
    if (employee.exists) { res.status(409).json({ error: 'employee_account' }); return; }
    if (client.exists) { res.status(409).json({ error: 'client_already_exists' }); return; }
    if (contaExistente) {
      await adminAuth.updateUser(userRecord.uid, { displayName: nome, password, disabled: false });
      await adminAuth.revokeRefreshTokens(userRecord.uid);
    }

    const criadorUid = req.user?.uid ?? '';
    const criadorNome = (await employeesCollection.doc(criadorUid).get()).get('nome');
    await clientsCollection.doc(userRecord.uid).create({
      nome,
      email,
      documentos,
      ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
      criadoPor: {
        uid: criadorUid,
        nome: (typeof criadorNome === 'string' && criadorNome.trim()) || req.user?.name || req.user?.email || 'Equipe Ledur',
      },
    });

    res.status(201).json({ uid: userRecord.uid, contaExistente });
  } catch (err: any) {
    if (createdUid) {
      try {
        await adminAuth.deleteUser(createdUid);
      } catch (rollbackError) {
        console.error('Failed to rollback client account after users write error', rollbackError);
      }
    }
    console.error('Failed to create client', err);
    res.status(400).json({ error: err?.code ?? err?.message ?? 'create_client_failed' });
  }
});

// PATCH /api/admin/clientes/:uid - activates or deactivates a client: Auth disabled plus users.ativo; deactivating
// ends every open session. Name and CNPJ/CPF are written by the team (engenharia, escritorio, adm2) straight in Firestore (the Rules allow it).
adminApp.patch('/api/admin/clientes/:uid', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const { ativo } = req.body ?? {};
  if (typeof ativo !== 'boolean') { res.status(400).json({ error: 'invalid_ativo' }); return; }
  try {
    const clientRef = clientsCollection.doc(uid);
    const [client, employee] = await Promise.all([clientRef.get(), employeesCollection.doc(uid).get()]);
    if (!client.exists) { res.status(404).json({ error: 'client_not_found' }); return; }
    if (employee.exists) { res.status(409).json({ error: 'employee_account' }); return; }
    await adminAuth.updateUser(uid, { disabled: !ativo });
    if (!ativo) await adminAuth.revokeRefreshTokens(uid);
    await clientRef.update({ ativo, atualizadoEm: FieldValue.serverTimestamp() });
    res.json({ uid, ativo });
  } catch (err: any) {
    console.error('Failed to update client', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? err?.message ?? 'update_client_failed' });
  }
});

// POST /api/admin/clientes/:uid/senha - new password of a client portal login (Portal do cliente: engenharia,
// escritorio, adm2); ends every open session. Only client accounts: an employee's password is set in Cadastros.
adminApp.post('/api/admin/clientes/:uid/senha', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (password.length < 6) { res.status(400).json({ error: 'invalid_password' }); return; }
  try {
    const [client, employee] = await Promise.all([clientsCollection.doc(uid).get(), employeesCollection.doc(uid).get()]);
    if (!client.exists) { res.status(404).json({ error: 'client_not_found' }); return; }
    if (employee.exists) { res.status(409).json({ error: 'employee_account' }); return; }
    await adminAuth.updateUser(uid, { password });
    await adminAuth.revokeRefreshTokens(uid);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to set client password', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'set_password_failed' });
  }
});

// POST /api/admin/manutencao/credenciais - data migration of the switch: frentista = frentista || adm1; adm1 and user
// leave the documents. { executar: false } only counts (simulation); { executar: true } writes.
adminApp.post('/api/admin/manutencao/credenciais', async (req: AdminRequest, res) => {
  const executar = req.body?.executar === true;
  try {
    const snap = await employeesCollection.get();
    const mudancas = snap.docs.map((d) => ({ ref: d.ref, ...migrarPerfis(d.get('perfis')) })).filter((m) => m.mudou);
    if (executar) {
      for (let k = 0; k < mudancas.length; k += 400) {
        const lote = db.batch();
        for (const m of mudancas.slice(k, k + 400)) lote.update(m.ref, { perfis: m.perfis, updatedAt: FieldValue.serverTimestamp() });
        await lote.commit();
      }
      console.info('credenciais:migracao', { por: req.user?.uid, alterados: mudancas.length });
    }
    res.json({
      executado: executar,
      funcionarios: snap.size,
      alterados: mudancas.length,
      frentistas: mudancas.filter((m) => m.perfis.frentista).length,
    });
  } catch (err) {
    console.error('Failed to migrate credentials', err);
    res.status(500).json({ error: 'migration_failed' });
  }
});

export default adminApp;
