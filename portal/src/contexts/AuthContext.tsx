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

interface AuthContextData {
  user: User | null;
  // users/{uid}; null when the login has no client profile.
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

const toUserDoc = (data: Record<string, unknown>): UserDoc => ({
  nome: typeof data.nome === "string" ? data.nome : "",
  email: typeof data.email === "string" ? data.email : undefined,
  documentos: Array.isArray(data.documentos)
    ? data.documentos.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [],
  ativo: data.ativo === true,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userDocReady, setUserDocReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUserDoc = useCallback(async (currentUser: User) => {
    setUserDocReady(false);
    setError(null);

    try {
      if (!db) throw firebaseInitError ?? new Error("Firebase indisponível.");
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      setUserDoc(snap.exists() ? toUserDoc(snap.data()) : null);
    } catch (err) {
      // Reading one's own users/{uid} is always allowed (even when it does not exist), so this is a real failure.
      if (import.meta.env.DEV) console.error("[AuthProvider] falha ao ler users/{uid}", err);
      setError("Falha ao carregar dados do usuário.");
      setUserDoc(null);
    } finally {
      setUserDocReady(true);
    }
  }, []);

  const refreshUserDoc = useCallback(async () => {
    if (!user) {
      setUserDoc(null);
      setUserDocReady(true);
      return;
    }
    await loadUserDoc(user);
  }, [loadUserDoc, user]);

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

        await loadUserDoc(currentUser);
        setLoading(false);
      });
    };

    initializeAuth();

    return () => {
      unsubscribe();
    };
  }, [loadUserDoc]);

  const value = useMemo(
    () => ({
      user,
      userDoc,
      loading,
      authReady,
      userDocReady,
      error,
      login: async (email: string, senha: string) => {
        if (!auth) throw firebaseInitError ?? new Error("Firebase indisponível para login.");
        await signInWithEmailAndPassword(auth, email, senha);
      },
      logout: async () => {
        if (!auth) throw firebaseInitError ?? new Error("Firebase indisponível para logout.");
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
