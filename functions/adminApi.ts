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

const adminApp = express();
const authorizedCollection = db.collection('00-autorizados');

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

function formatAdminUser(
  user: UserRecord,
  authorizationDoc?: DocumentSnapshot<DocumentData> | null,
) {
  const authorizationData = authorizationDoc?.exists
    ? (authorizationDoc.data() as AuthorizedUserData)
    : null;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    providerId: user.providerData[0]?.providerId ?? 'password',
    createdAt: user.metadata.creationTime,
    lastLoginAt: user.metadata.lastSignInTime,
    disabled: user.disabled,
    authorization: {
      exists: Boolean(authorizationDoc?.exists),
      nome: authorizationData?.nome ?? null,
      adm1: authorizationData?.adm1 === true,
      adm2: authorizationData?.adm2 === true,
      profile: inferProfile(authorizationData),
    },
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

    const users = list.users.map((user) => formatAdminUser(
      user,
      user.email ? authorizationByEmail.get(normalizeEmail(user.email)) ?? null : null,
    ));

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

  try {
    const userRecord = await adminAuth.createUser({
      email: normalizedEmail,
      password: passwordValue,
      displayName: authorization.payload.nome,
    });

    createdUid = userRecord.uid;

    await authorizedCollection.doc(normalizedEmail).set({
      ...authorization.payload,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      },
      authorizationDocumentId: normalizedEmail,
      authorizationPayload: authorization.payload,
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

    if (!normalizedEmail) {
      res.status(400).json({ error: 'missing_email' });
      return;
    }

    const authorizationRef = authorizedCollection.doc(normalizedEmail);
    const existingAuthorizationDoc = await authorizationRef.get();
    const existingAuthorizationData = existingAuthorizationDoc.exists
      ? (existingAuthorizationDoc.data() as AuthorizedUserData)
      : null;

    const resolvedName = resolveAuthorizationName(userRecord, existingAuthorizationData);
    const authorization = buildAuthorizationPayload(resolvedName, perfil);

    if ('error' in authorization) {
      res.status(400).json({ error: authorization.error });
      return;
    }

    await adminAuth.updateUser(uid, { disabled });

    try {
      await authorizationRef.set({
        ...authorization.payload,
        adm1: perfil === 'Adm2' ? FieldValue.delete() : authorization.payload.adm1,
        adm2: perfil === 'Adm2' ? true : FieldValue.delete(),
        createdAt: existingAuthorizationDoc.exists
          ? existingAuthorizationDoc.get('createdAt') ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (firestoreError) {
      try {
        await adminAuth.updateUser(uid, { disabled: userRecord.disabled });
      } catch (rollbackError) {
        console.error('Failed to rollback auth update after authorization write error', rollbackError);
      }

      throw firestoreError;
    }

    const updatedUser = await adminAuth.getUser(uid);
    const updatedAuthorizationDoc = await authorizationRef.get();

    res.json({
      user: formatAdminUser(updatedUser, updatedAuthorizationDoc),
    });
  } catch (err: any) {
    console.error('Failed to update user', err);
    const status = err?.code === 'auth/user-not-found' ? 404 : 400;
    res.status(status).json({ error: err?.code ?? err?.message ?? 'update_user_failed' });
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
