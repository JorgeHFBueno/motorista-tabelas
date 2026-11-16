import { CREDENCIAIS } from './credenciais';
import { AREAS, areasValidas } from './areasWeb';

// Primeira letra das duas primeiras palavras (sem o domínio, se for e-mail); mesma regra do avatar do Friday.
export function iniciais(nome: string) {
  return nome.replace(/@.*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

// Credenciais marcadas em funcionarios/{uid}.perfis, na ordem da lista (adm1 e user, que não valem mais, ficam de fora).
export function perfisMarcados(perfis: unknown): string[] {
  if (!perfis || typeof perfis !== 'object') return [];
  const valores = perfis as Record<string, unknown>;
  return CREDENCIAIS.filter((c) => valores[c.chave] === true).map((c) => c.rotulo);
}

// Áreas da WEB de funcionarios/{uid}.areas, na ordem da lista; "(ver)" quando a pessoa só vê.
export function areasMarcadas(areas: unknown): string[] {
  const validas = areasValidas(areas);
  return AREAS.filter((a) => validas[a.chave]).map((a) => (validas[a.chave] === 'ver' ? `${a.rotulo} (ver)` : a.rotulo));
}

const CAMPOS_CONHECIDOS = new Set(['nome', 'email', 'ativo', 'perfis', 'areas', 'motorista', 'createdAt', 'updatedAt', 'ultimoAcesso']);

// Campos de funcionarios/{uid} que a tela de perfil não exibe em destaque, para mostrá-los também.
export function camposExtrasFuncionario(data: Record<string, unknown>) {
  return Object.keys(data).filter((chave) => !CAMPOS_CONHECIDOS.has(chave)).sort().map((chave) => [chave, data[chave]] as const);
}
