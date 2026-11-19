import { Alert, Button } from '@mui/material';
import { useFilaEnvio } from '../data/filaEnvio';

/**
 * No início de /motorista, para o mecânico: liga a fila do checklist ao abrir o app (o envio não espera abrir o
 * Checklist) e avisa o que ainda não foi enviado.
 */
export default function AvisoChecklistsPendentes() {
  const fila = useFilaEnvio();
  if (fila.pendentes === 0) return null;
  return (
    <Alert severity="warning" action={<Button color="inherit" size="small" href="/motorista/checklist">Ver</Button>}>
      {fila.pendentes === 1 ? '1 checklist aguardando envio.' : `${fila.pendentes} checklists aguardando envio.`}
    </Alert>
  );
}
