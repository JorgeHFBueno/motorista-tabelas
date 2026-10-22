export const PHONE_LOGIN_DOMAIN = '@example.com';

export function normalizePhoneIdentifier(value: string) {
  return value.replace(/\D/g, '');
}

export function isValidEmailIdentifier(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Campo único "Celular ou e-mail": com "@" é e-mail; sem "@" é celular (só os dígitos + domínio legado).
// Vazio quando não há o que usar. Mesma regra do app e da Function atualizarMeuPerfil.
export function prepareLoginIdentifier(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.includes('@')) return trimmedValue.toLowerCase();

  const digits = normalizePhoneIdentifier(trimmedValue);
  return digits ? `${digits}${PHONE_LOGIN_DOMAIN}` : '';
}

export type TipoLogin = 'celular' | 'email';

// Login por celular é um e-mail sintético (<números>@example.com); para exibir, volta a ser o celular.
export function descreverLogin(email: string | null | undefined): { tipo: TipoLogin; valor: string } {
  const valor = (email ?? '').trim().toLowerCase();
  if (valor.endsWith(PHONE_LOGIN_DOMAIN)) return { tipo: 'celular', valor: valor.slice(0, -PHONE_LOGIN_DOMAIN.length) };
  return { tipo: 'email', valor };
}

// (51) 99166-2971, 99166-2971 ou 9166-2971; outros tamanhos ficam só com os números.
export function formatarCelular(valor: string) {
  const d = normalizePhoneIdentifier(valor);
  if (d.length === 11 || d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
  if (d.length === 9 || d.length === 8) return `${d.slice(0, -4)}-${d.slice(-4)}`;
  return d;
}
