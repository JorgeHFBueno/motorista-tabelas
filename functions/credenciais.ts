// Independent credentials of funcionarios/{uid}.perfis (Manuscript funcionarios.md, "Credenciais"). Each flow checks
// its own credential and adm2 enters everything except the exclusive ones (below). adm1 (replaced by frentista) and user are no longer read.
export const CREDENCIAIS = ['adm2', 'motorista', 'frentista', 'mecanico', 'escritorio', 'engenharia', 'logistica', 'autor', 'retr0'] as const;
// Credentials adm2 does not get for free (retr0: WEB DEV area, owner's decision on 2026-10-30).
export type Credencial = (typeof CREDENCIAIS)[number];
export type Credenciais = Record<Credencial, boolean>;
export const CREDENCIAIS_EXCLUSIVAS: readonly Credencial[] = ['retr0'];

type Funcionario = Record<string, unknown> | null | undefined;

export function credenciaisDe(perfis: unknown): Credenciais {
  const valores = perfis && typeof perfis === 'object' ? (perfis as Record<string, unknown>) : {};
  return Object.fromEntries(CREDENCIAIS.map((c) => [c, valores[c] === true])) as Credenciais;
}

/** Active employee holding one of the accepted credentials (adm2 is accepted, except for exclusive ones). */
export function temCredencial(funcionario: Funcionario, ...aceitas: Credencial[]): funcionario is Record<string, unknown> {
  if (funcionario?.ativo !== true) return false;
  const c = credenciaisDe(funcionario.perfis);
  if (aceitas.length === 0) return c.adm2;
  return aceitas.some((a) => c[a] || (c.adm2 && !CREDENCIAIS_EXCLUSIVAS.includes(a)));
}

// Credentials only adm2 grants or removes, and accounts holding them only adm2 changes (Cadastros is also open to
// escritorio, which must not make itself adm2 nor take over an adm2 account by setting its password).
export const CREDENCIAIS_SO_ADM2: readonly Credencial[] = ['adm2', ...CREDENCIAIS_EXCLUSIVAS];

/** The credentials hold one that only adm2 manages. */
export function temCredencialSoAdm2(c: Credenciais | null | undefined): boolean {
  return !!c && CREDENCIAIS_SO_ADM2.some((k) => c[k]);
}

/** Active employee holding at least one credential (entry to the app and to the WEB). */
export function temAlgumaCredencial(funcionario: Funcionario): funcionario is Record<string, unknown> {
  if (funcionario?.ativo !== true) return false;
  const c = credenciaisDe(funcionario.perfis);
  return CREDENCIAIS.some((k) => c[k]);
}

/** Credentials sent by the WEB: an object with a boolean per known credential (missing ones are false). */
export function lerCredenciais(entrada: unknown): Credenciais | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const valores = entrada as Record<string, unknown>;
  if (Object.values(valores).some((v) => typeof v !== 'boolean')) return null;
  return credenciaisDe(valores);
}

/**
 * Credentials of a PATCH: the keys sent replace the current ones and the keys left out stay as they are (the app's
 * DEV → Usuários screen sends only the credentials it knows; a missing key must not wipe retr0, autor or logistica).
 */
export function mesclarCredenciais(atuais: unknown, entrada: unknown): Credenciais | null {
  const lidas = lerCredenciais(entrada);
  if (!lidas) return null;
  const enviadas = entrada as Record<string, unknown>;
  const antes = credenciaisDe(atuais);
  return Object.fromEntries(CREDENCIAIS.map((c) => [c, c in enviadas ? lidas[c] : antes[c]])) as Credenciais;
}

/**
 * Data migration of the switch: frentista = frentista || adm1; adm1 and user leave the document.
 * Returns the new perfis map and whether anything changes.
 */
export function migrarPerfis(perfis: unknown): { perfis: Credenciais; mudou: boolean } {
  const valores = perfis && typeof perfis === 'object' ? (perfis as Record<string, unknown>) : {};
  const novos = credenciaisDe({ ...valores, frentista: valores.frentista === true || valores.adm1 === true });
  const mudou = 'adm1' in valores || 'user' in valores || novos.frentista !== (valores.frentista === true);
  return { perfis: novos, mudou };
}
