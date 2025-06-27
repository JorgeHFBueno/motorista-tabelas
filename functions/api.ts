import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

export interface AuthRequest extends Request {
  user?: any;
}

export async function verifyIdToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.replace('Bearer ', '');
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function verifyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.admin) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(verifyIdToken);

const collection = db.collection('03-combustivel');

app.get('/combustivel', async (_req, res) => {
  try {
    const snap = await collection.get();
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list' });
  }
});

app.get('/combustivel/:id', async (req, res) => {
  try {
    const doc = await collection.doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get' });
  }
});

app.post('/combustivel', async (req, res) => {
  try {
    const ref = await collection.add(req.body);
    const doc = await ref.get();
    res.status(201).json({ id: ref.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create' });
  }
});

app.put('/combustivel/:id', async (req, res) => {
  try {
    await collection.doc(req.params.id).set(req.body, { merge: true });
    const doc = await collection.doc(req.params.id).get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

app.delete('/combustivel/:id', verifyAdmin, async (req, res) => {
  try {
    await collection.doc(req.params.id).delete();
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default app;