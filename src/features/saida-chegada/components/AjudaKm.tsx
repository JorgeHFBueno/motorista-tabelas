import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useState } from 'react';

// O aviso "Não coloque casas decimais" com o exemplo no (?), igual ao do app e do Kiosk
// (lib/core/widgets/medidor_ultimo_info.dart: MedidorUltimoInfo e mostrarExemploMedidor).

const INTEIROS = '012397';
const DECIMAL = '4';

function Digito({ valor, decimal = false }: { valor: string; decimal?: boolean }) {
  return (
    <Box
      sx={{
        width: 26, height: 38, mx: '1.5px', display: 'grid', placeItems: 'center', borderRadius: '3px',
        bgcolor: decimal ? '#C62828' : '#212121', color: '#fff', fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
        position: 'relative',
      }}
    >
      {valor}
      {/* Risco: o decimal fica de fora. */}
      {decimal && <Box sx={{ position: 'absolute', width: 40, height: 3, bgcolor: '#fff', transform: 'rotate(-46deg)' }} />}
    </Box>
  );
}

/** Painel desenhado: os números inteiros em preto e o decimal, separado, em vermelho e riscado. */
function PainelExemplo() {
  return (
    <Box role="img" aria-label="Painel mostrando 12397 vírgula 4" sx={{ display: 'inline-flex', alignItems: 'center', p: 1, bgcolor: '#424242', borderRadius: 2 }}>
      {INTEIROS.split('').map((d, i) => <Digito key={i} valor={d} />)}
      <Box sx={{ width: 4 }} />
      <Digito valor={DECIMAL} decimal />
    </Box>
  );
}

function Linha({ certo, texto }: { certo: boolean; texto: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {certo ? <CheckCircleIcon sx={{ color: '#2E7D32' }} /> : <CancelIcon sx={{ color: '#C62828' }} />}
      <Typography fontWeight={600}>{texto}</Typography>
    </Stack>
  );
}

export default function AjudaKm() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: -1 }}>
        <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: 1 }}>Não coloque casas decimais</Typography>
        <Tooltip title="Ver exemplo">
          <IconButton aria-label="Ver exemplo de como informar o KM" onClick={() => setAberto(true)}>
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <Dialog open={aberto} onClose={() => setAberto(false)}>
        <DialogTitle>Como informar o KM</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>No painel aparece:</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}><PainelExemplo /></Box>
          <Stack spacing={0.75} sx={{ mt: 2 }}>
            <Linha certo texto="Digite 12397" />
            <Linha certo={false} texto="Não digite 12397,4 nem 123974" />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            O último número, separado (geralmente em outra cor), é a casa decimal: deixe de fora.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setAberto(false)}>Entendi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
