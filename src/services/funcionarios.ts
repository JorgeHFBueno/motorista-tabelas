export type FuncionarioPerfis = {
  adm1: boolean;
  adm2: boolean;
  user: boolean;
  motorista: boolean;
};

export type Funcionario = {
  nome: string;
  email: string;
  ativo: boolean;
  perfis: FuncionarioPerfis;
  motorista?: { ordem: number };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type LegacyAuthorizedRecord = {
  id: string;
  nome?: string;
  adm1?: boolean;
  adm2?: boolean;
};

export type LegacyMotoristaRecord = {
  id: string;
  nome?: string;
  ativo?: boolean;
  ordem?: number;
};

export function normalizeName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function namesAreEquivalent(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(normalizeName(left) && normalizeName(left) === normalizeName(right));
}

export function buildFuncionario(input: {
  nome: string;
  email: string;
  ativo: boolean;
  autorizado?: LegacyAuthorizedRecord | null;
  motorista?: LegacyMotoristaRecord | null;
}) : Omit<Funcionario, 'createdAt' | 'updatedAt'> {
  const adm1 = input.autorizado?.adm1 === true;
  const adm2 = input.autorizado?.adm2 === true;
  const motorista = input.motorista ?? null;

  return {
    nome: input.nome.trim(),
    email: input.email.trim().toLowerCase(),
    ativo: input.ativo,
    perfis: { adm1, adm2, user: false, motorista: Boolean(motorista) },
    ...(motorista ? { motorista: { ordem: typeof motorista.ordem === 'number' ? motorista.ordem : 0 } } : {}),
  };
}
