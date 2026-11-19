import type { AuthorizationProfile } from './authorizationProfileCore';
import type { Area } from './areasWeb';

// Credenciais independentes (The Manuscript, funcionarios.md): as do app e a retr0; a WEB confere as áreas
// (veArea/editaArea, abaixo). O adm2 entra em tudo, salvo nas exclusivas.
// A mesma lista e as mesmas regras estão nas Functions (functions/credenciais.ts) e nas Rules.
export const CREDENCIAIS = [
  { chave: 'adm2', rotulo: 'Adm2', descricao: 'Administração: entra em tudo, no app e na WEB' },
  { chave: 'motorista', rotulo: 'Motorista', descricao: 'Saída e Chegada no app e na WEB; aparece na lista de motoristas' },
  { chave: 'frentista', rotulo: 'Frentista', descricao: 'Combustível no app e no Kiosk' },
  { chave: 'mecanico', rotulo: 'Mecânico', descricao: 'Checklist no app e na WEB; no app, registra Saída e Chegada por outra pessoa' },
  { chave: 'retr0', rotulo: 'Retr0', descricao: 'Área DEV (/dev), na WEB; nem o adm2 entra sem ela' },
] as const;

export type Credencial = (typeof CREDENCIAIS)[number]['chave'];
export type Credenciais = Record<Credencial, boolean>;

export const semCredenciais = (): Credenciais =>
  Object.fromEntries(CREDENCIAIS.map((c) => [c.chave, false])) as Credenciais;

// Credenciais que o adm2 não ganha de graça: só quem as tem entra (retr0: área DEV, decisão do responsável em 2026-10-30).
export const CREDENCIAIS_EXCLUSIVAS: readonly Credencial[] = ['retr0'];

// Credenciais que só o adm2 dá ou tira; conta que tem uma delas só o adm2 muda. A adminApi confere o mesmo
// (functions/credenciais.ts).
export const CREDENCIAIS_SO_ADM2: readonly Credencial[] = ['adm2', ...CREDENCIAIS_EXCLUSIVAS];

// Credenciais do app que quem edita Cadastros (sem ser adm2) pode dar ou tirar.
export const CREDENCIAIS_DO_CADASTRO: readonly Credencial[] = ['motorista', 'frentista', 'mecanico'];

/** Funcionário ativo com uma das credenciais aceitas (o adm2 entra, salvo nas exclusivas; sem aceitas, só o adm2). */
export function temCredencial(profile: AuthorizationProfile | null, ...aceitas: Credencial[]): boolean {
  if (profile?.ativo !== true) return false;
  if (aceitas.length === 0) return profile.adm2;
  return aceitas.some((c) => profile[c] || (profile.adm2 && !CREDENCIAIS_EXCLUSIVAS.includes(c)));
}

/** Funcionário ativo com ao menos uma credencial ou área: entra na WEB (Meu perfil e o que liberar). */
export function temAlgumaCredencial(profile: AuthorizationProfile | null): boolean {
  if (profile?.ativo !== true) return false;
  return CREDENCIAIS.some((c) => profile[c.chave]) || Object.keys(profile.areas).length > 0;
}

/** Funcionário ativo que vê uma das áreas (o adm2 vê todas). */
export function veArea(profile: AuthorizationProfile | null, ...areas: Area[]): boolean {
  if (profile?.ativo !== true) return false;
  return profile.adm2 || areas.some((a) => profile.areas[a] === 'ver' || profile.areas[a] === 'editar');
}

/** Funcionário ativo que edita uma das áreas (o adm2 edita todas). */
export function editaArea(profile: AuthorizationProfile | null, ...areas: Area[]): boolean {
  if (profile?.ativo !== true) return false;
  return profile.adm2 || areas.some((a) => profile.areas[a] === 'editar');
}
