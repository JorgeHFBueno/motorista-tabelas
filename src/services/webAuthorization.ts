import type { AuthorizationProfile } from './authorizationProfile';

export function isWebAdminAuthorized(profile: AuthorizationProfile | null): boolean {
  return profile?.ativo === true && (profile.adm1 === true || profile.adm2 === true);
}

export function isAdm2Authorized(profile: AuthorizationProfile | null): boolean {
  return profile?.ativo === true && profile.adm2 === true;
}

export function isAdm1Only(profile: AuthorizationProfile | null): boolean {
  return profile?.ativo === true && profile.adm1 === true && profile.adm2 !== true;
}
