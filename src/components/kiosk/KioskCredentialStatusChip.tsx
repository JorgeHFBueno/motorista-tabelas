import { Chip } from '@mui/material';
import type { KioskCredentialStatus } from '../../services/kioskCredentials';
import { pinStatusLabel, qrStatusLabel } from '../../services/kioskCredentialsUtils';

export function KioskQrStatusChip({ status }: { status?: KioskCredentialStatus }) {
  const label = qrStatusLabel(status);
  return <Chip size="small" label={label} color={label === 'Ativo' ? 'success' : label === 'Revogado' ? 'error' : 'default'} variant={label === 'Ativo' ? 'filled' : 'outlined'} />;
}

export function KioskPinStatusChip({ status }: { status?: KioskCredentialStatus }) {
  const label = pinStatusLabel(status);
  return <Chip size="small" label={label} color={label === 'Ativo' ? 'success' : 'default'} variant={label === 'Ativo' ? 'filled' : 'outlined'} />;
}
