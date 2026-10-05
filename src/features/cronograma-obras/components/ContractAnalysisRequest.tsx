import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useState } from 'react';
import type { ContratoCronograma } from '../domain/models';
import { buildContractAnalysisRequest } from '../domain/buildContractAnalysisRequest';

type Props = { contrato: ContratoCronograma };

export function ContractAnalysisRequest({ contrato }: Props) {
  const [open, setOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const request = buildContractAnalysisRequest(contrato.rawDocument);

  const close = () => { setOpen(false); setCopyFeedback(null); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request);
      setCopyFeedback('Pedido copiado');
    } catch {
      setCopyFeedback('Não foi possível copiar o pedido. Copie o texto manualmente.');
    }
  };

  return <>
    <button type="button" className="co-contract-analysis-request" onClick={(event) => { event.stopPropagation(); setCopyFeedback(null); setOpen(true); }}>Gerar pedido</button>
    <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="contract-analysis-request-title">
      <DialogTitle id="contract-analysis-request-title">Pedido de análise de contrato</DialogTitle>
      <DialogContent dividers>
        <TextField aria-label="Pedido de análise de contrato" value={request} multiline minRows={7} fullWidth slotProps={{ input: { readOnly: true } }} />
        {copyFeedback && <Alert severity={copyFeedback === 'Pedido copiado' ? 'success' : 'error'} sx={{ mt: 2 }}>{copyFeedback}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void copy()}>Copiar pedido</Button>
        <Button onClick={close}>Fechar</Button>
      </DialogActions>
    </Dialog>
  </>;
}
