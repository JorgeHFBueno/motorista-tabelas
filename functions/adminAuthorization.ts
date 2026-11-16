import { areasDe, credenciaisDe, type Area, type Areas, type Credenciais, type Nivel } from './credenciais.js';

export type AdminAuthorization = {
  exists: boolean;
  ativo: boolean;
  credenciais: Credenciais;
  // WEB areas in force (the `areas` map, or the ones the old credentials stand for).
  areas: Areas;
};

type Employee = Record<string, any> | undefined;
type ReadEmployee = (uid: string) => Promise<Employee>;

export function createAdminAuthorizationReader(readEmployee: ReadEmployee) {
  return async (uid: string): Promise<AdminAuthorization> => {
    const employee = await readEmployee(uid);
    return {
      exists: employee !== undefined,
      ativo: employee?.ativo === true,
      credenciais: credenciaisDe(employee?.perfis),
      areas: areasDe(employee),
    };
  };
}

/** Active employee with the area at the level (adm2 always; no area = adm2 only). 'ver' accepts 'editar'. */
export function autorizaArea(authorization: AdminAuthorization, area: Area | undefined, nivel: Nivel): boolean {
  if (!authorization.ativo) return false;
  if (authorization.credenciais.adm2) return true;
  if (!area) return false;
  const tenho = authorization.areas[area];
  return nivel === 'ver' ? tenho === 'ver' || tenho === 'editar' : tenho === 'editar';
}

// adminApi groups, by the first segment after /api/admin: users (Cadastros) = see the list with GET, edit with
// anything else; clientes (Portal do cliente) = edit; anything else (maintenance) = adm2 only.
export function areaDaRota(caminho: string, metodo: string): { area: Area | undefined; nivel: Nivel } {
  const grupo = caminho.split('/')[1];
  if (grupo === 'users') return { area: 'cadastros', nivel: metodo === 'GET' ? 'ver' : 'editar' };
  if (grupo === 'clientes') return { area: 'portal', nivel: 'editar' };
  return { area: undefined, nivel: 'editar' };
}
