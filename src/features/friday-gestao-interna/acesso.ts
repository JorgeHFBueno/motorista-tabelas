import type { AuthorizationProfile } from '../../services/authorizationProfileCore';
import { temCredencial, type Credencial } from '../../services/credenciais';

// Quem entra no Friday: funcionário ativo com escritorio ou mecanico; o adm2 entra, como em todas as áreas. Vale para a
// rota, o menu e as pessoas que o Friday oferece (responsável, menção, permissões, chaves de API). As Rules e a fridayApi
// (functions/fridayApiDominio.ts) conferem a mesma regra do lado delas.
export const CREDENCIAIS_FRIDAY: Exclude<Credencial, 'adm2'>[] = ['escritorio', 'mecanico'];

export const entraNoFriday = (perfil: AuthorizationProfile | null) => temCredencial(perfil, ...CREDENCIAIS_FRIDAY);
