import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useEffect, useState } from 'react';
import useOnlineStatus from '../hooks/useOnlineStatus';

type BannerSeverity = 'success' | 'warning' | 'info' | 'error';

type BannerState = {
  open: boolean;
  message: string;
  severity: BannerSeverity;
  autoHideDuration?: number | null;
};

export default function NetworkStatusBanner() {
  const { isOnline } = useOnlineStatus();
  const [banner, setBanner] = useState<BannerState>({
    open: !isOnline,
    message: 'Você está offline. Algumas informações podem estar desatualizadas.',
    severity: 'warning',
    autoHideDuration: null,
  });

  useEffect(() => {
    if (isOnline) {
      setBanner({
        open: true,
        message: 'Conexão restabelecida.',
        severity: 'success',
        autoHideDuration: 3000,
      });
    } else {
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