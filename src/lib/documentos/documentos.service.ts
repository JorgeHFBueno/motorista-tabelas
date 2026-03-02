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
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  DOCUMENT_CATEGORIES,
  type AddAssinaturaInput,
  type AddAuditoriaEventInput,
  type AddVersaoInput,
  type AssinaturaDocumento,
  type AssinaturaStatus,
  type AuditoriaEvento,
  type Documento,
  type DocumentoCategoria,
  type DocumentoStatus,
  type ListDocumentosInput,
  type UploadDocumentoInput,
  type VersaoDocumento,
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

const coerceAssinaturaStatus = (value: unknown, requerAssinatura: boolean): AssinaturaStatus => {
  if (value === "ASSINADO" || value === "AGUARDANDO" || value === "REQUER_ASSINATURA") {
    return value;
  }

return requerAssinatura ? "REQUER_ASSINATURA" : "ASSINADO";
};

const mapDocumento = (snap: QueryDocumentSnapshot<DocumentData>): Documento => {
  const data = snap.data();
  const requerAssinatura = Boolean(data.requerAssinatura ?? data.requiresSignature);

  return {
    id: snap.id,
    titulo: String(data.titulo ?? data.name ?? "Documento sem título"),
    categoria: coerceCategoria(data.categoria ?? data.category),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    obraId: typeof data.obraId === "string" && data.obraId ? data.obraId : undefined,
    obraNomeSnapshot: typeof data.obraNomeSnapshot === "string" ? data.obraNomeSnapshot : undefined,
    fileName: String(data.fileName ?? ""),
    filePath: String(data.filePath ?? ""),
    fileSizeBytes: Number(data.fileSizeBytes ?? 0),
    mimeType: String(data.mimeType ?? "application/octet-stream"),
    status: coerceStatus(data.status),
    requerAssinatura,
    assinaturaStatus: coerceAssinaturaStatus(data.assinaturaStatus, requerAssinatura),
    certificado: data.certificado
      ? {
          id: String((data.certificado as Record<string, unknown>).id ?? "—"),
          validadeJuridica: String((data.certificado as Record<string, unknown>).validadeJuridica ?? "—"),
          hash: String((data.certificado as Record<string, unknown>).hash ?? "—"),
          algoritmo: "SHA-256",
        }
      : undefined,
    assinaturasResumo: data.assinaturasResumo
      ? {
          total: Number((data.assinaturasResumo as Record<string, unknown>).total ?? 0),
          assinadas: Number((data.assinaturasResumo as Record<string, unknown>).assinadas ?? 0),
          pendentes: Number((data.assinaturasResumo as Record<string, unknown>).pendentes ?? 0),
        }
      : undefined,
    auditoriaResumo: data.auditoriaResumo
      ? {
          ultimoEventoTitulo:
            typeof (data.auditoriaResumo as Record<string, unknown>).ultimoEventoTitulo === "string"
              ? String((data.auditoriaResumo as Record<string, unknown>).ultimoEventoTitulo)
              : undefined,
          ultimoEventoEm: (data.auditoriaResumo as Record<string, unknown>).ultimoEventoEm as Documento["auditoriaResumo"]["ultimoEventoEm"],
        }
      : undefined,
    versoesResumo: data.versoesResumo
      ? {
          atual:
            typeof (data.versoesResumo as Record<string, unknown>).atual === "string"
              ? String((data.versoesResumo as Record<string, unknown>).atual)
              : undefined,
          total: Number((data.versoesResumo as Record<string, unknown>).total ?? 0),
        }
      : undefined,
  };
};

const mapAuditoria = (snap: QueryDocumentSnapshot<DocumentData>): AuditoriaEvento => {
  const data = snap.data();
  return {
    id: snap.id,
    titulo: String(data.titulo ?? "Evento"),
    por: String(data.por ?? "Sistema"),
    ip: typeof data.ip === "string" ? data.ip : undefined,
    createdAt: data.createdAt,
    meta: (data.meta as Record<string, unknown>) ?? undefined,
  };
};

  const mapVersao = (snap: QueryDocumentSnapshot<DocumentData>): VersaoDocumento => {
  const data = snap.data();
  return {
    id: snap.id,
    versao: String(data.versao ?? "1.0"),
    descricao: String(data.descricao ?? "—"),
    por: String(data.por ?? "Sistema"),
    createdAt: data.createdAt,
  };
};

  const mapAssinatura = (snap: QueryDocumentSnapshot<DocumentData>): AssinaturaDocumento => {
  const data = snap.data();
  return {
    id: snap.id,
    nome: String(data.nome ?? "—"),
    papel: String(data.papel ?? "—"),
    metodo: typeof data.metodo === "string" ? data.metodo : undefined,
    ip: typeof data.ip === "string" ? data.ip : undefined,
    status: data.status === "ASSINADO" ? "ASSINADO" : "PENDENTE",
    assinadoEm: data.assinadoEm,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export const listDocumentos = async ({ obraId, categoria, searchText }: ListDocumentosInput): Promise<Documento[]> => {
  const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
  if (obraId) constraints.unshift(where("obraId", "==", obraId));
  if (categoria) constraints.unshift(where("categoria", "==", categoria));

  const baseQuery = query(collection(db, "documentos"), ...constraints);

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

export const listAuditoria = async (docId: string): Promise<AuditoriaEvento[]> => {
  const q = query(collection(db, "documentos", docId, "auditoria"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(mapAuditoria);
};

export const listVersoes = async (docId: string): Promise<VersaoDocumento[]> => {
  const q = query(collection(db, "documentos", docId, "versoes"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(mapVersao);
};

export const listAssinaturas = async (docId: string): Promise<AssinaturaDocumento[]> => {
  const q = query(collection(db, "documentos", docId, "assinaturas"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(mapAssinatura);
};

export const addAuditoriaEvent = async (
  docId: string,
  payload: AddAuditoriaEventInput,
): Promise<{ id: string; createdAt?: AuditoriaEvento["createdAt"] }> => {
  const created = await addDoc(collection(db, "documentos", docId, "auditoria"), {
    titulo: payload.titulo,
    por: payload.por,
    ip: payload.ip ?? null,
    meta: payload.meta ?? null,
    createdAt: serverTimestamp(),
  });

  const createdSnap = await getDoc(created);
  const createdData = createdSnap.data();

  return {
    id: created.id,
    createdAt: createdData?.createdAt as AuditoriaEvento["createdAt"],
  };
};

export const addVersao = async (docId: string, payload: AddVersaoInput): Promise<string> => {
  const created = await addDoc(collection(db, "documentos", docId, "versoes"), {
    versao: payload.versao,
    descricao: payload.descricao,
    por: payload.por,
    createdAt: serverTimestamp(),
  });

  return created.id;
};

export const addAssinatura = async (docId: string, payload: AddAssinaturaInput): Promise<string> => {
  const created = await addDoc(collection(db, "documentos", docId, "assinaturas"), {
    nome: payload.nome,
    papel: payload.papel,
    metodo: payload.metodo ?? null,
    ip: payload.ip ?? null,
    status: payload.status ?? "PENDENTE",
    assinadoEm: payload.assinadoEm ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return created.id;
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
  const assinaturaStatus: AssinaturaStatus = requerAssinatura ? "AGUARDANDO" : "ASSINADO";

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
    assinaturasResumo: requerAssinatura
      ? { total: 2, assinadas: 0, pendentes: 2 }
      : { total: 0, assinadas: 0, pendentes: 0 },
    versoesResumo: { atual: "1.0", total: 1 },
    auditoriaResumo: {
      ultimoEventoTitulo: "Documento criado",
      ultimoEventoEm: null,
    },
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

  const auditoriaCreated = await addAuditoriaEvent(created.id, {
    titulo: "Documento criado",
    por: "Sistema",
  });

  await updateDoc(doc(db, "documentos", created.id), {
    auditoriaResumo: {
      ultimoEventoTitulo: "Documento criado",
      ultimoEventoEm: auditoriaCreated.createdAt ?? null,
    },
    updatedAt: serverTimestamp(),
  });

  if (requerAssinatura) {
    await Promise.all([
      addAssinatura(created.id, { nome: "Contratante", papel: "Contratante", status: "PENDENTE" }),
      addAssinatura(created.id, { nome: "Contratada", papel: "Contratada", status: "PENDENTE" }),
    ]);

    await updateDoc(doc(db, "documentos", created.id), {
      assinaturaStatus: "AGUARDANDO",
      assinaturasResumo: { total: 2, assinadas: 0, pendentes: 2 },
      updatedAt: serverTimestamp(),
    });
  }

  await addVersao(created.id, {
    versao: "1.0",
    descricao: "Versão inicial do contrato",
    por: "Dep. Jurídico",
  });

  await updateDoc(doc(db, "documentos", created.id), {
    versoesResumo: { atual: "1.0", total: 1 },
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