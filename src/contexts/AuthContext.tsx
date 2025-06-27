import { createContext, useContext, useEffect, useState } from 'react';
import { app } from '../firebase';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

interface AuthContextType {
  currentUser: User | null;
  customClaims: Record<string, any> | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  customClaims: null,
  loading: true,
  isAdmin: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [customClaims, setCustomClaims] = useState<Record<string, any> | null>(null);
const [loading, setLoading] = useState(true);
  const auth = getAuth(app);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, [auth]);

  useEffect(() => {
    if (!currentUser) {
      setCustomClaims(null);
      return;
    }
    currentUser.getIdTokenResult()
      .then(res => setCustomClaims(res.claims))
      .catch(() => setCustomClaims(null));
  }, [currentUser]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const isAdmin = !!customClaims?.admin;

  return (
    <AuthContext.Provider value={{ currentUser, customClaims, loading, isAdmin, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}