import { useAuth } from '../contexts/AuthContext';

export function useAuthorizationProfile() {
  const {
    authorizationLoading: loading,
    authorizationProfile: profile,
    authorizationError,
    currentUser,
  } = useAuth();

  return {
    loading,
    profile,
    error: authorizationError !== null,
    errorDetail: authorizationError,
    checkedUid: currentUser?.uid ?? null,
  } as const;
}
