import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  FOTO_ETAPA_LABELS,
  FOTO_ETAPAS,
  type Foto,
  type FotoEtapa,
  type ListFotosInput,
  type UploadFotoInput,
} from "./fotos.types";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const etapaSet = new Set<string>(FOTO_ETAPAS);

const isDev = import.meta.env.DEV;

const logDev = (message: string, payload?: unknown) => {
  if (isDev) {
    console.info(`[fotos] ${message}`, payload ?? "");
  }
};

const mapEtapa = (value: unknown): FotoEtapa => {
  if (typeof value === "string" && etapaSet.has(value)) {
    return value as FotoEtapa;
  }
  return "ESTRUTURA";
};

const mapFoto = (snap: QueryDocumentSnapshot<DocumentData>): Foto => {
  const data = snap.data();
  const etapa = mapEtapa(data.etapa);

  return {
    id: snap.id,
    obraId: String(data.obraId ?? ""),
    obraNomeSnapshot: typeof data.obraNomeSnapshot === "string" ? data.obraNomeSnapshot : null,
    etapa,
    etapaLabel: typeof data.etapaLabel === "string" ? data.etapaLabel : FOTO_ETAPA_LABELS[etapa],
    observacaoTecnica: typeof data.observacaoTecnica === "string" ? data.observacaoTecnica : "",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    filePath: typeof data.filePath === "string" ? data.filePath : "",
    fileName: typeof data.fileName === "string" ? data.fileName : `foto-${snap.id}.jpg`,
    contentType: typeof data.contentType === "string" ? data.contentType : "application/octet-stream",
    sizeBytes: Number(data.sizeBytes ?? 0),
    width: typeof data.width === "number" ? data.width : undefined,
    height: typeof data.height === "number" ? data.height : undefined,
  };
};

export const listFotos = async ({ obraId, etapa = null, limitCount = 200 }: ListFotosInput): Promise<Foto[]> => {
  if (!obraId) {
    return [];
  }

  const constraints: QueryConstraint[] = [where("obraId", "==", obraId)];

  if (etapa) {
    constraints.push(where("etapa", "==", etapa));
  }

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(limitCount));

  try {
    const q = query(collection(db, "fotos"), ...constraints);
    const snap = await getDocs(q);
    const fotos = snap.docs.map(mapFoto);
    logDev("listagem carregada", { obraId, etapa, total: fotos.length });
    return fotos;
  } catch (error) {
    const firestoreError = error as FirestoreError;
    console.error("[fotos] erro ao listar fotos", firestoreError);
    if (firestoreError.code === "failed-precondition") {
      console.error("[fotos] provável índice ausente. Mensagem completa:", firestoreError.message);
    }
    throw error;
  }
};

export const getFotoUrl = async (filePath: string): Promise<string> => {
  const fileRef = ref(storage, filePath);
  return getDownloadURL(fileRef);
};

export const createFoto = async ({
  file,
  obraId,
  obraNomeSnapshot = null,
  etapa,
  observacaoTecnica,
}: UploadFotoInput): Promise<string> => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Formato inválido. Envie JPG, JPEG, PNG ou WEBP.");
  }

  const created = await addDoc(collection(db, "fotos"), {
    obraId,
    obraNomeSnapshot,
    etapa,
    etapaLabel: FOTO_ETAPA_LABELS[etapa],
    observacaoTecnica: observacaoTecnica?.trim() ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    filePath: "",
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });

  const filePath = `fotos/${obraId}/${created.id}/${file.name}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file, { contentType: file.type });

  await updateDoc(created, {
    filePath,
    updatedAt: serverTimestamp(),
  });

  logDev("upload concluído", { fotoId: created.id, obraId, etapa, filePath });
  return created.id;
};

export const downloadFoto = async (foto: Foto): Promise<void> => {
  if (!foto.filePath) {
    throw new Error("Arquivo indisponível para download.");
  }

  const url = await getFotoUrl(foto.filePath);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = foto.fileName || `foto-${foto.id}.jpg`;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};