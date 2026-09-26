import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { app } from '../firebase';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getAuthorizationProfile, type AuthorizationProfile } from '../services/authorizationProfile';
import {
  pendingAuthorization,
  resolveAuthorizationSession,
  type AuthorizationSessionState,
} from '../services/authorizationSession';
import { isAdm2Authorized } from '../services/webAuthorization';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  authorizationLoading: boolean;
  authorizationProfile: AuthorizationProfile | null;
  authorizationError: Error | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  authorizationLoading: true,
  authorizationProfile: null,
  authorizationError: null,
  isAdmin: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizationState, setAuthorizationState] = useState<AuthorizationSessionState>(
    pendingAuthorization(null),
  );
  const auth = getAuth(app);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, [auth]);

  useEffect(() => {
    const uid = currentUser?.uid ?? null;
    if (loading) {
      setAuthorizationState(pendingAuthorization(uid));
      return;
    }
    if (uid === null) {
      setAuthorizationState({ uid: null, loading: false, profile: null, error: null });
      return;
    }

    let cancelled = false;
    setAuthorizationState(pendingAuthorization(uid));
    void getAuthorizationProfile(uid)
      .then((profile) => {
        if (!cancelled) setAuthorizationState({ uid, loading: false, profile, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuthorizationState({
            uid,
            loading: false,
            profile: null,
            error: error instanceof Error ? error : new Error('authorization_profile_read_failed'),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, loading]);

  const resolvedAuthorization = resolveAuthorizationSession(
    currentUser?.uid ?? null,
    loading,
    authorizationState,
  );

  const value = useMemo<AuthContextType>(() => ({
    currentUser,
    loading,
    authorizationLoading: resolvedAuthorization.loading,
    authorizationProfile: resolvedAuthorization.profile,
    authorizationError: resolvedAuthorization.error,
    isAdmin: isAdm2Authorized(resolvedAuthorization.profile),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      setAuthorizationState({ uid: null, loading: false, profile: null, error: null });
      await firebaseSignOut(auth);
    },
  }), [auth, currentUser, loading, resolvedAuthorization]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
