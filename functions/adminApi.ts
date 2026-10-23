import express from 'express';
import cors from 'cors';
import type { UserRecord } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminAuth, db } from './firebaseAdmin.js';
import { adminAuthMiddleware, AdminRequest } from './adminAuth.js';
import { CREDENCIAIS, credenciaisDe, lerCredenciais, migrarPerfis, type Credenciais } from './credenciais.js';

// Users administration of the WEB (Cadastros), adm2 only. Contract: Manuscript funcionarios.md ("Credenciais",
// "Usuários na WEB"). Users are born only here; each one is an Auth account plus funcionarios/{uid}.
const adminApp = express();
const employeesCollection = db.collection('funcionarios');

// TODO: restrict origin once hosting domain is finalized.
adminApp.use(cors({ origin: true }));
adminApp.use(express.json());

// Protect all admin routes with Firebase Auth plus funcionarios/{uid}.perfis.adm2.
adminApp.use('/api/admin', adminAuthMiddleware);

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

// GET /api/admin/users - every Auth account (up to 1000), with its employee
adminApp.get('/api/admin/users', async (_req, res) => {
  try {
    const list = await adminAuth.listUsers(1000);
    const users = await Promise.all(list.users.map((user) => formatAdminUser(user)));
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
  const perfis = lerCredenciais(credenciais);
  if (typeof ativo !== 'boolean') { res.status(400).json({ error: 'invalid_ativo' }); return; }
  if (!perfis) { res.status(400).json({ error: 'invalid_credenciais' }); return; }
  if (uid === req.user?.uid && (!ativo || !perfis.adm2)) { res.status(400).json({ error: 'cannot_remove_own_adm2' }); return; }

  try {
    const employeeRef = employeesCollection.doc(uid);
    const employee = await employeeRef.get();
    if (!employee.exists) { res.status(404).json({ error: 'employee_not_found' }); return; }
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

// POST /api/admin/users/:uid/senha - new password set by adm2 (there is no "forgot my password"); ends every session.
adminApp.post('/api/admin/users/:uid/senha', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (password.length < 6) { res.status(400).json({ error: 'invalid_password' }); return; }
  try {
    await adminAuth.updateUser(uid, { password });
    await adminAuth.revokeRefreshTokens(uid);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to set password', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'set_password_failed' });
  }
});

// DELETE /api/admin/users/:uid - only accounts without an employee; an employee is deactivated, never deleted.
adminApp.delete('/api/admin/users/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    if ((await employeesCollection.doc(uid).get()).exists) { res.status(409).json({ error: 'employee_exists' }); return; }
    await adminAuth.deleteUser(uid);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete user', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'delete_user_failed' });
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
