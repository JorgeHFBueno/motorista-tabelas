import { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from './firebaseAdmin.js';
import {
  createAdminAuthorizationReader,
  type AdminAuthorization,
} from './adminAuthorization.js';

const employeesCollection = db.collection('funcionarios');
const readAdminAuthorization = createAdminAuthorizationReader(async (uid) => {
  const snapshot = await employeesCollection.doc(uid).get();
  return snapshot.exists ? snapshot.data() : undefined;
});

export interface AdminRequest extends Request {
  user?: DecodedIdToken & { isAdmin?: boolean; admin?: boolean };
  authorization?: AdminAuthorization;
}

// Firebase Auth proves identity; funcionarios/{auth.uid} grants adm2 access.
export async function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.*)$/);

  if (!match) {
    res.status(401).json({ error: 'missing_authorization' });
    return;
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(match[1]);
  } catch (err: any) {
    console.error('verifyIdToken error', err);
    res.status(401).json({ error: err?.code === 'auth/id-token-expired' ? 'expired_token' : 'invalid_token' });
    return;
  }

  try {
    const authorization = await readAdminAuthorization(decoded.uid);
    if (!authorization.ativo || !authorization.adm2) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    req.user = {
      ...decoded,
      isAdmin: decoded.isAdmin === true || decoded.admin === true,
    };
    req.authorization = authorization;
    next();
  } catch (err) {
    console.error('funcionario authorization read error', err);
    res.status(503).json({ error: 'authorization_unavailable' });
  }
}
