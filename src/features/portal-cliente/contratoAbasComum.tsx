import type { ReactNode } from 'react';
import { Alert, Box, Button, Snackbar, Stack, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { formatarBytes } from './contratoConteudoDominio';

// Pieces shared by the Documentos, Fotos and Parcelas tabs of the portal contract page.

export type Aviso = { severity: 'success' | 'error'; message: string } | null;

export function AvisoSnackbar({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  return (
    <Snackbar open={Boolean(aviso)} autoHideDuration={5000} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={onClose} severity={aviso?.severity ?? 'success'} variant="filled">{aviso?.message}</Alert>
    </Snackbar>
  );
}

/** Title, the trash toggle and the tab's own actions. */
export function CabecalhoAba({
  titulo,
  lixeira,
  quantidadeLixeira,
  onAlternarLixeira,
  children,
}: {
  titulo: string;
  lixeira: boolean;
  quantidadeLixeira: number;
  onAlternarLixeira: () => void;
  children?: ReactNode;
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
      <Typography variant="h6">{lixeira ? `${titulo} na lixeira` : titulo}</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {children}
        <Button variant={lixeira ? 'contained' : 'outlined'} color="inherit" startIcon={<DeleteOutlineIcon />} onClick={onAlternarLixeira}>
          {lixeira ? 'Sair da lixeira' : `Lixeira (${quantidadeLixeira})`}
        </Button>
      </Stack>
    </Stack>
  );
}

/** File picker for a dialog: shows the chosen file and whether it passes the size limit. */
export function SeletorArquivo({
  arquivo,
  onChange,
  accept,
  limiteBytes,
  rotulo = 'Escolher arquivo',
  disabled,
}: {
  arquivo: File | null;
  onChange: (arquivo: File | null) => void;
  accept?: string;
  limiteBytes: number;
  rotulo?: string;
  disabled?: boolean;
}) {
  const grandeDemais = Boolean(arquivo && arquivo.size > limiteBytes);
  return (
    <Box>
      <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} disabled={disabled}>
        {rotulo}
        <input hidden type="file" accept={accept} onChange={(event) => { onChange(event.target.files?.[0] ?? null); event.target.value = ''; }} />
      </Button>
      <Typography variant="body2" color={grandeDemais ? 'error' : 'text.secondary'} sx={{ mt: 1, overflowWrap: 'anywhere' }}>
        {arquivo
          ? `${arquivo.name} · ${formatarBytes(arquivo.size)}${grandeDemais ? ` (passa do limite de ${formatarBytes(limiteBytes)})` : ''}`
          : `Nenhum arquivo escolhido. Limite: ${formatarBytes(limiteBytes)}.`}
      </Typography>
    </Box>
  );
}

export const Vazio = ({ children }: { children: ReactNode }) => <Typography color="text.secondary" sx={{ py: 2 }}>{children}</Typography>;
