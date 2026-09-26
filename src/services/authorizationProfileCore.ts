export interface AuthorizationProfile {
  exists: boolean;
  source: 'funcionarios' | null;
  ativo: boolean;
  adm1: boolean;
  adm2: boolean;
  user: boolean;
  motorista: boolean;
  id: string | null;
  nome: string | null;
}

export interface FuncionarioDocument {
  exists(): boolean;
  id: string;
  data(): Record<string, unknown> | undefined;
}

type ReadFuncionario = (uid: string) => Promise<FuncionarioDocument>;

export function emptyAuthorizationProfile(): AuthorizationProfile {
  return {
    exists: false,
    source: null,
    ativo: false,
    adm1: false,
    adm2: false,
    user: false,
    motorista: false,
    id: null,
    nome: null,
  };
}

export function createAuthorizationProfileReader(readFuncionario: ReadFuncionario) {
  return async (uid: string): Promise<AuthorizationProfile> => {
    if (typeof uid !== 'string' || uid.length === 0) return emptyAuthorizationProfile();

    const employeeDoc = await readFuncionario(uid);
    if (!employeeDoc.exists()) return emptyAuthorizationProfile();

    const data = employeeDoc.data() ?? {};
    const profiles = data.perfis && typeof data.perfis === 'object'
      ? data.perfis as Record<string, unknown>
      : {};

    return {
      exists: true,
      source: 'funcionarios',
      ativo: data.ativo === true,
      adm1: profiles.adm1 === true,
      adm2: profiles.adm2 === true,
      user: profiles.user === true,
      motorista: profiles.motorista === true,
      id: employeeDoc.id,
      nome: typeof data.nome === 'string' && data.nome.trim() ? data.nome.trim() : null,
    };
  };
}
