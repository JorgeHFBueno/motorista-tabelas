export type ConciliationStatus = 'PRONTO' | 'PENDENTE' | 'CONFLITO' | 'SEM_AUTH' | 'JA_CONCILIADO';

export type AuthorizedRecord = {
  nome?: string;
  adm1?: boolean;
  adm2?: boolean;
};

export type MotoristRecord = {
  nome?: string;
  ativo?: boolean | null;
  ordem?: number;
};

export type EmployeeProfiles = { adm1: boolean; adm2: boolean; user: boolean; motorista: boolean };

export function normalizeName(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    : '';
}

export function classifyConciliation(input: {
  auth: boolean;
  authorized: boolean;
  motorist: boolean;
  motoristCandidates: number;
  employee: boolean;
}): ConciliationStatus {
  if (input.employee) return 'JA_CONCILIADO';
  if (!input.auth) return 'SEM_AUTH';
  if (input.motoristCandidates > 1) return 'CONFLITO';
  if (input.authorized || input.motorist) return 'PRONTO';
  return 'PENDENTE';
}

export function computeFuncionarioAtivo(input: {
  authDisabled: boolean;
  motorista?: MotoristRecord | null;
  requestedAtivo?: boolean;
}) {
  return input.requestedAtivo !== false
    && !input.authDisabled
    && (input.motorista == null || input.motorista.ativo === true);
}

export function buildFuncionario(input: {
  nome: string;
  email: string;
  authDisabled: boolean;
  autorizado?: AuthorizedRecord | null;
  motorista?: MotoristRecord | null;
  requestedAtivo?: boolean;
}) {
  const motorista = input.motorista ?? null;
  const profiles: EmployeeProfiles = {
    adm1: input.autorizado?.adm1 === true,
    adm2: input.autorizado?.adm2 === true,
    user: false,
    motorista: Boolean(motorista),
  };

  return {
    nome: input.nome.trim(),
    email: input.email.trim().toLowerCase(),
    ativo: computeFuncionarioAtivo(input),
    perfis: profiles,
    ...(motorista ? { motorista: { ordem: typeof motorista.ordem === 'number' ? motorista.ordem : 0 } } : {}),
  };
}
