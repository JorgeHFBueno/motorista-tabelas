import type { AuthorizationProfile } from './authorizationProfile';

// Administração da WEB (Cadastros, Combustível, Frota, Registros, Bombas, Kiosk, The Manuscript): só adm2.
export function isAdm2Authorized(profile: AuthorizationProfile | null): boolean {
  return profile?.ativo === true && profile.adm2 === true;
}
