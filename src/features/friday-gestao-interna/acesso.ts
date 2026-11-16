import type { AuthorizationProfile } from '../../services/authorizationProfileCore';
import { veArea } from '../../services/credenciais';

// Quem entra no Friday: funcionário ativo com a área friday (um nível só, desde 2026-11-16); o adm2 entra, como em
// todas as áreas. Vale para a rota, o menu e as pessoas que o Friday oferece (responsável, menção, permissões, chaves de
// API). As Rules e a fridayApi (functions/fridayApiDominio.ts) conferem a mesma regra do lado delas.
export const entraNoFriday = (perfil: AuthorizationProfile | null) => veArea(perfil, 'friday');
