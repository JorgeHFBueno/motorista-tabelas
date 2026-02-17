import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { auth, authPersistenceReady, db } from "@/lib/firebase";

interface AuthContextData {
  user: User | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  signup: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};

    const initializeAuth = async () => {
      try {
        await authPersistenceReady;
      } finally {
        unsubscribe = onAuthStateChanged(auth, (currentUser) => {
          setUser(currentUser);
          setLoading(false);
        });
      }
    };

    initializeAuth();

    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (email: string, senha: string) => {
        await signInWithEmailAndPassword(auth, email, senha);
      },
      signup: async (email: string, senha: string) => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
        const uid = userCredential.user.uid;

        await setDoc(
          doc(db, "clientes", uid),
          {
            uid,
            email,
            status: "ativo",
            role: "cliente",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      },
      logout: async () => {
        await signOut(auth);
      },
      signOut: async () => {
        await signOut(auth);
      },
    }),
    [loading, user],
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