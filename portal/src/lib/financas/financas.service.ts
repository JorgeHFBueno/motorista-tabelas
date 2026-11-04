import {
  addDoc,
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp as TimestampType,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  FINANCIAL_INSTALLMENT_STATUSES,
  type CreateFinancialInstallmentInput,
  type FinancialActorReference,
  type FinancialInstallment,
  type FinancialInstallmentStatus,
  type FinancialOverview,
  type ListFinancialInstallmentsInput,
  type SubmitFinancialReceiptPayload,
  type ReviewFinancialReceiptPayload,
  type UpdateFinancialInstallmentInput,
} from "./financas.types";

const FINANCIAL_INSTALLMENTS_COLLECTION = "financeiroParcelas";
const installmentStatusSet = new Set<string>(FINANCIAL_INSTALLMENT_STATUSES);
export const FINANCIAL_RECEIPT_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const isDev = import.meta.env.DEV;

const logFinancialDebug = (message: string, payload?: Record<string, unknown>) => {
  if (!isDev) return;
  console.info(`[FINANCAS_SERVICE] ${message}`, payload ?? {});
};

const logFinancialError = (message: string, payload?: Record<string, unknown>) => {
  if (!isDev) return;
  console.error(`[FINANCAS_SERVICE] ${message}`, payload ?? {});
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

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

const isTimestamp = (value: unknown): value is TimestampType =>
  isRecord(value) &&
  typeof value.toDate === "function" &&
  typeof value.toMillis === "function" &&
  typeof value.seconds === "number" &&
  typeof value.nanoseconds === "number";

const normalizeTimestamp = (value: unknown): TimestampType | undefined => {
  if (isTimestamp(value)) {
    return value;
  }

  return undefined;
};

const normalizeActor = (
  value: unknown,
): FinancialActorReference | undefined => {
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
): Pick<
  FinancialInstallment,
  | "boleto"
  | "boletoPath"
  | "boletoUrl"
  | "comprovante"
  | "comprovantePath"
  | "comprovanteUrl"
> => {
  const nestedRecord = isRecord(nested) ? nested : undefined;
  const boletoUrl =
    normalizeOptionalString(directUrl) ??
    normalizeOptionalString(nestedRecord?.url);
  const boletoPath =
    normalizeOptionalString(directPath) ??
    normalizeOptionalString(nestedRecord?.path);

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
      sizeBytes:
        typeof nestedRecord?.sizeBytes === "number"
          ? nestedRecord.sizeBytes
          : undefined,
    },
  };
};

const coerceReceiptReference = (
  directUrl: unknown,
  directPath: unknown,
  nested: unknown,
): Pick<
  FinancialInstallment,
  "comprovante" | "comprovantePath" | "comprovanteUrl"
> => {
  const nestedRecord = isRecord(nested) ? nested : undefined;
  const comprovanteUrl =
    normalizeOptionalString(directUrl) ??
    normalizeOptionalString(nestedRecord?.url);
  const comprovantePath =
    normalizeOptionalString(directPath) ??
    normalizeOptionalString(nestedRecord?.path);

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
      sizeBytes:
        typeof nestedRecord?.sizeBytes === "number"
          ? nestedRecord.sizeBytes
          : undefined,
    },
  };
};

export const mapFinancialInstallment = (
  snap: QueryDocumentSnapshot<DocumentData>,
): FinancialInstallment => {
  const data = snap.data();
  const boleto = coerceFileReference(
    data.boletoUrl,
    data.boletoPath,
    data.boleto,
  );
  const comprovante = coerceReceiptReference(
    data.comprovanteUrl,
    data.comprovantePath,
    data.comprovante,
  );

  return {
    id: snap.id,
    obraId: normalizeString(data.obraId),
    numero: normalizeNumber(data.numero),
    descricao:
      normalizeOptionalString(data.descricao) ??
      `Parcela ${normalizeNumber(data.numero) || ""}`.trim(),
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

  const constraints: QueryConstraint[] = [where("obraId", "==", normalizedObraId)];

  try {
    const snap = await getDocs(
      query(collection(db, FINANCIAL_INSTALLMENTS_COLLECTION), ...constraints),
    );
    const parcelas = snap.docs
      .map(mapFinancialInstallment)
      .sort((left, right) => left.numero - right.numero);
    const filtered = includeRejected
      ? parcelas
      : parcelas.filter((parcela) => parcela.status !== "rejeitado");

    logFinancialDebug("resultado da listagem por obra", {
      obraId: normalizedObraId,
      total: filtered.length,
      parcelaIds: filtered.map((parcela) => parcela.id),
      persistedObraIds: [...new Set(filtered.map((parcela) => parcela.obraId))],
    });

    return filtered;
  } catch (error) {
    logFinancialError("erro ao listar parcelas por obra", { obraId: normalizedObraId, error });
    throw error;
  }
};

export const getFinancialInstallmentById = async (
  id: string,
): Promise<FinancialInstallment | null> => {
  const parcelaId = normalizeString(id);

  if (!parcelaId) {
    return null;
  }

  const snap = await getDoc(
    doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId),
  );

  if (!snap.exists()) {
    return null;
  }

  return mapFinancialInstallment(snap as QueryDocumentSnapshot<DocumentData>);
};

const isPayableOpenStatus = (status: FinancialInstallmentStatus) =>
  status === "pendente" ||
  status === "comprovante_enviado" ||
  status === "rejeitado";

export const canClientSubmitReceiptForStatus = (
  status: FinancialInstallmentStatus,
) => status === "pendente" || status === "rejeitado";

const assertReceiptUploadAllowed = (parcela: FinancialInstallment) => {
  if (!canClientSubmitReceiptForStatus(parcela.status)) {
    throw new Error(
      parcela.status === "comprovante_enviado"
        ? "Já existe um comprovante enviado para esta parcela aguardando análise."
        : "Esta parcela não aceita envio de comprovante no momento.",
    );
  }
};

const assertReceiptReviewAllowed = (parcela: FinancialInstallment) => {
  if (parcela.status !== "comprovante_enviado") {
    throw new Error(
      "Somente parcelas com comprovante enviado podem ser aprovadas ou rejeitadas.",
    );
  }
};

export const validateFinancialReceiptFile = (file: File) => {
  const normalizedType = normalizeString(file.type).toLowerCase();
  if (!FINANCIAL_RECEIPT_ACCEPTED_TYPES.includes(normalizedType as (typeof FINANCIAL_RECEIPT_ACCEPTED_TYPES)[number])) {
    throw new Error("Envie um comprovante em PDF, JPG/JPEG ou PNG.");
  }
};

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

export const buildFinancialOverview = (
  obraId: string,
  parcelas: FinancialInstallment[],
  valorTotalContratoOverride?: number,
): FinancialOverview => {
  const valorParcelado = parcelas.reduce(
    (acc, parcela) => acc + parcela.valor,
    0,
  );
  const valorTotalContrato =
    typeof valorTotalContratoOverride === "number" &&
      Number.isFinite(valorTotalContratoOverride)
      ? valorTotalContratoOverride
      : valorParcelado;
  const parcelasPagas = parcelas.filter((parcela) => parcela.status === "pago");
  const valorPago = parcelasPagas.reduce(
    (acc, parcela) => acc + parcela.valor,
    0,
  );
  const quantidadePagas = parcelasPagas.length;
  const quantidadeParcelas = parcelas.length;
  const quantidadePendentes = parcelas.filter(
    (parcela) => parcela.status !== "pago",
  ).length;
  const valorEmAberto = Math.max(valorTotalContrato - valorPago, 0);
  const proximaParcela = selectUpcomingInstallment(parcelas);
  const atualizadoEm = [...parcelas]
    .map((parcela) => parcela.atualizadoEm ?? parcela.criadoEm)
    .filter((value): value is TimestampType => Boolean(value))
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

const getFinancialContractValueFromObra = async (
  obraId: string,
): Promise<number | undefined> => {
  const obraSnap = await getDoc(doc(db, "obras", obraId));
  if (!obraSnap.exists()) return undefined;

  const obraData = obraSnap.data();
  if (!("valorTotalContrato" in obraData)) return undefined;

  const valorTotalContrato = normalizeNumber(obraData.valorTotalContrato);
  return Number.isFinite(valorTotalContrato) ? valorTotalContrato : undefined;
};

export const getFinancialOverviewByObra = async (
  obraId?: string,
): Promise<FinancialOverview | null> => {
  const normalizedObraId = normalizeString(obraId);

  if (!normalizedObraId) {
    return null;
  }

  try {
    const [parcelas, valorTotalContrato] = await Promise.all([
      listFinancialInstallments({ obraId: normalizedObraId }),
      getFinancialContractValueFromObra(normalizedObraId),
    ]);
    const overview = buildFinancialOverview(normalizedObraId, parcelas, valorTotalContrato);
    logFinancialDebug("resultado do overview por obra", {
      obraId: normalizedObraId,
      quantidadeParcelas: overview.quantidadeParcelas,
      valorTotalContrato: overview.valorTotalContrato,
      valorPago: overview.valorPago,
    });
    return overview;
  } catch (error) {
    logFinancialError("erro ao montar overview financeiro", { obraId: normalizedObraId, error });
    throw error;
  }
};

export const financialInstallmentStoragePaths = {
  boleto: (obraId: string, parcelaId: string, fileName: string) =>
    `financeiro/${obraId}/${parcelaId}/boleto/${fileName}`,
  comprovante: (obraId: string, parcelaId: string, fileName: string) =>
    `financeiro/${obraId}/${parcelaId}/comprovante/${fileName}`,
};

const toFirestoreDate = (value: TimestampType | Date | null | undefined) => {
  if (value === null) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return value;
};

export const createFinancialInstallment = async (
  input: CreateFinancialInstallmentInput,
) => {
  const normalizedObraId = normalizeString(input.obraId);

  if (!normalizedObraId) {
    throw new Error("Não foi possível salvar a parcela sem um obraId válido.");
  }

  const payload = {
    obraId: normalizedObraId,
    numero: input.numero,
    descricao: input.descricao.trim(),
    valor: input.valor,
    vencimento: toFirestoreDate(input.vencimento),
    status: input.status ?? "pendente",
    boletoUrl: normalizeOptionalString(input.boletoUrl) ?? null,
    boletoPath: normalizeOptionalString(input.boletoPath) ?? null,
    observacaoAdmin: normalizeOptionalString(input.observacaoAdmin) ?? null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };

  logFinancialDebug("payload normalizado para criação de parcela", payload as Record<string, unknown>);
  const docRef = await addDoc(collection(db, FINANCIAL_INSTALLMENTS_COLLECTION), payload);
  logFinancialDebug("parcela criada com sucesso", { obraId: normalizedObraId, parcelaId: docRef.id });
  return docRef;
};

export const updateFinancialInstallment = async (
  parcelaId: string,
  input: UpdateFinancialInstallmentInput,
) => {
  const payload = {
    ...(input.numero !== undefined ? { numero: input.numero } : {}),
    ...(input.descricao !== undefined
      ? { descricao: input.descricao.trim() }
      : {}),
    ...(input.valor !== undefined ? { valor: input.valor } : {}),
    ...(input.vencimento !== undefined
      ? { vencimento: toFirestoreDate(input.vencimento) }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.boletoUrl !== undefined ? { boletoUrl: input.boletoUrl } : {}),
    ...(input.boletoPath !== undefined ? { boletoPath: input.boletoPath } : {}),
    ...(input.observacaoAdmin !== undefined
      ? { observacaoAdmin: input.observacaoAdmin }
      : {}),
    ...(input.observacaoCliente !== undefined
      ? { observacaoCliente: input.observacaoCliente }
      : {}),
    atualizadoEm: serverTimestamp(),
  };

  await updateDoc(
    doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId),
    payload,
  );
};

export const deleteFinancialInstallment = async (parcelaId: string) => {
  await deleteDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId));
};

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

export const uploadFinancialBoletoFile = async ({
  obraId,
  parcelaId,
  file,
}: {
  obraId: string;
  parcelaId: string;
  file: File;
}) => {
  const normalizedObraId = normalizeString(obraId);
  const parcela = await getFinancialInstallmentById(parcelaId);

  if (!parcela) {
    throw new Error("Parcela financeira não encontrada.");
  }

  if (parcela.obraId !== normalizedObraId) {
    throw new Error("A parcela informada não pertence à obra selecionada.");
  }

  const safeName = `${Date.now()}_${sanitizeFileName(file.name) || "boleto"}`;
  const boletoPath = financialInstallmentStoragePaths.boleto(
    normalizedObraId,
    parcelaId,
    safeName,
  );
  const storageRef = ref(storage, boletoPath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
  });
  const boletoUrl = await getDownloadURL(storageRef);

  await updateDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId), {
    boletoUrl,
    boletoPath,
    boleto: {
      url: boletoUrl,
      path: boletoPath,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
    atualizadoEm: serverTimestamp(),
  });

  logFinancialDebug("boleto vinculado com sucesso", { obraId: normalizedObraId, parcelaId, boletoPath });
  
  return { boletoUrl, boletoPath };
};

export const submitFinancialReceipt = async ({
  parcelaId,
  obraId,
  comprovantePath,
  comprovanteUrl,
  observacaoCliente,
  comprovanteEnviadoPor,
}: SubmitFinancialReceiptPayload) => {
  const parcela = await getFinancialInstallmentById(parcelaId);

  if (!parcela) {
    throw new Error("Parcela financeira não encontrada.");
  }

  if (parcela.obraId !== normalizeString(obraId)) {
    throw new Error("A parcela informada não pertence à obra selecionada.");
  }

  assertReceiptUploadAllowed(parcela);

  await updateDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId), {
    comprovanteUrl: normalizeOptionalString(comprovanteUrl) ?? null,
    comprovantePath: normalizeString(comprovantePath),
    comprovante: {
      ...(parcela.comprovante ?? {}),
      url: normalizeOptionalString(comprovanteUrl),
      path: normalizeString(comprovantePath),
    },
    comprovanteEnviadoEm: serverTimestamp(),
    comprovanteEnviadoPor: comprovanteEnviadoPor ?? null,
    observacaoCliente: normalizeOptionalString(observacaoCliente) ?? null,
    status: "comprovante_enviado",
    atualizadoEm: serverTimestamp(),
  });

  return getFinancialInstallmentById(parcelaId);
};

export const uploadFinancialReceiptFile = async ({
  obraId,
  parcelaId,
  file,
  observacaoCliente,
  comprovanteEnviadoPor,
}: {
  obraId: string;
  parcelaId: string;
  file: File;
  observacaoCliente?: string;
  comprovanteEnviadoPor?: FinancialActorReference;
}) => {
  validateFinancialReceiptFile(file);

  const parcela = await getFinancialInstallmentById(parcelaId);
  if (!parcela) {
    throw new Error("Parcela financeira não encontrada.");
  }

  if (parcela.obraId !== normalizeString(obraId)) {
    throw new Error("A parcela informada não pertence à obra selecionada.");
  }

  assertReceiptUploadAllowed(parcela);

  const safeName = `${Date.now()}_${sanitizeFileName(file.name) || "comprovante"}`;
  const comprovantePath = financialInstallmentStoragePaths.comprovante(
    obraId,
    parcelaId,
    safeName,
  );
  const storageRef = ref(storage, comprovantePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
  });
  const comprovanteUrl = await getDownloadURL(storageRef);

  await updateDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId), {
    comprovanteUrl,
    comprovantePath,
    comprovante: {
      url: comprovanteUrl,
      path: comprovantePath,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
    comprovanteEnviadoEm: serverTimestamp(),
    comprovanteEnviadoPor: comprovanteEnviadoPor ?? null,
    observacaoCliente: normalizeOptionalString(observacaoCliente) ?? null,
    status: "comprovante_enviado",
    atualizadoEm: serverTimestamp(),
  });

  return getFinancialInstallmentById(parcelaId);
};

export const reviewFinancialReceipt = async ({
  parcelaId,
  obraId,
  aprovado,
  observacaoAdmin,
  confirmadoPagoPor,
}: ReviewFinancialReceiptPayload) => {
  const parcela = await getFinancialInstallmentById(parcelaId);

  if (!parcela) {
    throw new Error("Parcela financeira não encontrada.");
  }

  if (parcela.obraId !== normalizeString(obraId)) {
    throw new Error("A parcela informada não pertence à obra selecionada.");
  }

  assertReceiptReviewAllowed(parcela);

  if (!aprovado && !normalizeOptionalString(observacaoAdmin)) {
    throw new Error("Informe um motivo para rejeitar o comprovante.");
  }

  await updateDoc(doc(db, FINANCIAL_INSTALLMENTS_COLLECTION, parcelaId), {
    status: aprovado ? "pago" : "rejeitado",
    ...(aprovado
      ? {
          confirmadoPagoEm: serverTimestamp(),
          confirmadoPagoPor: confirmadoPagoPor ?? null,
          observacaoAdmin: normalizeOptionalString(observacaoAdmin) ?? null,
        }
      : {
          observacaoAdmin: normalizeOptionalString(observacaoAdmin) ?? null,
        }),
    atualizadoEm: serverTimestamp(),
  });

  return getFinancialInstallmentById(parcelaId);
};

export const approveFinancialReceipt = async (payload: Omit<ReviewFinancialReceiptPayload, "aprovado">) =>
  reviewFinancialReceipt({
    ...payload,
    aprovado: true,
  });

export const rejectFinancialReceipt = async (payload: Omit<ReviewFinancialReceiptPayload, "aprovado">) =>
  reviewFinancialReceipt({
    ...payload,
    aprovado: false,
  });

export const updateFinancialContractValue = async (
  obraId: string,
  valorTotalContrato: number,
) => {
  await updateDoc(doc(db, "obras", obraId), {
    valorTotalContrato,
    updatedAt: serverTimestamp(),
  });
};