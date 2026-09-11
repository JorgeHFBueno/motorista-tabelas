import express from 'express';
import cors from 'cors';
import type { UserRecord } from 'firebase-admin/auth';
import {
  type DocumentSnapshot,
  type DocumentData,
  FieldValue,
} from 'firebase-admin/firestore';

import { adminAuth, db } from './firebaseAdmin.js';
import { adminAuthMiddleware, AdminRequest } from './adminAuth.js';
import {
  buildFuncionario,
  classifyConciliation,
  normalizeName,
} from './conciliation.js';

const adminApp = express();
const authorizedCollection = db.collection('00-autorizados');
const motoristsCollection = db.collection('motoristas');
const employeesCollection = db.collection('funcionarios');

// TODO: restrict origin once hosting domain is finalized.
adminApp.use(cors({ origin: true }));
adminApp.use(express.json());

// Protect all admin routes with the middleware that checks a valid ID token plus adm2 in 00-autorizados.
adminApp.use('/api/admin', adminAuthMiddleware);

type PerfilUsuario = 'Motorista' | 'Adm1' | 'Adm2';

type AuthorizedUserData = {
  nome?: string;
  adm1?: boolean;
  adm2?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type EmployeeProfiles = { adm1: boolean; adm2: boolean; user: boolean; motorista: boolean };

function canonicalEmployee(nome: string, email: string, ativo: boolean, profiles: EmployeeProfiles, ordem?: number) {
  return {
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    ativo,
    perfis: profiles,
    ...(profiles.motorista ? { motorista: { ordem: typeof ordem === 'number' ? ordem : 0 } } : {}),
  };
}

function normalizeEmail(rawEmail: unknown) {
  return typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
}

function inferProfile(data?: AuthorizedUserData | null): PerfilUsuario {
  if (data?.adm2 === true) {
    return 'Adm2';
  }

  if (data?.adm1 === true) {
    return 'Adm1';
  }

  return 'Motorista';
}

async function formatAdminUser(
  user: UserRecord,
  authorizationDoc?: DocumentSnapshot<DocumentData> | null,
) {
  const authorizationData = authorizationDoc?.exists
    ? (authorizationDoc.data() as AuthorizedUserData)
    : null;

  const employeeDoc = await employeesCollection.doc(user.uid).get();
  const employeeData = employeeDoc.exists ? employeeDoc.data() : null;
  const canonicalProfiles = employeeData?.perfis;
  const canonicalProfile = canonicalProfiles?.adm2 === true ? 'Adm2' : canonicalProfiles?.adm1 === true ? 'Adm1' : 'Motorista';
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    providerId: user.providerData[0]?.providerId ?? 'password',
    createdAt: user.metadata.creationTime,
    lastLoginAt: user.metadata.lastSignInTime,
    disabled: user.disabled,
    authorization: {
      exists: Boolean(authorizationDoc?.exists || employeeDoc.exists),
      nome: employeeData?.nome ?? authorizationData?.nome ?? null,
      adm1: canonicalProfiles ? canonicalProfiles.adm1 === true : authorizationData?.adm1 === true,
      adm2: canonicalProfiles ? canonicalProfiles.adm2 === true : authorizationData?.adm2 === true,
      profile: employeeDoc.exists ? canonicalProfile : inferProfile(authorizationData),
    },
    funcionario: employeeData,
  };
}

// GET /api/admin/users - list up to 1000 users for admin UI
adminApp.get('/api/admin/users', async (_req, res) => {
  try {
    const list = await adminAuth.listUsers(1000);

    const authorizationRefs = list.users
      .map((user) => normalizeEmail(user.email))
      .filter(Boolean)
      .map((email) => authorizedCollection.doc(email));

    const authorizationSnapshots = authorizationRefs.length > 0
      ? await db.getAll(...authorizationRefs)
      : [];

    const authorizationByEmail = new Map(
      authorizationSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );

    const users = await Promise.all(list.users.map((user) => formatAdminUser(
      user,
      user.email ? authorizationByEmail.get(normalizeEmail(user.email)) ?? null : null,
    )));

    res.json({ users });
  } catch (err) {
    console.error('Failed to list users', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/users - create new Auth user with optional UID override
adminApp.post('/api/admin/users', async (req: AdminRequest, res) => {
  const { email, password, displayName, uid } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ error: 'missing_email_or_password' });
    return;
  }

  try {
    const userRecord = await adminAuth.createUser({
      uid,
      email,
      password,
      displayName,
    });

    res.status(201).json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        providerId: userRecord.providerData[0]?.providerId ?? 'password',
        createdAt: userRecord.metadata.creationTime,
        lastLoginAt: userRecord.metadata.lastSignInTime,
      },
    });
  } catch (err: any) {
    console.error('Failed to create user', err);
    res.status(400).json({ error: err?.code ?? 'create_user_failed' });
  }
});

function normalizeAuthorizedEmail(rawEmail: unknown, celular: unknown) {
  const baseEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const useCelular = celular === true;

  if (!baseEmail) {
    return '';
  }

  if (!useCelular) {
    return baseEmail;
  }

  return baseEmail.endsWith('@example.com') ? baseEmail : `${baseEmail}@example.com`;
}

function buildAuthorizationPayload(nome: unknown, perfil: unknown) {
  const normalizedNome = typeof nome === 'string' ? nome.trim() : '';

  if (!normalizedNome) {
    return { error: 'missing_nome' as const };
  }

  if (perfil === 'Motorista') {
    return { payload: { nome: normalizedNome, adm1: false } };
  }

  if (perfil === 'Adm1') {
    return { payload: { nome: normalizedNome, adm1: true } };
  }

  if (perfil === 'Adm2') {
    return { payload: { nome: normalizedNome, adm2: true } };
  }

  return { error: 'invalid_perfil' as const };
}

function resolveAuthorizationName(
  userRecord: UserRecord,
  authorizationData?: AuthorizedUserData | null,
) {
  const authDisplayName = typeof userRecord.displayName === 'string'
    ? userRecord.displayName.trim()
    : '';

  if (authDisplayName) {
    return authDisplayName;
  }

  const authorizationName = typeof authorizationData?.nome === 'string'
    ? authorizationData.nome.trim()
    : '';

  if (authorizationName) {
    return authorizationName;
  }

  const normalizedEmail = normalizeEmail(userRecord.email);
  if (normalizedEmail) {
    return normalizedEmail.split('@')[0];
  }

  return userRecord.uid;
}

adminApp.post('/api/admin/users/register', async (req: AdminRequest, res) => {
  const { nome, email, password, perfil, celular } = req.body ?? {};
  const normalizedEmail = normalizeAuthorizedEmail(email, celular);
  const passwordValue = typeof password === 'string' ? password.trim() : '';
  const authorization = buildAuthorizationPayload(nome, perfil);

  if (!normalizedEmail) {
    res.status(400).json({ error: 'missing_email' });
    return;
  }

  if (!passwordValue) {
    res.status(400).json({ error: 'missing_password' });
    return;
  }

  if ('error' in authorization) {
    res.status(400).json({ error: authorization.error });
    return;
  }

  let createdUid: string | null = null;
  let reusedExistingAuth = false;

  try {
    let userRecord: UserRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: normalizedEmail,
        password: passwordValue,
        displayName: authorization.payload.nome,
      });
      createdUid = userRecord.uid;
    } catch (createError: any) {
      if (createError?.code !== 'auth/email-already-exists') throw createError;
      // Existing Auth accounts are provisioned by UID; the supplied password is never changed.
      userRecord = await adminAuth.getUserByEmail(normalizedEmail);
      reusedExistingAuth = true;
    }

    const existingEmployee = await employeesCollection.doc(userRecord.uid).get();
    if (existingEmployee.exists) {
      res.status(409).json({ error: 'employee_already_exists' });
      return;
    }
    if (reusedExistingAuth) await adminAuth.updateUser(userRecord.uid, { displayName: authorization.payload.nome });
    await employeesCollection.doc(userRecord.uid).set({
      ...canonicalEmployee(authorization.payload.nome, normalizedEmail, true, {
        adm1: authorization.payload.adm1 === true,
        adm2: authorization.payload.adm2 === true,
        user: false,
        motorista: perfil === 'Motorista',
      }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
      funcionarioDocumentId: userRecord.uid,
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

adminApp.patch('/api/admin/users/:uid', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const { disabled, perfil } = req.body ?? {};

  if (typeof disabled !== 'boolean') {
    res.status(400).json({ error: 'invalid_disabled' });
    return;
  }

  if (perfil !== 'Motorista' && perfil !== 'Adm1' && perfil !== 'Adm2') {
    res.status(400).json({ error: 'invalid_perfil' });
    return;
  }

  try {
    const userRecord = await adminAuth.getUser(uid);
    const normalizedEmail = normalizeEmail(userRecord.email);
    if (!normalizedEmail) { res.status(400).json({ error: 'missing_email' }); return; }
    const employeeRef = employeesCollection.doc(uid);
    const existingEmployeeDoc = await employeeRef.get();
    const existingEmployee = existingEmployeeDoc.exists ? existingEmployeeDoc.data() : null;
    const currentName = typeof existingEmployee?.nome === 'string' && existingEmployee.nome.trim()
      ? existingEmployee.nome.trim() : resolveAuthorizationName(userRecord, null);
    const profiles = {
      adm1: perfil === 'Adm1', adm2: perfil === 'Adm2', user: false, motorista: perfil === 'Motorista',
    };
    await adminAuth.updateUser(uid, { disabled, displayName: currentName });
    await employeeRef.set({
      ...canonicalEmployee(currentName, normalizedEmail, !disabled, profiles, existingEmployee?.motorista?.ordem),
      createdAt: existingEmployee?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updatedUser = await adminAuth.getUser(uid);
    res.json({
      user: await formatAdminUser(updatedUser, null),
    });
  } catch (err: any) {
    console.error('Failed to update user', err);
    const status = err?.code === 'auth/user-not-found' ? 404 : 400;
    res.status(status).json({ error: err?.code ?? err?.message ?? 'update_user_failed' });
  }
});

// Read-only inventory for manual reconciliation. It never writes legacy collections or Auth.
adminApp.get('/api/admin/conciliation', async (_req, res) => {
  try {
    const authUsers = (await adminAuth.listUsers(1000)).users;
    const authorizedRefs = authUsers.map((user) => normalizeEmail(user.email) ? authorizedCollection.doc(normalizeEmail(user.email)) : null);
    const authorizedSnapshots = await Promise.all(authorizedRefs.map((ref) => ref ? ref.get() : Promise.resolve(null)));
    const motoristSnapshots = await motoristsCollection.get();
    const employeeSnapshots = await db.getAll(...authUsers.map((user) => employeesCollection.doc(user.uid)));
    const rows: Array<Record<string, any>> = authUsers.map((user, index) => {
      const authorized = authorizedSnapshots[index];
      const authName = user.displayName ?? authorized?.data()?.nome ?? user.email ?? user.uid;
      const suggestions = motoristSnapshots.docs.filter((motorist) => normalizeName(motorist.data().nome) === normalizeName(authName));
      const motorista = suggestions.length === 1 ? suggestions[0] : null;
      const employee = employeeSnapshots[index];
      return {
        auth: { uid: user.uid, email: user.email ?? '', nome: authName, disabled: user.disabled },
        autorizado: authorized?.exists ? { id: authorized.id, ...authorized.data() } : null,
        motorista: motorista ? { id: motorista.id, ...motorista.data() } : null,
        sugestoesMotorista: suggestions.map((item) => ({ id: item.id, ...item.data() })),
        funcionario: employee.exists ? employee.data() : null,
        status: classifyConciliation({
          auth: true,
          authorized: Boolean(authorized?.exists),
          motorist: Boolean(motorista),
          motoristCandidates: suggestions.length,
          employee: employee.exists,
        }),
      };
    });
    const matchedMotorists = new Set(rows.flatMap((row) => (row.sugestoesMotorista as Array<{ id: string }>).map((item) => item.id)));
    for (const motorist of motoristSnapshots.docs) {
      if (!matchedMotorists.has(motorist.id)) rows.push({ auth: null, autorizado: null, motorista: { id: motorist.id, ...motorist.data() }, sugestoesMotorista: [], funcionario: null, status: 'SEM_AUTH' });
    }
    res.json({ rows });
  } catch (err) {
    console.error('Failed to list reconciliation candidates', err);
    res.status(500).json({ error: 'conciliation_list_failed' });
  }
});

adminApp.post('/api/admin/conciliation/:uid', async (req: AdminRequest, res) => {
  const { uid } = req.params;
  const { motoristaId, nome, ativo, perfis, allowExisting } = req.body ?? {};
  if (!uid || typeof nome !== 'string' || !nome.trim() || typeof ativo !== 'boolean' || !perfis || typeof perfis !== 'object') { res.status(400).json({ error: 'invalid_employee' }); return; }
  try {
    const authUser = await adminAuth.getUser(uid);
    const email = normalizeEmail(authUser.email);
    if (!email) { res.status(400).json({ error: 'missing_email' }); return; }
    const employeeRef = employeesCollection.doc(uid);
    const existing = await employeeRef.get();
    if (existing.exists && allowExisting !== true) { res.status(409).json({ error: 'employee_already_exists' }); return; }
    let motoristaData: DocumentData | null = null;
    if (motoristaId) {
      const motorista = await motoristsCollection.doc(motoristaId).get();
      if (!motorista.exists) { res.status(400).json({ error: 'motorist_not_found' }); return; }
      motoristaData = motorista.data() ?? null;
    }
    const safeProfiles = { adm1: perfis.adm1 === true, adm2: perfis.adm2 === true, user: false, motorista: Boolean(motoristaData) };
    const funcionario = buildFuncionario({
      nome,
      email,
      authDisabled: authUser.disabled,
      autorizado: { adm1: perfis.adm1 === true, adm2: perfis.adm2 === true },
      motorista: motoristaData,
      requestedAtivo: ativo,
    });
    await employeeRef.set({
      ...funcionario,
      perfis: { ...safeProfiles, motorista: funcionario.perfis.motorista },
      createdAt: existing.get('createdAt') ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ uid, funcionario: (await employeeRef.get()).data() });
  } catch (err: any) {
    console.error('Failed to reconcile employee', err);
    res.status(err?.code === 'auth/user-not-found' ? 404 : 400).json({ error: err?.code ?? 'conciliation_failed' });
  }
});

// DELETE /api/admin/users/:uid - destructive admin-only action
adminApp.delete('/api/admin/users/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    await adminAuth.deleteUser(uid);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete user', err);
    const status = err?.code === 'auth/user-not-found' ? 404 : 400;
    res.status(status).json({ error: err?.code ?? 'delete_user_failed' });
  }
});

// Quick manual-test tip: deploy with "firebase deploy --only functions,hosting" and
// use the Cadastros page while logged in as an adm2 user to verify list/create/delete.
export default adminApp;
