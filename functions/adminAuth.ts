import { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from './firebaseAdmin.js';

type AuthorizationProfile = {
  exists: boolean;
  adm1: boolean;
  adm2: boolean;
};

const authorizedCollection = db.collection('00-autorizados');

function normalizeEmail(rawEmail: unknown) {
  return typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
}

export interface AdminRequest extends Request {
  // Attach decoded token after verification so handlers can inspect identity and permissions.
  user?: DecodedIdToken & { isAdmin?: boolean; admin?: boolean };
  authorization?: AuthorizationProfile;
}

// Middleware that verifies the Firebase ID token and enforces adm2 authorization in Firestore.
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

  const idToken = match[1];

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const normalizedEmail = normalizeEmail(decoded.email);

    if (!normalizedEmail) {
      res.status(401).json({ error: 'requester_missing_email' });
      return;
    }

    const authorizationDoc = await authorizedCollection.doc(normalizedEmail).get();
    const authorizationData = authorizationDoc.exists ? authorizationDoc.data() : null;
    const authorization = {
      exists: authorizationDoc.exists,
      adm1: authorizationData?.adm1 === true,
      adm2: authorizationData?.adm2 === true,
    };

    if (!authorization.adm2) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    req.user = {
      ...decoded,
      isAdmin: decoded.isAdmin === true || decoded.admin === true,
    };
    req.authorization = authorization;
    next();
  } catch (err: any) {
    console.error('verifyIdToken error', err);
    res.status(401).json({ error: err?.code === 'auth/id-token-expired' ? 'expired_token' : 'invalid_token' });
  }
}
