import { Backdrop, Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { clearPwaUpdateError, subscribePwaStatus } from '../pwa/pwaClient';
import Corvo from './corvo/Corvo';

type OverlayState = {
  updating: boolean;
  updateError?: string;
};

// Aviso de versão nova do painel: o corvo teclando enquanto atualiza e o corvo gritando se a atualização falhar.
// O card é claro porque o corvo é escuro.
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
    <Backdrop open={open} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}>
      <Box textAlign="center" px={3.5} py={2.5} bgcolor="background.paper" color="text.primary" borderRadius={3} maxWidth={320}>
        {open && (state.updateError ? (
          <Stack spacing={1} alignItems="center" role="alert">
            <Corvo animacao="grito" pixel={3} />
            <Typography variant="h6">Falha ao atualizar</Typography>
            <Typography variant="body2" color="text.secondary">{state.updateError}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} pt={1}>
              <Button variant="contained" onClick={handleReload}>
                Recarregar agora
              </Button>
              <Button variant="outlined" onClick={handleDismiss}>
                Fechar
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={0.5} alignItems="center" role="status">
            <Corvo animacao="teclando" pixel={3} />
            <Typography variant="h6">Atualizando… aguarde</Typography>
            <Typography variant="body2" color="text.secondary">Chegou uma versão nova do painel.</Typography>
          </Stack>
        ))}
      </Box>
    </Backdrop>
  );
}
