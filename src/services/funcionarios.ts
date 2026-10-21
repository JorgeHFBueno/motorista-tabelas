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

// Primeira letra das duas primeiras palavras (sem o domínio, se for e-mail); mesma regra do avatar do Friday.
export function iniciais(nome: string) {
  return nome.replace(/@.*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

const ROTULOS_PERFIS: Array<[string, string]> = [
  ['adm2', 'Adm2'],
  ['adm1', 'Adm1'],
  ['motorista', 'Motorista'],
  ['mecanico', 'Mecânico'],
  ['user', 'User'],
];

// Perfis marcados como true em funcionarios/{uid}.perfis, na ordem de importância; chaves desconhecidas vêm no fim.
export function perfisMarcados(perfis: unknown): string[] {
  if (!perfis || typeof perfis !== 'object') return [];
  const valores = perfis as Record<string, unknown>;
  const conhecidos = ROTULOS_PERFIS.filter(([chave]) => valores[chave] === true).map(([, rotulo]) => rotulo);
  const outros = Object.keys(valores).filter((chave) => valores[chave] === true && !ROTULOS_PERFIS.some(([c]) => c === chave)).sort();
  return [...conhecidos, ...outros];
}

const CAMPOS_CONHECIDOS = new Set(['nome', 'email', 'ativo', 'perfis', 'motorista', 'createdAt', 'updatedAt']);

// Campos de funcionarios/{uid} que a tela de perfil não exibe em destaque, para mostrá-los também.
export function camposExtrasFuncionario(data: Record<string, unknown>) {
  return Object.keys(data).filter((chave) => !CAMPOS_CONHECIDOS.has(chave)).sort().map((chave) => [chave, data[chave]] as const);
}

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
