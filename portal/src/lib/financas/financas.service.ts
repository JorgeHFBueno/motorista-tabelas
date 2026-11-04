import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  PORTAL_COLECOES,
  centavosParaReais,
  dataIsoParaTimestamp,
  filtrosDoContrato,
  toArquivo,
  urlDoArquivo,
} from "@/lib/portal";
import type { ObraDoc, PessoaRef } from "@/types/rbac";
import {
  FINANCIAL_INSTALLMENT_STATUSES,
  type FinancialInstallment,
  type FinancialInstallmentStatus,
  type FinancialOverview,
} from "./financas.types";

export const FINANCIAL_RECEIPT_ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const statusSet = new Set<string>(FINANCIAL_INSTALLMENT_STATUSES);

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asOptionalString = (value: unknown) => asString(value) || undefined;
const asTimestamp = (value: unknown) => (value instanceof Timestamp ? value : undefined);
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const toInstallment = async (id: string, data: DocumentData): Promise<FinancialInstallment> => {
  const numero = asNumber(data.numero);
  const [boletoUrl, comprovanteUrl] = await Promise.all([
    urlDoArquivo(toArquivo(data.boleto)),
    urlDoArquivo(toArquivo(data.comprovante)),
  ]);
  const enviadoPor = data.comprovanteEnviadoPor as { uid?: unknown; nome?: unknown } | null | undefined;

  return {
    id,
    obraId: asString(data.obraId),
    numero,
    descricao: asOptionalString(data.descricao) ?? `Parcela ${numero || ""}`.trim(),
    valor: centavosParaReais(data.valor),
    vencimento: dataIsoParaTimestamp(data.vencimento),
    status: statusSet.has(data.status) ? (data.status as FinancialInstallmentStatus) : "pendente",
    boletoUrl,
    comprovanteUrl,
    comprovanteEnviadoEm: asTimestamp(data.comprovanteEnviadoEm),
    comprovanteEnviadoPor: enviadoPor
      ? { uid: asOptionalString(enviadoPor.uid), nome: asOptionalString(enviadoPor.nome) }
      : undefined,
    observacaoAdmin: asOptionalString(data.observacaoAdmin),
    observacaoCliente: asOptionalString(data.observacaoCliente),
    criadoEm: asTimestamp(data.criadoEm),
    atualizadoEm: asTimestamp(data.atualizadoEm),
  };
};

export const listFinancialInstallments = async (obra: ObraDoc): Promise<FinancialInstallment[]> => {
  const snapshot = await getDocs(query(collection(db, PORTAL_COLECOES.parcelas), ...filtrosDoContrato(obra)));
  const parcelas = await Promise.all(snapshot.docs.map((item) => toInstallment(item.id, item.data())));
  return parcelas.sort((a, b) => a.numero - b.numero);
};

export const canClientSubmitReceiptForStatus = (status: FinancialInstallmentStatus) =>
  status === "pendente" || status === "rejeitado";

export const validateFinancialReceiptFile = (file: File) => {
  const type = file.type.toLowerCase();
  if (!FINANCIAL_RECEIPT_ACCEPTED_TYPES.includes(type as (typeof FINANCIAL_RECEIPT_ACCEPTED_TYPES)[number])) {
    throw new Error("Envie um comprovante em PDF, JPG/JPEG ou PNG.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("O comprovante pode ter até 10 MB.");
  }
};

const isOpenStatus = (status: FinancialInstallmentStatus) => status !== "pago";

const selectUpcomingInstallment = (parcelas: FinancialInstallment[]) =>
  [...parcelas]
    .filter((parcela) => isOpenStatus(parcela.status))
    .sort((left, right) => {
      const leftDue = left.vencimento?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = right.vencimento?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      return leftDue !== rightDue ? leftDue - rightDue : left.numero - right.numero;
    })[0];

export const buildFinancialOverview = (obra: ObraDoc, parcelas: FinancialInstallment[]): FinancialOverview => {
  const valorParcelado = parcelas.reduce((acc, parcela) => acc + parcela.valor, 0);
  // The contract value typed by adm2 (cents); without it, the sum of the installments.
  const valorTotalContrato =
    typeof obra.valorContrato === "number" ? centavosParaReais(obra.valorContrato) : valorParcelado;
  const pagas = parcelas.filter((parcela) => parcela.status === "pago");
  const valorPago = pagas.reduce((acc, parcela) => acc + parcela.valor, 0);
  const proximaParcela = selectUpcomingInstallment(parcelas);
  const atualizadoEm = parcelas
    .map((parcela) => parcela.atualizadoEm ?? parcela.criadoEm)
    .filter((value): value is Timestamp => Boolean(value))
    .sort((left, right) => right.toMillis() - left.toMillis())[0];

  return {
    obraId: obra.id,
    valorTotalContrato,
    valorPago,
    valorEmAberto: Math.max(valorTotalContrato - valorPago, 0),
    quantidadeParcelas: parcelas.length,
    quantidadePagas: pagas.length,
    quantidadePendentes: parcelas.length - pagas.length,
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

const sanitizeFileName = (fileName: string) => fileName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

// The Rules accept only these fields, with the server time, for a pending or rejected installment, and the file
// under the installment's own folder.
export const uploadFinancialReceiptFile = async ({
  obra,
  parcelaId,
  file,
  observacaoCliente,
  enviadoPor,
}: {
  obra: ObraDoc;
  parcelaId: string;
  file: File;
  observacaoCliente?: string;
  enviadoPor: PessoaRef;
}) => {
  validateFinancialReceiptFile(file);

  const parcelaRef = doc(db, PORTAL_COLECOES.parcelas, parcelaId);
  const atual = await getDoc(parcelaRef);
  if (!atual.exists()) throw new Error("Parcela não encontrada.");
  if (!canClientSubmitReceiptForStatus(atual.data().status)) {
    throw new Error(
      atual.data().status === "comprovante_enviado"
        ? "Já existe um comprovante enviado para esta parcela aguardando análise."
        : "Esta parcela não aceita envio de comprovante no momento.",
    );
  }

  const contentType = file.type || "application/octet-stream";
  const path = `portal/obras/${obra.id}/parcelas/${parcelaId}/comprovante/${Date.now()}_${sanitizeFileName(file.name) || "comprovante"}`;
  await uploadBytes(ref(storage, path), file, { contentType });

  await updateDoc(parcelaRef, {
    status: "comprovante_enviado",
    comprovante: { path, nome: file.name, contentType, bytes: file.size },
    comprovanteEnviadoEm: serverTimestamp(),
    comprovanteEnviadoPor: enviadoPor,
    observacaoCliente: observacaoCliente?.trim() || null,
    atualizadoEm: serverTimestamp(),
  });

  const atualizado = await getDoc(parcelaRef);
  return atualizado.exists() ? toInstallment(atualizado.id, atualizado.data()) : null;
};
