import { Alert, Button } from '@mui/material';
import { useFilaRevisao } from '../data/filaEnvio';

/** No início de /motorista, para o mecânico: revisões deste aparelho ainda não enviadas. Montado, já dispara o envio. */
export default function AvisoRevisoesPendentes() {
  const { pendentes, naoEnviadas } = useFilaRevisao();
  if (pendentes === 0 && naoEnviadas === 0) return null;
  const texto = naoEnviadas > 0
    ? (naoEnviadas === 1 ? '1 revisão não enviada.' : `${naoEnviadas} revisões não enviadas.`)
    : (pendentes === 1 ? '1 revisão aguardando envio.' : `${pendentes} revisões aguardando envio.`);
  return (
    <Alert severity={naoEnviadas > 0 ? 'error' : 'warning'} action={<Button color="inherit" size="small" href="/motorista/revisao/historico">Ver</Button>}>
      {texto}
    </Alert>
  );
}
