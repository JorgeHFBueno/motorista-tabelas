import { Timestamp, doc,runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Registro } from '../types';
import type { Bomba } from '../types/Bomba';

const COLLECTION_NAME = '03-combustivel';

interface SaveCombustivelInput extends Partial<Registro> {
  obra?: string;
  data?: Date | string | Timestamp;
  email: string;
  diesel?: number;
}

interface SaveCombustivelWithBombaInput extends SaveCombustivelInput {
  frentista: string;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const sanitized = value.replace(',', '.').trim();
    if (!sanitized) return 0;
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
}

function parseRequiredNumber(value: unknown, fieldLabel: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const sanitized = value.replace(',', '.').trim();
    if (sanitized) {
      const parsed = Number(sanitized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  throw new Error(`Campo ${fieldLabel} inválido para atualizar bomba.`);
}

function toDate(value: Date | string | Timestamp | undefined): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function toDateStr(date: Date): string {
  // Mantém formato local estável para compor o docId no padrão do mobile: YYYY-MM-DD HH:mm:ss.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export async function saveCombustivel(input: SaveCombustivelInput): Promise<Registro> {
  const dataDate = toDate(input.data);
  const data = Timestamp.fromDate(dataDate);
  const finalEmail = input.email.trim().toLowerCase();
  const dateStr = toDateStr(dataDate);
  const docId = `${dateStr} ${finalEmail}`;

  const kmRaw = input.km;
  const semKmRaw = normalizeString(input.semKm);
  const usingSemKm = semKmRaw === 'Sem Odômetro' || semKmRaw === 'Galão';

  const payload: Omit<Registro, 'id'> = {
    data,
    tipoPlaca: Boolean(input.tipoPlaca),
    li: toInt(input.li),
    lf: toInt(input.lf),
    qa: toInt(input.qa),
    arla: toInt(input.arla),
    para_quem: normalizeString(input.para_quem),
    motivo: normalizeString(input.motivo),
    local: normalizeString(input.local),
    placa: normalizeString(input.placa),
    obra: normalizeString(input.obra),
    motorista: normalizeString(input.motorista),
    observacao: normalizeString(input.observacao),
  } as Omit<Registro, 'id'>;

  if (typeof input.diesel !== 'undefined') {
    (payload as Omit<Registro, 'id'> & { diesel?: number }).diesel = toInt(input.diesel);
  }

  if (usingSemKm) {
    payload.semKm = semKmRaw;
    payload.km = null;
  } else {
    payload.km = toInt(kmRaw);
    payload.semKm = '';
  }

  if (import.meta.env.DEV) {
    console.info('[combustivel] payload', payload);
  }

  try {
    await setDoc(doc(db, COLLECTION_NAME, docId), payload, { merge: false });
  } catch (err) {
    console.error('[combustivel] save failed', err);
    throw err;
  }

  return {
    id: docId,
    ...payload,
  };
}

export async function saveCombustivelAndUpdateDieselPatio(input: SaveCombustivelWithBombaInput): Promise<Registro> {
  const dataDate = toDate(input.data);
  const data = Timestamp.fromDate(dataDate);
  const finalEmail = input.email.trim().toLowerCase();
  const dateStr = toDateStr(dataDate);
  const docId = `${dateStr} ${finalEmail}`;

  const kmRaw = input.km;
  const semKmRaw = normalizeString(input.semKm);
  const usingSemKm = semKmRaw === 'Sem Odômetro' || semKmRaw === 'Galão';

  const payload: Omit<Registro, 'id'> = {
    data,
    tipoPlaca: Boolean(input.tipoPlaca),
    li: toInt(input.li),
    lf: toInt(input.lf),
    qa: toInt(input.qa),
    arla: toInt(input.arla),
    para_quem: normalizeString(input.para_quem),
    motivo: normalizeString(input.motivo),
    local: normalizeString(input.local),
    placa: normalizeString(input.placa),
    obra: normalizeString(input.obra),
    motorista: normalizeString(input.motorista),
    observacao: normalizeString(input.observacao),
  } as Omit<Registro, 'id'>;

  if (typeof input.diesel !== 'undefined') {
    (payload as Omit<Registro, 'id'> & { diesel?: number }).diesel = toInt(input.diesel);
  }

  if (usingSemKm) {
    payload.semKm = semKmRaw;
    payload.km = null;
  } else {
    payload.km = toInt(kmRaw);
    payload.semKm = '';
  }

  const qaNumber = parseRequiredNumber(input.qa, 'QA');
  const lfNumber = parseRequiredNumber(input.lf, 'LF');
  const frentista = normalizeString(input.frentista);
  if (!frentista) {
    throw new Error('Não foi possível identificar o frentista para atualizar a bomba.');
  }

  const combustivelRef = doc(db, COLLECTION_NAME, docId);
  const dieselPatioRef = doc(db, 'bombas', 'diesel_patio');

  await runTransaction(db, async (transaction) => {
    const dieselPatioSnapshot = await transaction.get(dieselPatioRef);
    if (!dieselPatioSnapshot.exists()) {
      throw new Error('Documento bombas/diesel_patio não encontrado.');
    }

    const dieselPatioData = dieselPatioSnapshot.data() as Omit<Bomba, 'id'>;
    const estoqueAtualAnterior = dieselPatioData.estoqueAtual;
    if (typeof estoqueAtualAnterior !== 'number' || !Number.isFinite(estoqueAtualAnterior)) {
      throw new Error('Campo estoqueAtual de bombas/diesel_patio inválido.');
    }

    const novoEstoqueAtual = estoqueAtualAnterior - qaNumber;

    transaction.set(combustivelRef, payload, { merge: false });
    transaction.update(dieselPatioRef, {
      montanteAtual: lfNumber,
      estoqueAtual: novoEstoqueAtual,
      ultimoAbastecimento: data,
      ultimoFrentista: frentista,
    });
  });

  return {
    id: docId,
    ...payload,
  };
}

export default { saveCombustivel, saveCombustivelAndUpdateDieselPatio };