import { Backdrop, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { clearPwaUpdateError, subscribePwaStatus } from '../pwa/pwaClient';

type OverlayState = {
  updating: boolean;
  updateError?: string;
};

export default function PwaUpdateOverlay() {
  const [state, setState] = useState<OverlayState>({ updating: false });

  useEffect(() => {
    const unsubscribe = subscribePwaStatus((status) => {
      setState({ updating: status.updating, updateError: status.updateError });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  const handleDismiss = () => {
    clearPwaUpdateError();
  };

  const open = state.updating || Boolean(state.updateError);

  return (
    <Backdrop open={open} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.modal + 1 }}>
      <Box textAlign="center" px={3} py={2} bgcolor="rgba(0, 0, 0, 0.7)" borderRadius={2}>
        {state.updateError ? (
          <Stack spacing={2} alignItems="center">
            <Typography variant="h6">Falha ao atualizar</Typography>
            <Typography variant="body2">{state.updateError}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" color="inherit" onClick={handleReload}>
                Recarregar agora
              </Button>
              <Button variant="outlined" color="inherit" onClick={handleDismiss}>
                Fechar
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} alignItems="center">
            <CircularProgress color="inherit" />
            <Typography variant="h6">Atualizando… aguarde</Typography>
          </Stack>
        )}
      </Box>
    </Backdrop>
  );
}