import { useAuthorizationProfile } from './useAuthorizationProfile';
import { temCredencial, type Credencial } from '../services/credenciais';

// Checagem local de uma área (as Rules e as Functions conferem a mesma credencial). Sem credenciais: só adm2.
export function useCredencialAuthorization(...aceitas: Credencial[]) {
  const { loading, profile, error, errorDetail, checkedUid } = useAuthorizationProfile();
  return {
    loading,
    authorized: loading ? null : temCredencial(profile, ...aceitas),
    error,
    errorDetail,
    checkedUid,
  } as const;
}
