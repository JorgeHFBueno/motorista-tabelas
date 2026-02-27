import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  DOCUMENT_CATEGORIES,
  type Documento,
  type DocumentoAssinatura,
  type DocumentoAuditoria,
  type DocumentoCategoria,
  type DocumentoStatus,
  type DocumentoVersao,
  type ListDocumentosInput,
  type UploadDocumentoInput,
} from "./documentos.types";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const categorySet = new Set<string>(DOCUMENT_CATEGORIES);

const coerceCategoria = (value: unknown): DocumentoCategoria => {
  if (typeof value === "string" && categorySet.has(value)) {
    return value as DocumentoCategoria;
  }
  return "Contratos";
};

const coerceStatus = (value: unknown): DocumentoStatus => {
  if (value === "Finalizado" || value === "Aguardando" || value === "Requer assinatura") {
    return value;
  }

  if (value === "finalizado" || value === "assinado") return "Finalizado";
  if (value === "enviado" || value === "aguardando") return "Aguardando";
  return "Requer assinatura";
};

const normalizeAssinaturas = (value: unknown): DocumentoAssinatura[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    const status = obj.status === "ASSINADO" ? "ASSINADO" : "PENDENTE";

    return {
      nome: String(obj.nome ?? obj.signer ?? "—"),
      papel: String(obj.papel ?? obj.role ?? "—"),
      assinadoEm: obj.assinadoEm as DocumentoAssinatura["assinadoEm"],
      ip: typeof obj.ip === "string" ? obj.ip : "—",
      metodo: typeof obj.metodo === "string" ? obj.metodo : typeof obj.method === "string" ? obj.method : "—",
      status,
    };
  });
};

const normalizeAuditoria = (value: unknown): DocumentoAuditoria[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      titulo: String(obj.titulo ?? obj.action ?? "Evento"),
      em: obj.em as DocumentoAuditoria["em"],
      por: String(obj.por ?? obj.user ?? "Sistema"),
      ip: typeof obj.ip === "string" ? obj.ip : undefined,
    };
  });
};

const normalizeVersoes = (value: unknown): DocumentoVersao[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const obj = (item ?? {}) as Record<string, unknown>;
    return {
      versao: String(obj.versao ?? obj.version ?? "1.0"),
      descricao: String(obj.descricao ?? obj.changes ?? "—"),
      em: obj.em as DocumentoVersao["em"],
      por: String(obj.por ?? obj.author ?? "Sistema"),
    };
  });
};

const mapDocumento = (snap: QueryDocumentSnapshot<DocumentData>): Documento => {
  const data = snap.data();
  const titulo = String(data.titulo ?? data.name ?? "Documento sem título");
  const requerAssinatura = Boolean(data.requerAssinatura ?? data.requiresSignature);
  const assinaturaStatus =
    data.assinaturaStatus === "ASSINADO" ||
    data.assinaturaStatus === "AGUARDANDO" ||
    data.assinaturaStatus === "REQUER_ASSINATURA"
      ? data.assinaturaStatus
      : requerAssinatura
        ? "REQUER_ASSINATURA"
        : "ASSINADO";

  return {
    id: snap.id,
    titulo,
    categoria: coerceCategoria(data.categoria ?? data.category),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    obraId: typeof data.obraId === "string" ? data.obraId : undefined,
    obraNomeSnapshot: typeof data.obraNomeSnapshot === "string" ? data.obraNomeSnapshot : undefined,
    fileName: String(data.fileName ?? ""),
    filePath: String(data.filePath ?? ""),
    fileSizeBytes: Number(data.fileSizeBytes ?? 0),
    mimeType: String(data.mimeType ?? "application/octet-stream"),
    status: coerceStatus(data.status ?? data.signatureStatus),
    requerAssinatura,
    assinaturaStatus,
    certificado: data.certificado
      ? {
          id: String((data.certificado as Record<string, unknown>).id ?? "—"),
          validadeJuridica: String((data.certificado as Record<string, unknown>).validadeJuridica ?? "—"),
          hash: String((data.certificado as Record<string, unknown>).hash ?? "—"),
          algoritmo: "SHA-256",
        }
      : undefined,
    assinaturas: normalizeAssinaturas(data.assinaturas ?? data.signers),
    auditoria: normalizeAuditoria(data.auditoria ?? data.auditTrail),
    versoes: normalizeVersoes(data.versoes ?? data.versions),
  };
};

export const listDocumentos = async ({ obraId, categoria, searchText }: ListDocumentosInput): Promise<Documento[]> => {
  let baseQuery = query(collection(db, "documentos"), orderBy("createdAt", "desc"));

  if (obraId) {
    baseQuery = query(collection(db, "documentos"), where("obraId", "==", obraId), orderBy("createdAt", "desc"));
  }

  if (categoria) {
    baseQuery = query(
      collection(db, "documentos"),
      ...(obraId ? [where("obraId", "==", obraId)] : []),
      where("categoria", "==", categoria),
      orderBy("createdAt", "desc"),
    );
  }

  const snap = await getDocs(baseQuery);
  const mapped = snap.docs.map(mapDocumento);

  if (!searchText.trim()) {
    return mapped;
  }

  const normalizedSearch = searchText.trim().toLowerCase();
  return mapped.filter((docItem) => docItem.titulo.toLowerCase().includes(normalizedSearch));
};

export const getDocumentoById = async (id: string): Promise<Documento | null> => {
  const docRef = doc(db, "documentos", id);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    return null;
  }

  return mapDocumento(snap as QueryDocumentSnapshot<DocumentData>);
};

export const uploadDocumento = async ({
  file,
  categoria,
  titulo,
  obraId,
  obraNomeSnapshot,
  requerAssinatura = false,
}: UploadDocumentoInput): Promise<string> => {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Formato inválido. Envie apenas PDF ou imagens (PNG/JPG/JPEG/WEBP).");
  }

  const status: DocumentoStatus = requerAssinatura ? "Requer assinatura" : "Finalizado";
  const assinaturaStatus = requerAssinatura ? "REQUER_ASSINATURA" : "ASSINADO";

  const created = await addDoc(collection(db, "documentos"), {
    titulo,
    categoria,
    obraId: obraId ?? null,
    obraNomeSnapshot: obraNomeSnapshot ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    fileName: file.name,
    filePath: "",
    fileSizeBytes: file.size,
    mimeType: file.type,
    status,
    requerAssinatura,
    assinaturaStatus,
    assinaturas: [],
    auditoria: [
      {
        titulo: "Documento criado",
        em: serverTimestamp(),
        por: "Sistema",
      },
    ],
    versoes: [
      {
        versao: "1.0",
        descricao: "Versão inicial do documento",
        em: serverTimestamp(),
        por: "Sistema",
      },
    ],
  });

  const filePath = `documentos/${obraId ?? "geral"}/${created.id}/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file);

  await updateDoc(doc(db, "documentos", created.id), {
    filePath,
    fileSizeBytes: file.size,
    mimeType: file.type,
    fileName: file.name,
    updatedAt: serverTimestamp(),
  });

  return created.id;
};

export const downloadDocumento = async (documento: Documento): Promise<void> => {
  if (!documento.filePath) {
    throw new Error("Arquivo não encontrado para este documento.");
  }

  const fileRef = ref(storage, documento.filePath);
  const url = await getDownloadURL(fileRef);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = documento.fileName || documento.titulo;
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
};