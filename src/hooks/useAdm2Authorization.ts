import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { hasAdm2Permission } from '../services/adm2Authorization';

interface Adm2AuthorizationState {
  loading: boolean;
  authorized: boolean;
  error: boolean;
}

export function useAdm2Authorization(currentUser: User | null): Adm2AuthorizationState {
  const [state, setState] = useState<Adm2AuthorizationState>({
    loading: true,
    authorized: false,
    error: false,
  });

  useEffect(() => {
    let isMounted = true;

    async function validateAdm2() {
      if (!currentUser) {
        if (isMounted) {
          setState({ loading: false, authorized: false, error: false });
        }
        return;
      }

      const normalizedEmail = currentUser.email?.trim().toLowerCase();

      if (!normalizedEmail) {
        if (isMounted) {
          setState({ loading: false, authorized: false, error: false });
        }
        return;
      }

      if (isMounted) {
        setState({ loading: true, authorized: false, error: false });
      }

      try {
        const authorized = await hasAdm2Permission(normalizedEmail);

        if (isMounted) {
          setState({ loading: false, authorized, error: false });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Erro ao validar permissão adm2 no Firestore.', error);
        }

        if (isMounted) {
          setState({ loading: false, authorized: false, error: true });
        }
      }
    }

    void validateAdm2();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  return state;
}