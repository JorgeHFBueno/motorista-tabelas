import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
const router = express.Router();

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
app.use((req, _res, next) => {
  console.log('PATH CHEGOU:', req.path);
  next();
});
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
const data = { ...req.body, uid: req.user?.uid };
    const ref = await collection.add(data);
    const doc = await ref.get();
    res.status(201).json({ id: ref.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create' });
  }
});

app.put('/combustivel/:id', async (req, res) => {
  try {
    const ref = collection.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const data = snap.data();
    if (!req.user?.admin && data?.uid !== req.user?.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await ref.set(req.body, { merge: true });
    const doc = await ref.get();
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

router.use(verifyIdToken);

app.use('/api', router);
export default app;