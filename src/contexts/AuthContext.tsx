import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
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

  const fetchUserDoc = useCallback(async (uid: string) => {
    if (!db) {
      throw firebaseInitError ?? new Error("Firebase indisponível.");
    }
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as UserDoc;
  }, []);

  const refreshUserDoc = useCallback(async () => {
    if (!user) {
      setUserDoc(null);
      setUserDocReady(true);
      return;
    }

    try {
      setUserDocReady(false);
      setError(null);
      const loadedUserDoc = await fetchUserDoc(user.uid);
      setUserDoc(loadedUserDoc);
      console.debug("[AuthProvider] userDoc atualizado", { uid: user.uid, exists: !!loadedUserDoc });
    } catch (err) {
      logFirestoreError("getUserDoc", err);
      setError("Falha ao carregar dados do usuário.");
      throw err;
      } finally {
      setUserDocReady(true);
    }
  }, [fetchUserDoc, user]);

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

        try {
          setUserDocReady(false);
          setError(null);
          const loadedUserDoc = await fetchUserDoc(currentUser.uid);
          setUserDoc(loadedUserDoc);
        } catch (err) {
          logFirestoreError("getUserDoc", err);
          setError("Falha ao carregar dados do usuário.");
          setUserDoc(null);
        } finally {
          setUserDocReady(true);
          setLoading(false);
        }
      });
    };

    initializeAuth();

    return () => {
      unsubscribe();
    };
  }, [fetchUserDoc]);

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