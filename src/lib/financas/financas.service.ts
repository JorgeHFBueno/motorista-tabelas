import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FINANCIAL_INSTALLMENT_STATUSES,
  type FinancialActorReference,
  type FinancialInstallment,
  type FinancialInstallmentStatus,
  type FinancialOverview,
  type ListFinancialInstallmentsInput,
} from "./financas.types";

const FINANCIAL_INSTALLMENTS_COLLECTION = "financeiroParcelas";
const installmentStatusSet = new Set<string>(FINANCIAL_INSTALLMENT_STATUSES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeOptionalString = (value: unknown): string | undefined => {
  const normalized = normalizeString(value);
  return normalized || undefined;
};

const normalizeNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(value.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(normalized) ? normalized : 0;
  }

  return 0;
};

const isTimestamp = (value: unknown): value is Timestamp =>
  isRecord(value)
  && typeof value.toDate === "function"
  && typeof value.toMillis === "function"
  && typeof value.seconds === "number"
  && typeof value.nanoseconds === "number";

const normalizeTimestamp = (value: unknown): Timestamp | undefined => {
  if (isTimestamp(value)) {
    return value;
  }

  return undefined;
};

const normalizeActor = (value: unknown): FinancialActorReference | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const uid = normalizeOptionalString(value.uid);
  const nome = normalizeOptionalString(value.nome);
  const email = normalizeOptionalString(value.email);

  if (!uid && !nome && !email) {
    return undefined;
  }

  return { uid, nome, email };
};

const normalizeStatus = (value: unknown): FinancialInstallmentStatus => {
  if (typeof value === "string" && installmentStatusSet.has(value)) {
    return value as FinancialInstallmentStatus;
  }

  if (value === "paid") return "pago";
  if (value === "approved") return "pago";
  if (value === "receipt_sent") return "comprovante_enviado";
  if (value === "rejected") return "rejeitado";
  return "pendente";
};

const coerceFileReference = (
  directUrl: unknown,
  directPath: unknown,
  nested: unknown,
): Pick<FinancialInstallment, "boleto" | "boletoPath" | "boletoUrl" | "comprovante" | "comprovantePath" | "comprovanteUrl"> => {
  const nestedRecord = isRecord(nested) ? nested : undefined;
  const boletoUrl = normalizeOptionalString(directUrl) ?? normalizeOptionalString(nestedRecord?.url);
  const boletoPath = normalizeOptionalString(directPath) ?? normalizeOptionalString(nestedRecord?.path);

  if (!nestedRecord && !boletoUrl && !boletoPath) {
    return {};
  }

  return {
    boletoUrl,
    boletoPath,
    boleto: {
      url: boletoUrl,
      path: boletoPath,
      fileName: normalizeOptionalString(nestedRecord?.fileName),
      contentType: normalizeOptionalString(nestedRecord?.contentType),
      sizeBytes: typeof nestedRecord?.sizeBytes === "number" ? nestedRecord.sizeBytes : undefined,
    },
  };
};

const coerceReceiptReference = (
  directUrl: unknown,
  directPath: unknown,
  nested: unknown,
): Pick<FinancialInstallment, "comprovante" | "comprovantePath" | "comprovanteUrl"> => {
  const nestedRecord = isRecord(nested) ? nested : undefined;
  const comprovanteUrl = normalizeOptionalString(directUrl) ?? normalizeOptionalString(nestedRecord?.url);
  const comprovantePath = normalizeOptionalString(directPath) ?? normalizeOptionalString(nestedRecord?.path);

  if (!nestedRecord && !comprovanteUrl && !comprovantePath) {
    return {};
  }

  return {
    comprovanteUrl,
    comprovantePath,
    comprovante: {
      url: comprovanteUrl,
      path: comprovantePath,
      fileName: normalizeOptionalString(nestedRecord?.fileName),
      contentType: normalizeOptionalString(nestedRecord?.contentType),
      sizeBytes: typeof nestedRecord?.sizeBytes === "number" ? nestedRecord.sizeBytes : undefined,
    },
  };
};

export const mapFinancialInstallment = (snap: QueryDocumentSnapshot<DocumentData>): FinancialInstallment => {
  const data = snap.data();
  const boleto = coerceFileReference(data.boletoUrl, data.boletoPath, data.boleto);
  const comprovante = coerceReceiptReference(data.comprovanteUrl, data.comprovantePath, data.comprovante);

  return {
    id: snap.id,
    obraId: normalizeString(data.obraId),
    numero: normalizeNumber(data.numero),
    descricao: normalizeOptionalString(data.descricao) ?? `Parcela ${normalizeNumber(data.numero) || ""}`.trim(),
    valor: normalizeNumber(data.valor),
    vencimento: normalizeTimestamp(data.vencimento),
    status: normalizeStatus(data.status),
    comprovanteEnviadoEm: normalizeTimestamp(data.comprovanteEnviadoEm),
    comprovanteEnviadoPor: normalizeActor(data.comprovanteEnviadoPor),
    confirmadoPagoEm: normalizeTimestamp(data.confirmadoPagoEm),
    confirmadoPagoPor: normalizeActor(data.confirmadoPagoPor),
    observacaoAdmin: normalizeOptionalString(data.observacaoAdmin),
    observacaoCliente: normalizeOptionalString(data.observacaoCliente),
    criadoEm: normalizeTimestamp(data.criadoEm ?? data.createdAt),
    atualizadoEm: normalizeTimestamp(data.atualizadoEm ?? data.updatedAt),
    ...boleto,
    ...comprovante,
  };
};

export const listFinancialInstallments = async ({
  obraId,
  includeRejected = true,
}: ListFinancialInstallmentsInput): Promise<FinancialInstallment[]> => {
  const normalizedObraId = normalizeString(obraId);

  if (!normalizedObraId) {
    return [];
  }

  const constraints: QueryConstraint[] = [where("obraId", "==", normalizedObraId), orderBy("numero", "asc")];
  const snap = await getDocs(query(collection(db, FINANCIAL_INSTALLMENTS_COLLECTION), ...constraints));
  const parcelas = snap.docs.map(mapFinancialInstallment);

  return includeRejected ? parcelas : parcelas.filter((parcela) => parcela.status !== "rejeitado");
};

export const getFinancialInstallmentById = async (id: string): Promise<FinancialInstallment | null> => {
  const parcelaId = normalizeString(id);

  if (!parcelaId) {
    return null;
  }

  const snap = await getDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId));

  if (!snap.exists()) {
    return null;
  }

  return mapFinancialInstallment(snap as QueryDocumentSnapshot<DocumentData>);
};

const isPayableOpenStatus = (status: FinancialInstallmentStatus) =>
  status === "pendente" || status === "comprovante_enviado" || status === "rejeitado";

export const selectUpcomingInstallment = (parcelas: FinancialInstallment[]) => {
  return [...parcelas]
    .filter((parcela) => isPayableOpenStatus(parcela.status))
    .sort((left, right) => {
      const leftDue = left.vencimento?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = right.vencimento?.toMillis() ?? Number.MAX_SAFE_INTEGER;

      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      return left.numero - right.numero;
    })[0];
};

export const buildFinancialOverview = (obraId: string, parcelas: FinancialInstallment[]): FinancialOverview => {
  const valorTotalContrato = parcelas.reduce((acc, parcela) => acc + parcela.valor, 0);
  const parcelasPagas = parcelas.filter((parcela) => parcela.status === "pago");
  const valorPago = parcelasPagas.reduce((acc, parcela) => acc + parcela.valor, 0);
  const quantidadePagas = parcelasPagas.length;
  const quantidadeParcelas = parcelas.length;
  const quantidadePendentes = parcelas.filter((parcela) => parcela.status !== "pago").length;
  const valorEmAberto = Math.max(valorTotalContrato - valorPago, 0);
  const proximaParcela = selectUpcomingInstallment(parcelas);
  const atualizadoEm = [...parcelas]
    .map((parcela) => parcela.atualizadoEm ?? parcela.criadoEm)
    .filter((value): value is Timestamp => Boolean(value))
    .sort((left, right) => right.toMillis() - left.toMillis())[0];

  return {
    obraId,
    valorTotalContrato,
    valorPago,
    valorEmAberto,
    quantidadeParcelas,
    quantidadePagas,
    quantidadePendentes,
    proximaParcela: proximaParcela
      ? {
          id: proximaParcela.id,
          numero: proximaParcela.numero,
          descricao: proximaParcela.descricao,
          valor: proximaParcela.valor,
          vencimento: proximaParcela.vencimento,
          status: proximaParcela.status,
        }
      : undefined,
    atualizadoEm,
  };
};

export const getFinancialOverviewByObra = async (obraId?: string): Promise<FinancialOverview | null> => {
  const normalizedObraId = normalizeString(obraId);

  if (!normalizedObraId) {
    return null;
  }

  const parcelas = await listFinancialInstallments({ obraId: normalizedObraId });
  return buildFinancialOverview(normalizedObraId, parcelas);
};

export const financialInstallmentStoragePaths = {
  boleto: (obraId: string, parcelaId: string, fileName: string) =>
    `financeiro/${obraId}/${parcelaId}/boleto/${fileName}`,
  comprovante: (obraId: string, parcelaId: string, fileName: string) =>
    `financeiro/${obraId}/${parcelaId}/comprovante/${fileName}`,
};