export type AdminAuthorization = {
  exists: boolean;
  ativo: boolean;
  adm1: boolean;
  adm2: boolean;
};

type Employee = Record<string, any> | undefined;
type ReadEmployee = (uid: string) => Promise<Employee>;

export function createAdminAuthorizationReader(readEmployee: ReadEmployee) {
  return async (uid: string): Promise<AdminAuthorization> => {
    const employee = await readEmployee(uid);
    return {
      exists: employee !== undefined,
      ativo: employee?.ativo === true,
      adm1: employee?.perfis?.adm1 === true,
      adm2: employee?.perfis?.adm2 === true,
    };
  };
}
