import { credenciaisDe, type Credenciais } from './credenciais.js';

export type AdminAuthorization = {
  exists: boolean;
  ativo: boolean;
  credenciais: Credenciais;
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
    };
  };
}
