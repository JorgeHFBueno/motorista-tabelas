// Independent credentials of funcionarios/{uid}.perfis (Manuscript funcionarios.md, "Credenciais"). Each flow checks
// its own credential and adm2 enters everything except the exclusive ones (below). adm1 (replaced by frentista) and user are no longer read.
export const CREDENCIAIS = ['adm2', 'motorista', 'frentista', 'mecanico', 'escritorio', 'engenharia', 'logistica', 'autor', 'retr0'] as const;
// Credentials adm2 does not get for free (retr0: WEB DEV area, owner's decision on 2026-10-30).
export type Credencial = (typeof CREDENCIAIS)[number];
export type Credenciais = Record<Credencial, boolean>;
export const CREDENCIAIS_EXCLUSIVAS: readonly Credencial[] = ['retr0'];

type Funcionario = Record<string, unknown> | null | undefined;

export const semCredenciais = (): Credenciais => Object.fromEntries(CREDENCIAIS.map((c) => [c, false])) as Credenciais;

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
// non-adm2 people, who must not make themselves adm2 nor take over an adm2 account by setting its password).
export const CREDENCIAIS_SO_ADM2: readonly Credencial[] = ['adm2', ...CREDENCIAIS_EXCLUSIVAS];

// Credentials a non-adm2 person of Cadastros (editar) may give or take: the app ones.
export const CREDENCIAIS_DO_CADASTRO: readonly Credencial[] = ['motorista', 'frentista', 'mecanico'];

/** A non-adm2 change that touches a credential outside CREDENCIAIS_DO_CADASTRO (adm2, retr0 or an old WEB one). */
export function mudaCredencialProibida(antes: Credenciais, depois: Credenciais): boolean {
  return CREDENCIAIS.some((c) => !CREDENCIAIS_DO_CADASTRO.includes(c) && antes[c] !== depois[c]);
}

// Old WEB-only credentials (2026-11-06). Since 2026-11-16 the WEB reads `areas` (below); these keys only feed the
// areas of a document that has no `areas` yet, and only adm2 changes them. They leave perfis after the migration.
export const CREDENCIAIS_ANTIGAS: readonly Credencial[] = ['escritorio', 'engenharia', 'logistica', 'autor'];

// ---------------------------------------------------------------- WEB areas (owner's decision, 2026-11-16)
// funcionarios/{uid}.areas = { area: 'ver' | 'editar' }; a missing area = no access. adm2 sees and edits every area.
// Friday has one level (stored as 'editar'). Only adm2 grants areas. The same lists are in src/services/credenciais.ts
// and in the Rules (nivelArea).
export const AREAS = ['combustivel', 'frota', 'logistica', 'engenharia', 'portal', 'cadastros', 'manuscript', 'friday'] as const;
export type Area = (typeof AREAS)[number];
export type Nivel = 'ver' | 'editar';
export type Areas = Partial<Record<Area, Nivel>>;
export const AREAS_NIVEL_UNICO: readonly Area[] = ['friday'];

// Areas each old credential stood for (the migration table approved on 2026-11-16, everyone at 'editar').
export const AREAS_DA_CREDENCIAL_ANTIGA: Readonly<Partial<Record<Credencial, readonly Area[]>>> = {
  mecanico: ['frota', 'combustivel', 'logistica', 'friday'],
  logistica: ['frota', 'combustivel', 'logistica'],
  escritorio: ['friday', 'cadastros', 'portal'],
  engenharia: ['engenharia', 'portal'],
  autor: ['manuscript'],
};

/** Areas a document's old credentials stand for, all at 'editar'. */
export function areasDasCredenciais(perfis: unknown): Areas {
  const c = credenciaisDe(perfis);
  const areas: Areas = {};
  for (const [credencial, lista] of Object.entries(AREAS_DA_CREDENCIAL_ANTIGA)) {
    if (c[credencial as Credencial]) for (const a of lista ?? []) areas[a] = 'editar';
  }
  return areas;
}

/** Valid areas of a stored map (unknown keys and values are dropped; Friday is always 'editar'). */
export function areasValidas(valor: unknown): Areas {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const areas: Areas = {};
  for (const a of AREAS) {
    if (v[a] === 'editar' || (v[a] === 'ver' && !AREAS_NIVEL_UNICO.includes(a))) areas[a] = v[a] as Nivel;
    else if (v[a] === 'ver') areas[a] = 'editar';
  }
  return areas;
}

/** Areas in force: the `areas` map when the document has one, otherwise the ones its old credentials stand for. */
export function areasDe(funcionario: Funcionario): Areas {
  if (!funcionario) return {};
  return 'areas' in funcionario ? areasValidas(funcionario.areas) : areasDasCredenciais(funcionario.perfis);
}

/** Active employee who sees the area (adm2 sees every area). */
export function veArea(funcionario: Funcionario, ...areas: Area[]): funcionario is Record<string, unknown> {
  if (funcionario?.ativo !== true) return false;
  if (credenciaisDe(funcionario.perfis).adm2) return true;
  const minhas = areasDe(funcionario);
  return areas.some((a) => minhas[a] === 'ver' || minhas[a] === 'editar');
}

/** Active employee who edits the area (adm2 edits every area). */
export function editaArea(funcionario: Funcionario, ...areas: Area[]): funcionario is Record<string, unknown> {
  if (funcionario?.ativo !== true) return false;
  if (credenciaisDe(funcionario.perfis).adm2) return true;
  const minhas = areasDe(funcionario);
  return areas.some((a) => minhas[a] === 'editar');
}

/** Areas sent by the WEB (adm2 only): the whole map; null when a key or a level is not valid. */
export function lerAreas(entrada: unknown): Areas | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const valores = entrada as Record<string, unknown>;
  for (const [a, n] of Object.entries(valores)) {
    if (!(AREAS as readonly string[]).includes(a)) return null;
    if (n !== 'editar' && !(n === 'ver' && !AREAS_NIVEL_UNICO.includes(a as Area))) return null;
  }
  return valores as Areas;
}

/** Migration step 'areas': the areas map for a document without one. */
export function migrarAreas(funcionario: Funcionario): { areas: Areas; mudou: boolean } {
  if (funcionario && 'areas' in funcionario) return { areas: areasValidas(funcionario.areas), mudou: false };
  return { areas: areasDasCredenciais(funcionario?.perfis), mudou: true };
}

/** Migration step 'limpar': the perfis map without the old WEB credentials. */
export function limparCredenciaisAntigas(perfis: unknown): { perfis: Record<string, unknown>; mudou: boolean } {
  const valores = perfis && typeof perfis === 'object' ? { ...(perfis as Record<string, unknown>) } : {};
  const mudou = CREDENCIAIS_ANTIGAS.some((c) => c in valores);
  for (const c of CREDENCIAIS_ANTIGAS) delete valores[c];
  return { perfis: valores, mudou };
}

/** The credentials hold one that only adm2 manages. */
export function temCredencialSoAdm2(c: Credenciais | null | undefined): boolean {
  return !!c && CREDENCIAIS_SO_ADM2.some((k) => c[k]);
}

/** Active employee holding at least one credential or WEB area (entry to the WEB and Meu perfil). */
export function temAlgumaCredencial(funcionario: Funcionario): funcionario is Record<string, unknown> {
  if (funcionario?.ativo !== true) return false;
  const c = credenciaisDe(funcionario.perfis);
  return CREDENCIAIS.some((k) => c[k]) || Object.keys(areasDe(funcionario)).length > 0;
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

