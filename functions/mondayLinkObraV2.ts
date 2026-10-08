import express from 'express';
import cors from 'cors';
import { onRequest } from 'firebase-functions/v2/https';
import { adminAuthMiddleware, type AdminRequest } from './adminAuth.js';
import { db } from './firebaseAdmin.js';

type AnyRecord = Record<string, any>;
type FirestoreLike = any;
export type LinkResult = 'UPDATED' | 'NO_CHANGE';
export type CreateAndLinkResult = { result: 'CREATED_AND_LINKED'; obraV2Id: string; obra: Record<string, unknown> };

export class LinkError extends Error {
  constructor(readonly code: string, readonly httpStatus: number) { super(code); }
}

export function mondayRow(id: string, data: AnyRecord) {
  const raw = data?.raw ?? {};
  return { documentId: id, nome: raw.nome ?? null, numeroContrato: raw.numeroContrato ?? null, empresa: raw.empresa ?? null, status: raw.status ?? null, tipoObra: raw.tipoObra ?? null, obraV2Id: typeof data?.obraV2Id === 'string' ? data.obraV2Id : null, raw };
}

export function obraV2Row(id: string, data: AnyRecord) {
  return { documentId: id, codObra: data?.codObra ?? null, siglaObra: data?.siglaObra ?? null, nomeObra: data?.nomeObra ?? null, local: data?.local ?? null, status: data?.status ?? null, data };
}

export function normalizeObraV2Date(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text;
}

export function composeObraV2Name(name: unknown, contract: unknown): string {
  const base = String(name ?? '').trim();
  const value = String(contract ?? '').trim();
  if (!base) return value;
  if (!value) return base;
  const digits = value.replace(/^0+/, '') || '0';
  return new RegExp(`(^|\\D)0*${digits}(\\D|$)`).test(base) ? base : `${base} ${value}`;
}

export function obraV2FromMonday(data: AnyRecord): Record<string, unknown> {
  const raw = data?.raw;
  const nome = typeof raw?.nome === 'string' ? raw.nome.trim() : '';
  if (!nome) throw new LinkError('monday_missing_required_fields', 422);
  const date = normalizeObraV2Date(raw.inicio);
  return {
    codObra: 0,
    nomeObra: composeObraV2Name(nome, raw.numeroContrato),
    siglaObra: nome,
    local: 'CORRIGIR',
    status: 'CONTRATADA',
    dataInicial: date,
    dataFinal: date,
  };
}

export async function listObras(firestore: FirestoreLike = db) {
  const [mondaySnapshot, obrasSnapshot] = await Promise.all([
    firestore.collection('monday-obras').get(),
    firestore.collection('obras-v2').get(),
  ]);
  return {
    monday: mondaySnapshot.docs.map((doc: any) => mondayRow(doc.id, doc.data())),
    obrasV2: obrasSnapshot.docs.map((doc: any) => obraV2Row(doc.id, doc.data())),
  };
}

export async function linkObraV2(mondayItemId: string, obraV2Id: string, firestore: FirestoreLike = db): Promise<LinkResult> {
  if (!/^\d+$/.test(mondayItemId) || !obraV2Id.trim()) throw new LinkError('invalid_request', 400);
  return firestore.runTransaction(async (transaction: any) => {
    const mondayRef = firestore.collection('monday-obras').doc(mondayItemId);
    const obraRef = firestore.collection('obras-v2').doc(obraV2Id);
    const [mondaySnapshot, obraSnapshot] = await Promise.all([transaction.get(mondayRef), transaction.get(obraRef)]);
    if (!mondaySnapshot.exists) throw new LinkError('monday_not_found', 404);
    if (!obraSnapshot.exists) throw new LinkError('obra_v2_not_found', 404);

    const current = mondaySnapshot.get('obraV2Id');
    if (typeof current === 'string' && current === obraV2Id) return 'NO_CHANGE';
    if (typeof current === 'string' && current.trim()) throw new LinkError('monday_already_linked', 409);

    const existingQuery = firestore.collection('monday-obras').where('obraV2Id', '==', obraV2Id).limit(2);
    const existingSnapshot = await transaction.get(existingQuery);
    const other = existingSnapshot.docs.find((doc: any) => doc.id !== mondayItemId);
    if (other) throw new LinkError('obra_v2_already_linked', 409);

    transaction.update(mondayRef, { obraV2Id: obraV2Id });
    return 'UPDATED';
  });
}

export async function createAndLinkObraV2(mondayItemId: string, firestore: FirestoreLike = db): Promise<CreateAndLinkResult> {
  if (!/^\d+$/.test(mondayItemId)) throw new LinkError('invalid_request', 400);
  return firestore.runTransaction(async (transaction: any) => {
    const mondayRef = firestore.collection('monday-obras').doc(mondayItemId);
    const mondaySnapshot = await transaction.get(mondayRef);
    if (!mondaySnapshot.exists) throw new LinkError('monday_not_found', 404);
    const current = mondaySnapshot.get('obraV2Id');
    if (typeof current === 'string' && current.trim()) throw new LinkError('already_linked', 409);

    const obra = obraV2FromMonday(mondaySnapshot.data?.() ?? {});
    const obraRef = firestore.collection('obras-v2').doc();
    transaction.create(obraRef, obra);
    transaction.update(mondayRef, { obraV2Id: obraRef.id });
    return { result: 'CREATED_AND_LINKED', obraV2Id: obraRef.id, obra };
  });
}

export function createMondayLinkObraV2App(options: { authMiddleware?: typeof adminAuthMiddleware; firestore?: FirestoreLike } = {}) {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());
  app.use(options.authMiddleware ?? adminAuthMiddleware);
  const firestore = options.firestore ?? db;

  app.get(['/', '/api/monday-link-obra-v2'], async (_req, res) => {
    try { res.json(await listObras(firestore)); }
    catch (error) { console.error('MONDAY_OBRAS_LIST_FAILED', error); res.status(500).json({ error: 'list_failed' }); }
  });

  app.post(['/', '/api/monday-link-obra-v2'], async (req: AdminRequest, res) => {
    const mondayItemId = typeof req.body?.mondayItemId === 'string' ? req.body.mondayItemId : '';
    const obraV2Id = typeof req.body?.obraV2Id === 'string' ? req.body.obraV2Id : '';
    const action = typeof req.body?.action === 'string' ? req.body.action : 'LINK_EXISTING';
    try {
      if (action === 'CREATE_AND_LINK') {
        const result = await createAndLinkObraV2(mondayItemId, firestore);
        res.json({ ...result, mondayItemId });
        return;
      }
      if (action !== 'LINK_EXISTING') throw new LinkError('invalid_action', 400);
      const result = await linkObraV2(mondayItemId, obraV2Id, firestore);
      res.json({ result, mondayItemId, obraV2Id });
    } catch (error) {
      const known = error instanceof LinkError ? error : null;
      console.error('MONDAY_OBRAS_LINK_FAILED', { uid: req.user?.uid, code: known?.code ?? 'internal' });
      res.status(known?.httpStatus ?? 500).json({ error: known?.code ?? 'link_failed' });
    }
  });
  return app;
}

export const mondayLinkObraV2 = onRequest({ region: 'southamerica-east1' }, createMondayLinkObraV2App());
