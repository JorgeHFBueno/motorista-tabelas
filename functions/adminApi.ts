import express from 'express';
import cors from 'cors';
import { admin } from './firebaseAdmin.js';
import { adminAuthMiddleware, AdminRequest } from './adminAuth.js';

const adminApp = express();

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