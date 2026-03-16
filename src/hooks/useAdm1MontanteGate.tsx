import { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { getAdm1MontanteReference } from '../services/combustivel.service';

const INVALID_MONTANTE_MESSAGE = 'Montante errado, tente novamente ou entre em contato com administração';
const UNAVAILABLE_MESSAGE = 'Validação de montante indisponível no momento. Tente novamente.';

export function useAdm1MontanteGate(isAdm1: boolean) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const requestAccess = useCallback(
    (onAllowed: () => void) => {
      if (!isAdm1) {
        onAllowed();
        return;
      }

      setInputValue('');
      setError(null);
      setPendingAction(() => onAllowed);
      setOpen(true);
    },
    [isAdm1],
  );

  const handleClose = useCallback(() => {
    if (verifying) return;
    setOpen(false);
    setInputValue('');
    setError(null);
    setPendingAction(null);
  }, [verifying]);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) {
      setOpen(false);
      return;
    }

    const normalizedInput = inputValue.replace(',', '.').trim();
    const informedValue = Number(normalizedInput);

    if (!normalizedInput || !Number.isFinite(informedValue)) {
      setError(INVALID_MONTANTE_MESSAGE);
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      const { montanteBase, folga } = await getAdm1MontanteReference();
      const isValid = Math.abs(informedValue - montanteBase) <= folga;

      if (!isValid) {
        setError(INVALID_MONTANTE_MESSAGE);
        return;
      }

      pendingAction();
      setOpen(false);
      setInputValue('');
      setPendingAction(null);
    } catch {
      setError(UNAVAILABLE_MESSAGE);
    } finally {
      setVerifying(false);
    }
  }, [inputValue, pendingAction]);

  const dialog = useMemo(
    () => (
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle>Verificação de montante</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            type="number"
            label="Montante"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={verifying}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={verifying}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={() => void handleConfirm()} disabled={verifying}>
            Verificar
          </Button>
        </DialogActions>
      </Dialog>
    ),
    [error, handleClose, handleConfirm, inputValue, open, verifying],
  );

  return { requestAccess, dialog };
}