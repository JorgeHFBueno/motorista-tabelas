import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  NoticiasPorCategoria,
  NoticiaCategoria,
  NoticiaCreateInput,
  NoticiaDoc,
  NoticiaUpdateInput,
} from "@/types/noticias";

const COLLECTION_NAME = "noticias";
const INSTITUTIONAL_SOURCE = "Ledur";

const mapNoticia = (id: string, data: Record<string, unknown>): NoticiaDoc => ({
  id,
  titulo: String(data.titulo ?? ""),
  resumo: String(data.resumo ?? ""),
  conteudo: typeof data.conteudo === "string" ? data.conteudo : null,
  url: typeof data.url === "string" ? data.url : null,
  imagemUrl: typeof data.imagemUrl === "string" ? data.imagemUrl : null,
  categoria: data.categoria as NoticiaCategoria,
  fonte: String(data.fonte ?? ""),
  publicadoEm: data.publicadoEm as Timestamp,
  origem: data.origem as NoticiaDoc["origem"],
  status: data.status as NoticiaDoc["status"],
  tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
  destaque: Boolean(data.destaque),
  hashDedupe: String(data.hashDedupe ?? ""),
  createdAt: data.createdAt as Timestamp,
  updatedAt: data.updatedAt as Timestamp,
  criadoPor: (data.criadoPor as NoticiaDoc["criadoPor"]) ?? null,
  atualizadoPor: (data.atualizadoPor as NoticiaDoc["atualizadoPor"]) ?? null,
});

export const listPublicNoticiasByCategoria = async (categoria: NoticiaCategoria): Promise<NoticiaDoc[]> => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("status", "==", "publicada"),
    where("categoria", "==", categoria),
    orderBy("publicadoEm", "desc"),
    limit(5),
  );

  const snap = await getDocs(q);
  return snap.docs.map((item) => mapNoticia(item.id, item.data()));
};

export const listInstitutionalNoticiasAdmin = async (): Promise<NoticiaDoc[]> => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("categoria", "==", "institucional"),
    where("origem", "==", "institucional"),
    orderBy("updatedAt", "desc"),
    limit(100),
  );

  const snap = await getDocs(q);
  return snap.docs.map((item) => mapNoticia(item.id, item.data()));
};

export const uploadInstitutionalImage = async (uid: string, file: File): Promise<string> => {
  const storagePath = `noticias-institucionais/${uid}/${Date.now()}-${file.name}`;
  const imageRef = ref(storage, storagePath);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
};

export const createInstitutionalNoticia = async (
  input: NoticiaCreateInput,
  user: { uid: string; nome?: string; email?: string },
): Promise<string> => {
  const created = await addDoc(collection(db, COLLECTION_NAME), {
    titulo: input.titulo.trim(),
    resumo: input.resumo.trim(),
    conteudo: input.conteudo?.trim() || null,
    url: input.url?.trim() || null,
    imagemUrl: input.imagemUrl?.trim() || null,
    categoria: "institucional",
    fonte: INSTITUTIONAL_SOURCE,
    publicadoEm: Timestamp.fromDate(input.publicadoEm),
    origem: "institucional",
    status: input.status,
    tags: input.tags,
    destaque: input.destaque,
    hashDedupe: `institucional:${user.uid}:${Date.now()}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    criadoPor: user,
    atualizadoPor: user,
  });

  return created.id;
};

export const updateInstitutionalNoticia = async (
  id: string,
  input: NoticiaUpdateInput,
  user: { uid: string; nome?: string; email?: string },
): Promise<void> => {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    atualizadoPor: user,
  };

  if (typeof input.titulo === "string") payload.titulo = input.titulo.trim();
  if (typeof input.resumo === "string") payload.resumo = input.resumo.trim();
  if (input.conteudo !== undefined) payload.conteudo = input.conteudo?.trim() || null;
  if (input.url !== undefined) payload.url = input.url?.trim() || null;
  if (input.imagemUrl !== undefined) payload.imagemUrl = input.imagemUrl?.trim() || null;
  if (input.status) payload.status = input.status;
  if (input.tags) payload.tags = input.tags;
  if (typeof input.destaque === "boolean") payload.destaque = input.destaque;
  if (input.publicadoEm) payload.publicadoEm = Timestamp.fromDate(input.publicadoEm);

  await updateDoc(doc(db, COLLECTION_NAME, id), payload);
};

export const deleteInstitutionalNoticia = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};

export const buildEmptyNoticiasByCategoria = (categorias: NoticiaCategoria[]): NoticiasPorCategoria =>
  categorias.reduce((acc, categoria) => {
    acc[categoria] = [];
    return acc;
  }, {} as NoticiasPorCategoria);