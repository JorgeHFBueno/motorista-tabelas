import { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from './firebaseAdmin.js';
import {
  autorizaArea,
  createAdminAuthorizationReader,
  type AdminAuthorization,
} from './adminAuthorization.js';
import type { Area, Nivel } from './credenciais.js';

const employeesCollection = db.collection('funcionarios');
const readAdminAuthorization = createAdminAuthorizationReader(async (uid) => {
  const snapshot = await employeesCollection.doc(uid).get();
  return snapshot.exists ? snapshot.data() : undefined;
});

export interface AdminRequest extends Request {
  user?: DecodedIdToken & { isAdmin?: boolean; admin?: boolean };
  authorization?: AdminAuthorization;
}

// Firebase Auth proves identity; funcionarios/{auth.uid} grants access. Each group of endpoints asks for its WEB
// area at a level ('ver' or 'editar'); adm2 always enters (no area: adm2 only).
export function exigirArea(area: Area | undefined, nivel: Nivel) {
  return (req: AdminRequest, res: Response, next: NextFunction) => autorizar(req, res, next, area, nivel);
}

async function autorizar(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
  area: Area | undefined,
  nivel: Nivel,
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
    if (!autorizaArea(authorization, area, nivel)) {
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
