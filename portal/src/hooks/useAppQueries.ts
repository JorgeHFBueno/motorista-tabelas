import { useEffect, useRef } from "react";
import { getApp } from "firebase/app";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  orderBy,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import type { FirestoreItem, ObraDoc, UserDoc } from "@/types/rbac";
import { listDocumentos } from "@/lib/documentos/documentos.service";
import { listFotos } from "@/lib/fotos/fotos.service";

const mapItems = (docs: Awaited<ReturnType<typeof getDocs>>): FirestoreItem[] =>
  docs.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>),}));

const isDev = import.meta.env.DEV;

const logFirestoreError = (tag: string, err: unknown) => {
  const firestoreError = err as { code?: string; message?: string };
  console.error(`[Firestore][${tag}]`, {
    code: firestoreError?.code ?? "unknown",
    message: firestoreError?.message ?? "unknown",
    rawError: err,
  });
};

const dedupeByPathOrUrl = (items: FirestoreItem[]): FirestoreItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.storagePath ?? item.filePath ?? item.url ?? item.id ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toEpoch = (value: unknown): number => {
  const withSeconds = value as { seconds?: number };
  if (typeof withSeconds?.seconds === "number") return withSeconds.seconds;
  const maybeDate = value as { toDate?: () => Date };
  if (typeof maybeDate?.toDate === "function") {
    return Math.floor(maybeDate.toDate().getTime() / 1000);
  }
  return 0;
};

const sortByCreatedAtDesc = (items: FirestoreItem[]): FirestoreItem[] =>
  [...items].sort((a, b) => toEpoch(b.createdAt) - toEpoch(a.createdAt));

const UUID_PREFIX_NAME_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/i;

const deriveDisplayName = (item: Record<string, unknown>) => {
  const direct = [item.displayName, item.originalName, item.titulo]
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (typeof direct === "string") return direct;

  const candidate = [item.storedName, item.filename, item.fileName]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  if (typeof candidate !== "string") return "Documento";

  const match = candidate.match(UUID_PREFIX_NAME_REGEX);
  return match?.[1] ?? candidate;
};

const listCompatDocumentos = async (obraId: string): Promise<FirestoreItem[]> => {
  try {
    const [primary, legacySnap] = await Promise.all([
      listDocumentos({ obraId, categoria: null, searchText: "" }),
      getDocs(query(collection(db, "obras", obraId, "documentos"), orderBy("createdAt", "desc"))),
    ]);

    const primaryItems: FirestoreItem[] = primary.map((doc) => ({
      id: doc.id,
      obraId: doc.obraId,
      obraNomeSnapshot: doc.obraNomeSnapshot,
      tipo: doc.categoria,
      titulo: doc.titulo,
      filename: doc.fileName,
      fileName: doc.fileName,
      storedName: doc.fileName,
      displayName: deriveDisplayName({
        displayName: (doc as unknown as Record<string, unknown>).displayName,
        originalName: (doc as unknown as Record<string, unknown>).originalName,
        titulo: doc.titulo,
        storedName: doc.fileName,
      }),
      originalName: (doc as unknown as Record<string, unknown>).originalName ?? null,
      storagePath: doc.filePath,
      filePath: doc.filePath,
      url: (doc as unknown as Record<string, unknown>).url ?? "",
      contentType: doc.mimeType,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
      observacao: null,
      origin: "global",
    }));

    const legacyItems: FirestoreItem[] = mapItems(legacySnap).map((item) => ({
      ...item,
      displayName: deriveDisplayName(item),
      originalName: item.originalName ?? null,
      storedName: item.storedName ?? item.filename ?? item.fileName,
      fileName: item.fileName ?? item.filename,
      filename: item.filename ?? item.fileName,
      filePath: item.filePath ?? item.storagePath,
      storagePath: item.storagePath ?? item.filePath,
      mimeType: item.mimeType ?? item.contentType,
      contentType: item.contentType ?? item.mimeType,
      titulo: item.titulo ?? item.filename ?? item.fileName ?? "Documento",
      categoria: item.categoria ?? item.tipo ?? "Contratos",
      origin: "legacy_subcollection",
    }));

    const merged = sortByCreatedAtDesc(dedupeByPathOrUrl([...primaryItems, ...legacyItems]));

    if (isDev) {
      console.info("[OBRA_FILES] documentos listados", {
        obraId,
        source: "global_documentos",
        total: merged.length,
        globalCount: primaryItems.length,
        legacyCount: legacyItems.length,
      });
    }

    return merged;
  } catch (error) {
    if (isDev) {
      console.error("[OBRA_FILES] erro ao listar documentos", { obraId, error });
    }
    throw error;
  }
};

const mapEtapaLabelToCode = (tipo: unknown) => {
  if (tipo === "Fundação") return "FUNDACAO";
  if (tipo === "Estrutura") return "ESTRUTURA";
  if (tipo === "Cobertura") return "COBERTURA";
  if (tipo === "Fechamento") return "FECHAMENTO";
  return "ESTRUTURA";
};

const listCompatFotos = async (obraId: string): Promise<FirestoreItem[]> => {
  try {
    const [primary, legacySnap] = await Promise.all([
      listFotos({ obraId, etapa: null }),
      getDocs(query(collection(db, "obras", obraId, "fotos"), orderBy("createdAt", "desc"))),
    ]);

    const primaryItems: FirestoreItem[] = primary.map((foto) => ({
      id: foto.id,
      obraId: foto.obraId,
      obraNomeSnapshot: foto.obraNomeSnapshot,
      tipo: foto.etapaLabel,
      etapa: foto.etapa,
      filename: foto.fileName,
      fileName: foto.fileName,
      storagePath: foto.filePath,
      filePath: foto.filePath,
      url: "",
      contentType: foto.contentType,
      mimeType: foto.contentType,
      createdAt: foto.createdAt,
      observacao: foto.observacaoTecnica ?? null,
      origin: "global",
    }));

    const legacyItems: FirestoreItem[] = mapItems(legacySnap).map((item) => ({
      ...item,
      obraId,
      fileName: item.fileName ?? item.filename,
      filename: item.filename ?? item.fileName,
      filePath: item.filePath ?? item.storagePath,
      storagePath: item.storagePath ?? item.filePath,
      mimeType: item.mimeType ?? item.contentType,
      contentType: item.contentType ?? item.mimeType,
      etapa: item.etapa ?? mapEtapaLabelToCode(item.tipo),
      observacaoTecnica: item.observacaoTecnica ?? item.observacao ?? "",
      origin: "legacy_subcollection",
    }));

    const merged = sortByCreatedAtDesc(dedupeByPathOrUrl([...primaryItems, ...legacyItems]));

    if (isDev) {
      console.info("[OBRA_FILES] fotos listadas", {
        obraId,
        source: "global_fotos",
        total: merged.length,
        globalCount: primaryItems.length,
        legacyCount: legacyItems.length,
      });
    }

    return merged;
  } catch (error) {
    if (isDev) {
      console.error("[OBRA_FILES] erro ao listar fotos", { obraId, error });
    }
    throw error;
  }
};

export const useUserDoc = (uid?: string) =>
  useQuery({
    queryKey: ["userDoc", uid],
    queryFn: async () => {
      if (!uid) {
        return null;
      }

      const userRef = doc(db, "users", uid);
      try {
        const snap = await getDoc(userRef);

      if (!snap.exists()) {
          console.debug("[useUserDoc] documento não encontrado", { uid });
          return null;
        }

      return { ...(snap.data() as UserDoc) };
      } catch (err) {
        logFirestoreError("getUserDoc", err);
        throw err;
      }
    },
    enabled: !!uid,
  });

  export const useEnsureUserDoc = ({
  user,
  userDoc,
  onEnsured,
  enabled = true,
}: {
  user: User | null;
  userDoc: UserDoc | null;
  onEnsured?: () => Promise<void>;
  enabled?: boolean;
}) => {
  const hasAttempted = useRef(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (currentUser: User) => {
      const userRef = doc(db, "users", currentUser.uid);
      try {
        await currentUser.getIdToken(true);
          console.info("[Firestore][ensureUserDoc] user/project", {
          uid: currentUser.uid,
          projectId: getApp().options.projectId ?? "unknown",
        });
        
        const snap = await getDoc(userRef);
        console.info("[Firestore][ensureUserDoc] getUserDoc.exists", {
          uid: currentUser.uid,
          exists: snap.exists(),
        });

        if (snap.exists()) {
          console.info("[Firestore][ensureUserDoc] branch=return_existing", { uid: currentUser.uid });
          return snap.data() as UserDoc;
        }

        console.info("[Firestore][ensureUserDoc] branch=create", { uid: currentUser.uid });
        await setDoc(
          userRef,
          {
            nome: currentUser.displayName || currentUser.email || "Usuário",
            tipo: "cliente",
            role: "cliente",
            ativo: true,
            obras: [],
            createdAt: serverTimestamp(),
          },
          { merge: false },
        );

        const createdSnap = await getDoc(userRef);
        console.info("[Firestore][ensureUserDoc] getUserDoc.exists_after_create", {
          uid: currentUser.uid,
          exists: createdSnap.exists(),
        });
        return createdSnap.exists() ? (createdSnap.data() as UserDoc) : null;
      } catch (err) {
        logFirestoreError("ensureUserDoc", err);
        throw err;
      }
    },
    onSuccess: async () => {
      if (user) {
        await queryClient.invalidateQueries({ queryKey: ["userDoc", user.uid] });
      }
      if (onEnsured) {
        await onEnsured();
      }
    },
  });

  useEffect(() => {
    hasAttempted.current = false;
  }, [user?.uid]);
  useEffect(() => {
    if (!enabled || !user || userDoc || hasAttempted.current || mutation.isPending) {
    return;
    }

    hasAttempted.current = true;
    mutation.mutate(user);
  }, [enabled, mutation, user, userDoc]);

  return mutation;
};

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

  export const useAllObras = (enabled = true) =>
  useQuery({
    queryKey: ["allObras"],
    queryFn: async () => {
      const snapshot = await getDocs(collection(db, "obras"));
      return snapshot.docs.map((obra) => ({ id: obra.id, ...(obra.data() as Omit<ObraDoc, "id">) }) as ObraDoc);
    },
    enabled,
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
        chunks.map((chunk) => getDocs(query(collection(db, "obras"), where(documentId(), "in", chunk)))),
      );

      return snapshots.flatMap((snapshot) =>
        snapshot.docs.map(
          (obra) => ({ id: obra.id, ...(obra.data() as Omit<ObraDoc, "id">) }) as ObraDoc,
        ),
      );
    },
    enabled: ids.length > 0,
  });

  export interface AccessRequestDoc {
  id: string;
  uid: string;
  nomeSnapshot: string;
  emailSnapshot: string;
  status: "pendente" | "aprovado" | "negado";
  observacao?: string;
  createdAt?: unknown;
}

export const useMyAccessRequests = (uid?: string) =>
  useQuery({
    queryKey: ["accessRequests", uid],
    queryFn: async () => {
      if (!uid) {
        return [] as AccessRequestDoc[];
      }
      try {
        const requestsRef = collection(db, "users", uid, "accessRequests");
        const snap = await getDocs(requestsRef);

        return snap.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...(item.data() as Omit<AccessRequestDoc, "id">),
              }) as AccessRequestDoc,
          )
          .sort((a, b) => {
            const aValue = (a.createdAt as { seconds?: number })?.seconds ?? 0;
            const bValue = (b.createdAt as { seconds?: number })?.seconds ?? 0;
            return bValue - aValue;
          });
      } catch (err) {
        logFirestoreError("queryAccessRequests", err);
        throw err;
      }
    },
    enabled: !!uid,
  });

export const useCreateAccessRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uid, nomeSnapshot, emailSnapshot }: { uid: string; nomeSnapshot: string; emailSnapshot: string }) => {
      try {
        await addDoc(collection(db, "users", uid, "accessRequests"), {
          uid,
          nomeSnapshot,
          emailSnapshot,
          createdAt: serverTimestamp(),
          status: "pendente",
        });
      } catch (err) {
        logFirestoreError("createAccessRequest", err);
        throw err;
      }
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["accessRequests", variables.uid] });
    },
  });
};

export const useDocumentos = (obraId?: string) =>
  useQuery({
    queryKey: ["documentos", obraId],
    queryFn: async () => {
      if (!obraId) {
        return [] as FirestoreItem[];
      }
      return listCompatDocumentos(obraId);
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
      return listCompatFotos(obraId);
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
      const subCollectionRef = collection(db, "obras", obraId, "financas");
      const subCollectionSnap = await getDocs(subCollectionRef);
      return mapItems(subCollectionSnap);
    },
    enabled: !!obraId,
  });