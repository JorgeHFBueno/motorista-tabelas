import type { AuthorizationProfile } from './authorizationProfile';

export interface AuthorizationSessionState {
  uid: string | null;
  loading: boolean;
  profile: AuthorizationProfile | null;
  error: Error | null;
}

export function pendingAuthorization(uid: string | null): AuthorizationSessionState {
  return { uid, loading: uid !== null, profile: null, error: null };
}

export function resolveAuthorizationSession(
  currentUid: string | null,
  authLoading: boolean,
  state: AuthorizationSessionState,
): AuthorizationSessionState {
  if (authLoading) return pendingAuthorization(currentUid);
  if (currentUid === null) return { uid: null, loading: false, profile: null, error: null };
  if (state.uid !== currentUid) return pendingAuthorization(currentUid);
  return state;
}
