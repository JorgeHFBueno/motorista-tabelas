import { connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { TipoLogin } from './loginIdentifier';

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  try { connectFunctionsEmulator(functions, '127.0.0.1', 5001); } catch { /* já conectado */ }
}

export type AtualizarMeuPerfilEntrada = { nome?: string; login?: { tipo: TipoLogin; valor: string } };

// Troca o próprio nome e/ou login (Function atualizarMeuPerfil): atualiza Firebase Auth e funcionarios.
export async function atualizarMeuPerfil(entrada: AtualizarMeuPerfilEntrada) {
  const callable = httpsCallable<AtualizarMeuPerfilEntrada, { nome: string; email: string }>(functions, 'atualizarMeuPerfil');
  return (await callable(entrada)).data;
}

// A Function pede login recente para trocar o login; a página então pede a senha e tenta de novo.
export function pedeLoginRecente(erro: unknown) {
  const e = erro as { code?: unknown; details?: { motivo?: unknown } } | null;
  return e?.code === 'auth/requires-recent-login' || e?.details?.motivo === 'requires-recent-login';
}
