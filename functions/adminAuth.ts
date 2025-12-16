import { Request, Response, NextFunction } from 'express';
import { admin } from './firebaseAdmin.js';

export interface AdminRequest extends Request {
  // Attach decoded token after verification so handlers can inspect claims.
  user?: admin.auth.DecodedIdToken & { isAdmin?: boolean };
}

// Middleware that verifies the Firebase ID token and enforces the isAdmin claim.
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
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded.isAdmin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('verifyIdToken error', err);
    res.status(401).json({ error: 'invalid_token' });
  }
}