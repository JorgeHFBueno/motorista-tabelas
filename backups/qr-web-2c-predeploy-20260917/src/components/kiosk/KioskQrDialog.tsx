import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { toDataURL } from 'qrcode';
import { sanitizeKioskFilename } from '../../services/kioskCredentialsUtils';

type KioskQrDialogProps = {
  credential: { uid: string; nome: string; qrPayload: string; replaced: boolean } | null;
  onClose: () => void;
};

export default function KioskQrDialog({ credential, onClose }: KioskQrDialogProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    if (credential) {
      void toDataURL(credential.qrPayload, { errorCorrectionLevel: 'M', margin: 4, width: 720, color: { dark: '#000000', light: '#FFFFFF' } })
        .then((url) => { if (active) setDataUrl(url); });
    }
    return () => { active = false; setDataUrl(null); };
  }, [credential]);

  const download = () => {
    if (!credential || !dataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = sanitizeKioskFilename(credential.uid);
    anchor.click();
  };

  const print = () => {
    if (!credential || !dataUrl) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    popup.document.write(`<html><head><title>Credencial Kiosk</title></head><body style="font-family:sans-serif;text-align:center"><h1>Credencial Kiosk</h1><p>${credential.nome.replace(/[<>&"']/g, '')}</p><p>${credential.uid.replace(/[<>&"']/g, '')}</p><img alt="QR Code" src="${dataUrl}" style="width:420px;max-width:100%"></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return <Dialog open={Boolean(credential)} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Credencial Kiosk</DialogTitle>
    <DialogContent>
      <Stack spacing={2} alignItems="center">
        {credential?.replaced && <Alert severity="warning">Novo QR emitido. O QR anterior não é mais válido.</Alert>}
        <Alert severity="info">Este QR é exibido apenas uma vez. Salve ou imprima antes de fechar.</Alert>
        <Typography align="center">{credential?.nome}<br /><Typography component="span" variant="body2" color="text.secondary">{credential?.uid}</Typography></Typography>
        <Box sx={{ bgcolor: 'white', p: 2, minHeight: 260, display: 'grid', placeItems: 'center' }}>
          {dataUrl ? <img src={dataUrl} alt="QR Code da credencial Kiosk" width="100%" style={{ maxWidth: 360, display: 'block' }} /> : 'Gerando QR Code...'}
        </Box>
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={download} disabled={!dataUrl}>Salvar PNG</Button><Button onClick={print} disabled={!dataUrl}>Imprimir</Button><Button onClick={onClose}>Fechar</Button></DialogActions>
  </Dialog>;
}
