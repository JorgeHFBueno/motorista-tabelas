import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { admin } from './firebaseAdmin.js';

initializeApp();
const db = getFirestore(admin.app());

interface AuthRequest extends Request {
  user?: DecodedIdToken & { admin?: boolean };
}

async function verifyIdToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const token = header.substring(7); // remove "Bearer "
    req.user = await getAuth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function verifyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.admin || req.user?.isAdmin) return next();
  res.status(403).json({ error: 'Forbidden' });
}

const app = express();
app.use(cors());
app.use(express.json());

// sub-router protegido
const router: Router = express.Router();
router.use(verifyIdToken);

const collection = db.collection('03-combustivel');

router.get('/combustivel', async (_req, res) => {
  try {
    const snap = await collection.get();
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to list' });
  }
});

router.get('/combustivel/:id', async (req, res) => {
  try {
    const doc = await collection.doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to get' });
  }
});

router.post('/combustivel', async (req: AuthRequest, res) => {
  try {
    const data = { ...req.body, uid: req.user?.uid };
    const ref = await collection.add(data);
    const doc = await ref.get();
    res.status(201).json({ id: ref.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.put('/combustivel/:id', async (req: AuthRequest, res) => {
  try {
    const ref = collection.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const original = snap.data();
    if (!req.user?.admin && original?.uid !== req.user?.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await ref.set(req.body, { merge: true });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch {
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/combustivel/:id', verifyAdmin, async (req, res) => {
  try {
    await collection.doc(req.params.id).delete();
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// monta prefixo /api uma única vez
app.use('/api', router);

export default app;
