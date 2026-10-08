export type KioskCredentialUser = {
  uid: string;
  funcionario?: {
    ativo?: unknown;
    perfis?: {
      adm1?: unknown;
      adm2?: unknown;
    } | null;
  } | null;
};

/**
 * Limits Kiosk credential management to active employees with an admin profile.
 * This is a display/operational filter only; it does not change credentials.
 */
export function isKioskCredentialEligible(user: KioskCredentialUser) {
  const funcionario = user.funcionario;
  return funcionario?.ativo === true
    && (funcionario.perfis?.adm1 === true || funcionario.perfis?.adm2 === true);
}

export function kioskCredentialEligibleUsers<T extends KioskCredentialUser>(users: T[]) {
  return users.filter(isKioskCredentialEligible);
}
