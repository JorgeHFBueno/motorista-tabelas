import type { UserRecord } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { credenciaisDe } from './credenciais.js';

// Users list of Cadastros → Usuários (adminApi GET /api/admin/users). Contract: Manuscript funcionarios.md ("Usuários na WEB").
export type DadosFuncionario = Record<string, unknown> | undefined;
export type ContaAdmin = Pick<UserRecord, 'uid' | 'email' | 'displayName' | 'disabled'> & { metadata: Pick<UserRecord['metadata'], 'creationTime' | 'lastSignInTime'> };
// Reads the funcionarios/{uid} of several accounts at once; a missing document comes back undefined.
export type LerFuncionarios = (uids: string[]) => Promise<Map<string, DadosFuncionario>>;

const isoDe = (valor: unknown) => (valor instanceof Timestamp ? valor.toDate().toISOString() : null);

export function montarAdminUser(user: ContaAdmin, f: DadosFuncionario) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.metadata.creationTime,
    lastLoginAt: user.metadata.lastSignInTime,
    disabled: user.disabled,
    // null = account without an employee (for example, created by the old open sign-up).
    funcionario: f ? {
      nome: typeof f.nome === 'string' ? f.nome : null,
      email: typeof f.email === 'string' ? f.email : null,
      ativo: f.ativo === true,
      credenciais: credenciaisDe(f.perfis),
      ultimoAcesso: isoDe(f.ultimoAcesso),
    } : null,
  };
}

// Every account with its employee, read in a single call (until 2026-11-10 it was one Firestore read per account).
// Client portal logins (users/{uid} without an employee) are left out: they are managed in the portal area.
export async function listarAdminUsers(contas: ContaAdmin[], uidsClientes: Set<string>, lerFuncionarios: LerFuncionarios) {
  const funcionarios = await lerFuncionarios(contas.map((c) => c.uid));
  return contas
    .map((c) => montarAdminUser(c, funcionarios.get(c.uid)))
    .filter((u) => u.funcionario || !uidsClientes.has(u.uid));
}
