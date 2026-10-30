// Credenciais independentes de funcionarios/{uid}.perfis (The Manuscript, funcionarios.md, "Credenciais").
// adm1 (substituído por frentista) e user não são mais lidos.
export interface AuthorizationProfile {
  exists: boolean;
  source: 'funcionarios' | null;
  ativo: boolean;
  adm2: boolean;
  motorista: boolean;
  frentista: boolean;
  mecanico: boolean;
  escritorio: boolean;
  engenharia: boolean;
  retr0: boolean;
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
    adm2: false,
    motorista: false,
    frentista: false,
    mecanico: false,
    escritorio: false,
    engenharia: false,
    retr0: false,
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
      adm2: profiles.adm2 === true,
      motorista: profiles.motorista === true,
      frentista: profiles.frentista === true,
      mecanico: profiles.mecanico === true,
      escritorio: profiles.escritorio === true,
      engenharia: profiles.engenharia === true,
      retr0: profiles.retr0 === true,
      id: employeeDoc.id,
      nome: typeof data.nome === 'string' && data.nome.trim() ? data.nome.trim() : null,
    };
  };
}
