import type { AuthorizationProfile } from './authorizationProfileCore';

// Credenciais independentes (The Manuscript, funcionarios.md): cada área confere a sua e o adm2 entra em tudo.
// A mesma lista e as mesmas regras estão nas Functions (functions/credenciais.ts) e nas Rules.
export const CREDENCIAIS = [
  { chave: 'adm2', rotulo: 'Adm2', descricao: 'Administração: entra em tudo, no app e na WEB' },
  { chave: 'motorista', rotulo: 'Motorista', descricao: 'Saída e Chegada no app; aparece na lista de motoristas' },
  { chave: 'frentista', rotulo: 'Frentista', descricao: 'Combustível no app e no Kiosk' },
  { chave: 'mecanico', rotulo: 'Mecânico', descricao: 'Checklist no app' },
  { chave: 'escritorio', rotulo: 'Escritório', descricao: 'Friday, na WEB' },
  { chave: 'engenharia', rotulo: 'Engenharia', descricao: 'Telas de Engenharia, na WEB' },
] as const;

export type Credencial = (typeof CREDENCIAIS)[number]['chave'];
export type Credenciais = Record<Credencial, boolean>;

export const semCredenciais = (): Credenciais =>
  Object.fromEntries(CREDENCIAIS.map((c) => [c.chave, false])) as Credenciais;

/** Funcionário ativo com uma das credenciais aceitas (o adm2 sempre entra; sem aceitas, só o adm2). */
export function temCredencial(profile: AuthorizationProfile | null, ...aceitas: Credencial[]): boolean {
  if (profile?.ativo !== true) return false;
  return profile.adm2 || aceitas.some((c) => profile[c]);
}

/** Funcionário ativo com ao menos uma credencial: entra na WEB (Meu perfil e o que a credencial liberar). */
export function temAlgumaCredencial(profile: AuthorizationProfile | null): boolean {
  if (profile?.ativo !== true) return false;
  return CREDENCIAIS.some((c) => profile[c.chave]);
}
