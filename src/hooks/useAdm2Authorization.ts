import { useAuthorizationProfile } from './useAuthorizationProfile';
import { isAdm2Authorized } from '../services/webAuthorization';

export function useAdm2Authorization() {
  const { loading, profile, error, errorDetail, checkedUid } = useAuthorizationProfile();
  return {
    loading,
    authorized: loading ? null : isAdm2Authorized(profile),
    error,
    errorDetail,
    checkedUid,
  } as const;
}
