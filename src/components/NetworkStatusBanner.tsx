import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useOnlineStatus from '../hooks/useOnlineStatus';

type BannerSeverity = 'success' | 'warning' | 'info' | 'error';

type BannerState = {
  open: boolean;
  message: string;
  severity: BannerSeverity;
  autoHideDuration?: number | null;
};

export default function NetworkStatusBanner() {
  const { pathname } = useLocation();
  const { isOnline } = useOnlineStatus();
  const [banner, setBanner] = useState<BannerState>({
    open: !isOnline,
    message: 'Você está offline. Algumas informações podem estar desatualizadas.',
    severity: 'warning',
    autoHideDuration: null,
  });

  // "Conexão restabelecida" só depois de ter ficado offline, não a cada carregamento da página.
  const wasOffline = useRef(!isOnline);

  useEffect(() => {
    if (isOnline) {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      setBanner({
        open: true,
        message: 'Conexão restabelecida.',
        severity: 'success',
        autoHideDuration: 3000,
      });
    } else {
      wasOffline.current = true;
      setBanner({
        open: true,
        message: 'Você está offline. Algumas informações podem estar desatualizadas.',
        severity: 'warning',
        autoHideDuration: null,
      });
    }
  }, [isOnline]);

  const handleClose = (_?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setBanner((current) => ({ ...current, open: false }));
  };

  // A área DEV cobre a tela inteira e mostra a rede no próprio boot.
  if (pathname === '/dev') return null;

  return (
    <Snackbar
      open={banner.open}
      onClose={handleClose}
      autoHideDuration={banner.autoHideDuration ?? undefined}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={banner.severity} onClose={handleClose} variant="filled">
        {banner.message}
      </Alert>
    </Snackbar>
  );
}