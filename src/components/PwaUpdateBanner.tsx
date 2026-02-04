import { Alert, Button, Snackbar } from '@mui/material';
import { useEffect, useState } from 'react';
import { requestPwaUpdate, subscribePwaStatus } from '../pwa/pwaClient';

type PwaBannerState = {
  offlineReady: boolean;
  needRefresh: boolean;
  updateServiceWorker?: (reloadPage?: boolean) => void;
};

export default function PwaUpdateBanner() {
  const [pwaState, setPwaState] = useState<PwaBannerState>({
    offlineReady: false,
    needRefresh: false,
  });

  useEffect(() => {
    const unsubscribe = subscribePwaStatus((status) => {
      setPwaState(status);
      if (status.offlineReady) {
        console.log('App pronto para uso offline.');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleRefresh = () => {
    requestPwaUpdate(true);
  };

  const handleClose = () => {
    setPwaState((prev) => ({ ...prev, needRefresh: false }));
  };

  return (
    <Snackbar
      open={pwaState.needRefresh}
      onClose={handleClose}
      autoHideDuration={null}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        variant="filled"
        action={
          <>
            <Button color="inherit" size="small" onClick={handleRefresh}>
              Atualizar agora
            </Button>
            <Button color="inherit" size="small" onClick={handleClose}>
              Depois
            </Button>
          </>
        }
      >
        Nova versão disponível.
      </Alert>
    </Snackbar>
  );
}