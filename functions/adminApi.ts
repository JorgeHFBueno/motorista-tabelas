import express from 'express';
import cors from 'cors';
import { admin } from './firebaseAdmin.js';
import { adminAuthMiddleware, AdminRequest } from './adminAuth.js';

const adminApp = express();
const authorizedCollection = admin.firestore().collection('00-autorizados');

// TODO: restrict origin once hosting domain is finalized.
adminApp.use(cors({ origin: true }));
adminApp.use(express.json());

// Protect all admin routes with the middleware that checks the isAdmin custom claim.
adminApp.use('/api/admin', adminAuthMiddleware);

// GET /api/admin/users - list up to 1000 users for admin UI
adminApp.get('/api/admin/users', async (_req, res) => {
  try {
    const list = await admin.auth().listUsers(1000);
    const users = list.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      providerId: user.providerData[0]?.providerId ?? 'password',
      createdAt: user.metadata.creationTime,
      lastLoginAt: user.metadata.lastSignInTime,
    }));

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
    const userRecord = await admin.auth().createUser({
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
    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password: passwordValue,
      displayName: authorization.payload.nome,
    });
    createdUid = userRecord.uid;

    await authorizedCollection.doc(normalizedEmail).set({
      ...authorization.payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        await admin.auth().deleteUser(createdUid);
      } catch (rollbackError) {
        console.error('Failed to rollback user creation after authorization write error', rollbackError);
      }
    }

    console.error('Failed to register authorized user', err);
    res.status(400).json({ error: err?.code ?? err?.message ?? 'register_user_failed' });
  }
});

// DELETE /api/admin/users/:uid - destructive admin-only action
adminApp.delete('/api/admin/users/:uid', async (req, res) => {
  const { uid } = req.params;

  try {
    await admin.auth().deleteUser(uid);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to delete user', err);
    const status = err?.code === 'auth/user-not-found' ? 404 : 400;
    res.status(status).json({ error: err?.code ?? 'delete_user_failed' });
  }
});

// Quick manual-test tip: deploy with "firebase deploy --only functions,hosting" and
// use the Cadastros page while logged in as an admin (isAdmin claim) to verify list/create/delete.
export default adminApp;
