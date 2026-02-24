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
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import type { FirestoreItem, ObraDoc, UserDoc } from "@/types/rbac";

const mapItems = (docs: Awaited<ReturnType<typeof getDocs>>): FirestoreItem[] =>
  docs.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>),}));

const logFirestoreError = (tag: string, err: unknown) => {
  const firestoreError = err as { code?: string; message?: string };
  console.error(`[Firestore][${tag}]`, {
    code: firestoreError?.code ?? "unknown",
    message: firestoreError?.message ?? "unknown",
    rawError: err,
  });
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