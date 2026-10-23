import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Container, Stack } from '@mui/material';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { checklistIdDaAtividade } from '../services/checklists.service';

/** Old link /registros/:atividadeId/checklist → the checklist converted from that activity (checklists-v2.atividadeOrigemId). */
export default function ChecklistLegadoRedirect() {
  const { atividadeId = '' } = useParams();
  const navigate = useNavigate();
  const [destino, setDestino] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    checklistIdDaAtividade(atividadeId).then((id) => active && setDestino(id)).catch(() => active && setDestino(null));
    return () => { active = false; };
  }, [atividadeId]);

  if (destino === undefined) return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  if (destino) return <Navigate to={`/checklists/${encodeURIComponent(destino)}`} replace />;
  return (
    <Container sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Alert severity="warning">Esta atividade não tem checklist. Os checklists ficam agora na área Checklists.</Alert>
        <Button variant="outlined" onClick={() => navigate('/checklists')}>Ir para Checklists</Button>
      </Stack>
    </Container>
  );
}
