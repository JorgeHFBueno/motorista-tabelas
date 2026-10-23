export type KioskCredentialUser = {
  uid: string;
  funcionario?: {
    ativo?: unknown;
    credenciais?: { frentista?: unknown; adm2?: unknown } | null;
  } | null;
};

/**
 * Kiosk credentials (QR/PIN) are for active employees with frentista (or adm2), as the Kiosk Functions require.
 * This is a display/operational filter only; it does not change credentials.
 */
export function isKioskCredentialEligible(user: KioskCredentialUser) {
  const funcionario = user.funcionario;
  return funcionario?.ativo === true
    && (funcionario.credenciais?.frentista === true || funcionario.credenciais?.adm2 === true);
}

export function kioskCredentialEligibleUsers<T extends KioskCredentialUser>(users: T[]) {
  return users.filter(isKioskCredentialEligible);
}
