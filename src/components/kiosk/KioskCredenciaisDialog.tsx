import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import KioskQrDialog from './KioskQrDialog';
import { KioskPinStatusChip, KioskQrStatusChip } from './KioskCredentialStatusChip';
import { getKioskCredentialStatus, provisionKioskCredential, revokeKioskQr, setKioskPin, setKioskPinEnabled, type KioskCredentialStatus, type ProvisionKioskCredentialResponse } from '../../services/kioskCredentials';
import { formatKioskUpdatedAt, kioskFunctionErrorMessage } from '../../services/kioskCredentialsUtils';
import { nomeDoUsuario, type AdminUser } from '../../services/adminUsersApi';

type AcaoQr = 'provision' | 'revoke' | null;
type AcaoPin = 'set' | 'change' | 'disable' | 'enable' | null;

const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <Stack spacing={0.5} sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">{rotulo}</Typography>
    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
  </Stack>
);

// Kiosk QR and PIN of one employee, opened from the Ações column in Usuários (the /cadastros/usuarios/kiosk screen was merged
// here on 2026-11-10). The Kiosk Functions check escritorio themselves; only active frentista/adm2 get the button.
export default function KioskCredenciaisDialog({ user, onClose, onAviso }: { user: AdminUser | null; onClose: () => void; onAviso: (mensagem: string, erro?: boolean) => void }) {
  const [status, setStatus] = useState<KioskCredentialStatus | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [acaoQr, setAcaoQr] = useState<AcaoQr>(null);
  const [acaoPin, setAcaoPin] = useState<AcaoPin>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [qrEmitido, setQrEmitido] = useState<ProvisionKioskCredentialResponse | null>(null);
  const uid = user?.uid;
  const nome = user ? nomeDoUsuario(user) : '';

  const carregar = useCallback(async () => {
    if (!uid) return;
    setCarregando(true); setErro(null);
    try { setStatus((await getKioskCredentialStatus([uid]))[0] ?? null); }
    catch (e) { setErro(kioskFunctionErrorMessage(e)); }
    finally { setCarregando(false); }
  }, [uid]);

  useEffect(() => { setStatus(null); if (uid) void carregar(); }, [uid, carregar]);

  const limparPin = () => { setPin(''); setConfirmPin(''); };
  const fecharPin = () => { if (!enviando) { setAcaoPin(null); limparPin(); } };
  const qrConfigurado = status?.qrConfigured === true;
  const qrAtivo = qrConfigurado && status?.qrRevoked !== true;
  const pinConfigurado = status?.pinConfigured === true;
  const pinAtivo = pinConfigurado && status?.pinEnabled === true;
  const pinDigitado = acaoPin === 'set' || acaoPin === 'change';
  const pinValido = /^\d{6}$/.test(pin) && pin === confirmPin;

  const confirmarQr = async () => {
    if (!uid || !acaoQr || enviando) return;
    setEnviando(true);
    try {
      if (acaoQr === 'provision') { const r = await provisionKioskCredential(uid); setQrEmitido(r); onAviso(r.replaced ? 'Novo QR emitido.' : 'QR emitido.'); }
      else { await revokeKioskQr(uid); onAviso('QR revogado com sucesso.'); }
      setAcaoQr(null); await carregar();
    } catch (e) { onAviso(kioskFunctionErrorMessage(e), true); }
    finally { setEnviando(false); }
  };

  const confirmarPin = async () => {
    if (!uid || !acaoPin || enviando || (pinDigitado && !pinValido)) return;
    setEnviando(true);
    try {
      if (pinDigitado) { await setKioskPin(uid, pin); onAviso(acaoPin === 'change' ? 'PIN alterado com sucesso.' : 'PIN definido com sucesso.'); }
      else { await setKioskPinEnabled(uid, acaoPin === 'enable'); onAviso(acaoPin === 'enable' ? 'PIN reativado com sucesso.' : 'PIN desativado com sucesso.'); }
      limparPin(); setAcaoPin(null); await carregar();
    } catch (e) { limparPin(); onAviso(kioskFunctionErrorMessage(e), true); }
    finally { setEnviando(false); }
  };

  const tituloPin = acaoPin === 'set' ? 'Definir PIN' : acaoPin === 'change' ? 'Alterar PIN' : acaoPin === 'disable' ? 'Desativar PIN' : 'Reativar PIN';
  const textoPin = acaoPin === 'disable' ? 'O funcionário não poderá entrar no Kiosk usando este PIN até que ele seja reativado ou substituído.'
    : acaoPin === 'enable' ? 'O PIN atualmente configurado voltará a funcionar.'
      : acaoPin === 'change' ? 'O PIN anterior deixará de funcionar imediatamente.' : 'Informe um novo PIN de 6 dígitos. Ele não será exibido novamente.';
  const camposPin = { inputMode: 'numeric' as const, autoComplete: 'new-password', maxLength: 6 };

  return (
    <>
      <Dialog open={Boolean(user)} onClose={enviando ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>Kiosk — {nome}</DialogTitle>
        <DialogContent>
          {erro && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => void carregar()}>Tentar novamente</Button>}>{erro}</Alert>}
          {carregando && !status ? (
            <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /></Stack>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 3, rowGap: 2.5, pt: 1 }}>
              <Campo rotulo="Atualizado em"><Typography variant="body2">{formatKioskUpdatedAt(status?.updatedAt)}</Typography></Campo>
              <Campo rotulo="Atualizado por"><Typography variant="body2">{status?.updatedBy ?? '—'}</Typography></Campo>
              <Campo rotulo="QR"><KioskQrStatusChip status={status ?? undefined} /></Campo>
              <Campo rotulo="PIN"><KioskPinStatusChip status={status ?? undefined} /></Campo>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
                <Button size="small" variant="outlined" disabled={!status} onClick={() => setAcaoQr('provision')}>{qrAtivo ? 'Substituir QR' : qrConfigurado ? 'Emitir novo QR' : 'Emitir QR'}</Button>
                {qrAtivo && <Button size="small" variant="outlined" color="error" onClick={() => setAcaoQr('revoke')}>Revogar QR</Button>}
              </Stack>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
                <Button size="small" variant="outlined" disabled={!status} onClick={() => setAcaoPin(pinConfigurado ? 'change' : 'set')}>{pinConfigurado ? 'Alterar PIN' : 'Definir PIN'}</Button>
                {pinAtivo && <Button size="small" variant="outlined" color="error" onClick={() => setAcaoPin('disable')}>Desativar PIN</Button>}
                {pinConfigurado && !pinAtivo && <Button size="small" variant="outlined" onClick={() => setAcaoPin('enable')}>Reativar PIN</Button>}
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions><Button onClick={onClose} disabled={enviando}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(acaoQr)} onClose={() => !enviando && setAcaoQr(null)}>
        <DialogTitle>{acaoQr === 'revoke' ? `Revogar QR de ${nome}?` : `${qrAtivo ? 'Substituir' : 'Emitir'} QR para ${nome}?`}</DialogTitle>
        <DialogContent><Typography>{acaoQr === 'revoke' ? 'O QR atual deixará de autenticar no Kiosk.' : qrAtivo ? 'O QR atualmente utilizado deixará de funcionar imediatamente após a substituição.' : 'O QR será exibido apenas uma vez. Salve ou imprima antes de fechar.'}</Typography></DialogContent>
        <DialogActions>
          <Button disabled={enviando} onClick={() => setAcaoQr(null)}>Cancelar</Button>
          <Button variant="contained" color={acaoQr === 'revoke' ? 'error' : 'primary'} disabled={enviando} onClick={() => void confirmarQr()}>{enviando ? 'Aguarde...' : 'Confirmar'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(acaoPin)} onClose={fecharPin}>
        <DialogTitle>{tituloPin} de {nome}{pinDigitado ? '' : '?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{textoPin}</Typography>
          {pinDigitado && (
            <Stack spacing={2}>
              <TextField label="Novo PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={camposPin} fullWidth autoFocus />
              <TextField label="Confirmar PIN" type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={camposPin} fullWidth
                error={confirmPin.length > 0 && pin !== confirmPin} helperText={confirmPin.length > 0 && pin !== confirmPin ? 'Os PINs devem ser iguais.' : ' '} />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={enviando} onClick={fecharPin}>Cancelar</Button>
          <Button variant="contained" color={acaoPin === 'disable' ? 'error' : 'primary'} disabled={enviando || (pinDigitado && !pinValido)} onClick={() => void confirmarPin()}>{enviando ? 'Aguarde...' : 'Confirmar'}</Button>
        </DialogActions>
      </Dialog>

      <KioskQrDialog credential={qrEmitido} onClose={() => setQrEmitido(null)} />
    </>
  );
}
