import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { hasAdm2Permission } from '../services/adm2Authorization';

interface Adm2AuthorizationState {
    loading: boolean;
    authorized: boolean | null;
    error: boolean;
    checkedEmail: string | null;
}

export function useAdm2Authorization(currentUser: User | null, authLoading: boolean): Adm2AuthorizationState {
    const [state, setState] = useState<Adm2AuthorizationState>({
        loading: true,
        authorized: null,
        error: false,
        checkedEmail: null,
    });

    useEffect(() => {
        let isMounted = true;

        async function validateAdm2() {
            if (authLoading) {
                if (isMounted) {
                    setState({ loading: true, authorized: null, error: false, checkedEmail: null });
                }
                return;
            }

            if (!currentUser) {
                if (isMounted) {
                    setState({ loading: false, authorized: null, error: false, checkedEmail: null });
                }
                return;
            }

            const normalizedEmail = currentUser.email?.trim().toLowerCase();

            if (!normalizedEmail) {
                if (isMounted) {
                    setState({ loading: false, authorized: false, error: false, checkedEmail: null });
                }
                return;
            }

            if (isMounted) {
                setState({ loading: true, authorized: null, error: false, checkedEmail: normalizedEmail });
            }

            try {
                const authorized = await hasAdm2Permission(normalizedEmail);

                if (isMounted) {
                    setState({ loading: false, authorized, error: false, checkedEmail: normalizedEmail });
                }
            } catch (error) {
                if (import.meta.env.DEV) {
                    console.error('Erro ao validar permissão adm2 no Firestore.', error);
                }

                if (isMounted) {
                    setState({ loading: false, authorized: false, error: true, checkedEmail: normalizedEmail });
                }
            }
        }

        void validateAdm2();

        return () => {
            isMounted = false;
        };
    }, [authLoading, currentUser]);

    return state;
}