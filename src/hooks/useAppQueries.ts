import { useQuery } from "@tanstack/react-query";
import {
  collection,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FirestoreItem, ObraDoc, UserDoc } from "@/types/rbac";

const mapItems = (docs: Awaited<ReturnType<typeof getDocs>>): FirestoreItem[] =>
  docs.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>),}));


export const useUserDoc = (uid?: string) =>
  useQuery({
    queryKey: ["userDoc", uid],
    queryFn: async () => {
      if (!uid) {
        return null;
      }

      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        console.debug("[useUserDoc] documento não encontrado", { uid });
        return null;
      }

      return { ...(snap.data() as UserDoc) };
    },
    enabled: !!uid,
  });

export const useObra = (obraId?: string) =>
  useQuery({
    queryKey: ["obra", obraId],
    queryFn: async () => {
      if (!obraId) {
        return null;
      }
      const obraRef = doc(db, "obras", obraId);
      const snap = await getDoc(obraRef);
      if (!snap.exists()) {
        return null;
      }
      return { id: snap.id, ...(snap.data() as Omit<ObraDoc, "id">) } as ObraDoc;
    },
    enabled: !!obraId,
  });

export const useObrasByIds = (ids: string[]) =>
  useQuery({
    queryKey: ["obrasByIds", ids],
    queryFn: async () => {
      if (ids.length === 0) {
        return [] as ObraDoc[];
      }

      const chunkSize = 10;
      const chunks = Array.from({ length: Math.ceil(ids.length / chunkSize) }, (_, index) =>
        ids.slice(index * chunkSize, index * chunkSize + chunkSize),
      );

      const snapshots = await Promise.all(
        chunks.map((chunk) =>
          getDocs(query(collection(db, "obras"), where(documentId(), "in", chunk))),
        ),
      );

      return snapshots.flatMap((snapshot) =>
        snapshot.docs.map(
          (obra) => ({ id: obra.id, ...(obra.data() as Omit<ObraDoc, "id">) }) as ObraDoc,
        ),
      );
    },
    enabled: ids.length > 0,
  });

const listWithFallback = async (
  obraId: string,
  subCollection: "documentos" | "fotos" | "financas",
): Promise<FirestoreItem[]> => {
  const subCollectionRef = collection(db, "obras", obraId, subCollection);
  const subCollectionSnap = await getDocs(subCollectionRef);

  if (!subCollectionSnap.empty) {
    return mapItems(subCollectionSnap);
  }

  console.debug(`[${subCollection}] fallback para coleção global`, { obraId });
  // TODO: remover fallback quando toda a base for migrada para subcoleções por obra.
  const oldQuery = query(collection(db, subCollection), where("obraId", "==", obraId));
  const oldSnap = await getDocs(oldQuery);
  return mapItems(oldSnap);
};

export const useDocumentos = (obraId?: string) =>
  useQuery({
    queryKey: ["documentos", obraId],
    queryFn: async () => {
      if (!obraId) {
        return [] as FirestoreItem[];
      }
      return listWithFallback(obraId, "documentos");
    },
    enabled: !!obraId,
  });

export const useFotos = (obraId?: string) =>
  useQuery({
    queryKey: ["fotos", obraId],
    queryFn: async () => {
      if (!obraId) {
        return [] as FirestoreItem[];
      }
      return listWithFallback(obraId, "fotos");
    },
    enabled: !!obraId,
  });

export const useFinancas = (obraId?: string) =>
  useQuery({
    queryKey: ["financas", obraId],
    queryFn: async () => {
      if (!obraId) {
        return [] as FirestoreItem[];
      }
      return listWithFallback(obraId, "financas");
    },
    enabled: !!obraId,
  });