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
  userDoc: UserDoc | null;
  loading: boolean;
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
      return;
    }

    try {
      setError(null);
      const loadedUserDoc = await fetchUserDoc(user.uid);
      setUserDoc(loadedUserDoc);
      console.debug("[AuthProvider] userDoc atualizado", { uid: user.uid, exists: !!loadedUserDoc });
    } catch (err) {
      console.debug("[AuthProvider] erro ao atualizar userDoc", err);
      setError("Falha ao carregar dados do usuário.");
      throw err;
    }
  }, [fetchUserDoc, user]);

  useEffect(() => {
    let unsubscribe = () => {};

    const initializeAuth = async () => {
      await authPersistenceReady;

      if (!auth) {
        setLoading(false);
        setError("Não foi possível inicializar autenticação.");
        return;
      }
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        if (!currentUser) {
          setUserDoc(null);
          setLoading(false);
          return;
        }

        try {
          setError(null);
          const loadedUserDoc = await fetchUserDoc(currentUser.uid);
          setUserDoc(loadedUserDoc);
        } catch (err) {
          console.debug("[AuthProvider] erro onAuthStateChanged", err);
          setError("Falha ao carregar dados do usuário.");
          setUserDoc(null);
        } finally {
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
    [error, loading, refreshUserDoc, user, userDoc],
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