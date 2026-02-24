import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getApp } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, authPersistenceReady, db, firebaseInitError } from "@/lib/firebase";
import type { UserDoc } from "@/types/rbac";

const logFirestoreError = (tag: string, err: unknown) => {
  const firestoreError = err as { code?: string; message?: string };
  console.error(`[AuthProvider][${tag}] Firestore error`, {
    code: firestoreError?.code ?? "unknown",
    message: firestoreError?.message ?? "unknown",
    rawError: err,
  });
};

const getFirestoreErrorCode = (err: unknown): string => {
  const firestoreError = err as { code?: string };
  return firestoreError?.code ?? "unknown";
};

interface AuthContextData {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  authReady: boolean;
  userDocReady: boolean;
  error: string | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserDoc: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userDocReady, setUserDocReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserDoc = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      console.warn("[AuthProvider][getUserDoc] currentUser ausente; leitura no Firestore ignorada");
      return null;
    }

    if (!db) {
      throw firebaseInitError ?? new Error("Firebase indisponível.");
    }

    await currentUser.getIdToken(true);
    const projectId = getApp().options.projectId ?? "unknown";
    console.info("[AuthProvider][getUserDoc] user/project", {
      uid: currentUser.uid,
      projectId,
    });

    const userRef = doc(db, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    console.info("[AuthProvider][getUserDoc] getUserDoc.exists", {
      uid: currentUser.uid,
      exists: snap.exists(),
    });

    if (!snap.exists()) {
      return null;
    }

    return snap.data() as UserDoc;
  }, []);

  const resolveAuthUserState = useCallback(async (currentUser: User) => {
    setUserDocReady(false);
    setError(null);

    try {
      const loadedUserDoc = await fetchUserDoc(currentUser);

      if (loadedUserDoc) {
        console.info("[AuthProvider] branch=return_existing", { uid: currentUser.uid });
        setUserDoc(loadedUserDoc);
        return;
      }

      console.info("[AuthProvider] branch=create", { uid: currentUser.uid });
      setUserDoc(null);
    } catch (err) {
      const code = getFirestoreErrorCode(err);
      logFirestoreError("getUserDoc", err);
      console.error("[AuthProvider][getUserDoc] code", { code });

      if (code === "permission-denied") {
        setError("Sem permissão para carregar dados do usuário.");
      } else {
        setError("Falha ao carregar dados do usuário.");
      }
      setUserDoc(null);
    } finally {
      setUserDocReady(true);
    }
  }, [fetchUserDoc]);

  const refreshUserDoc = useCallback(async () => {
    if (!user) {
      setUserDoc(null);
      setUserDocReady(true);
      return;
    }

    await resolveAuthUserState(user);
  }, [resolveAuthUserState, user]);

  useEffect(() => {
    let unsubscribe = () => {};

    const initializeAuth = async () => {
      await authPersistenceReady;

      if (!auth) {
        setLoading(false);
        setAuthReady(true);
        setUserDocReady(true);
        setError("Não foi possível inicializar autenticação.");
        return;
      }
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        setAuthReady(true);

        if (!currentUser) {
          setUserDoc(null);
          setUserDocReady(true);
          setLoading(false);
          return;
        }

        await resolveAuthUserState(currentUser);
        setLoading(false);
      });
    };

    initializeAuth();

    return () => {
      unsubscribe();
    };
  }, [resolveAuthUserState]);

  const value = useMemo(
    () => ({
      user,
      userDoc,
      loading,
      authReady,
      userDocReady,
      error,
      login: async (email: string, senha: string) => {
        if (!auth) {
          throw firebaseInitError ?? new Error("Firebase indisponível para login.");
        }
        await signInWithEmailAndPassword(auth, email, senha);
      },      
      logout: async () => {
        if (!auth) {
          throw firebaseInitError ?? new Error("Firebase indisponível para logout.");
        }
        await signOut(auth);
      },
      refreshUserDoc,
    }),
        [authReady, error, loading, refreshUserDoc, user, userDoc, userDocReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth precisa ser usado dentro de AuthProvider");
  }

  return context;
};