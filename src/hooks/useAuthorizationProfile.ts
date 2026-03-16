import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getAuthorizationProfile, type AuthorizationProfile } from '../services/authorizationProfile';

interface AuthorizationProfileState {
  loading: boolean;
  profile: AuthorizationProfile | null;
  error: boolean;
  checkedEmail: string | null;
}

export function useAuthorizationProfile(currentUser: User | null, authLoading: boolean): AuthorizationProfileState {
  const [state, setState] = useState<AuthorizationProfileState>({
    loading: true,
    profile: null,
    error: false,
    checkedEmail: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadAuthorizationProfile() {
      if (authLoading) {
        if (isMounted) {
          setState({ loading: true, profile: null, error: false, checkedEmail: null });
        }
        return;
      }

      if (!currentUser) {
        if (isMounted) {
          setState({ loading: false, profile: null, error: false, checkedEmail: null });
        }
        return;
      }

      const normalizedEmail = currentUser.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        if (isMounted) {
          setState({ loading: false, profile: { exists: false, adm1: false, adm2: false }, error: false, checkedEmail: null });
        }
        return;
      }

      if (isMounted) {
        setState({ loading: true, profile: null, error: false, checkedEmail: normalizedEmail });
      }

      try {
        const profile = await getAuthorizationProfile(normalizedEmail);
        if (import.meta.env.DEV) {
          console.info('[authz] perfil detectado', { email: normalizedEmail, adm1: profile.adm1, adm2: profile.adm2, exists: profile.exists });
        }

        if (isMounted) {
          setState({ loading: false, profile, error: false, checkedEmail: normalizedEmail });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[authz] erro ao carregar perfil de autorização', error);
        }
        if (isMounted) {
          setState({ loading: false, profile: null, error: true, checkedEmail: normalizedEmail });
        }
      }
    }

    void loadAuthorizationProfile();

    return () => {
      isMounted = false;
    };
  }, [authLoading, currentUser]);

  return state;
}