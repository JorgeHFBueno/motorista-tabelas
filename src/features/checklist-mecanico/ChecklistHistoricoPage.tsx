import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { Checklist } from '../../services/checklist-normalizer';
import { listarChecklistsDoAutor } from './data/checklistFirestore';
import { enviador, useFilaEnvio } from './data/filaEnvio';
import type { ChecklistPendente } from './domain/rascunho';
import { totais } from './domain/regras';

const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const avarias = (n: number) => (n === 1 ? '1 avaria' : `${n} avarias`);

/** /checklist/historico: os checklists que o mecânico fez, com os ainda não enviados deste aparelho no topo. */
export default function ChecklistHistoricoPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const fila = useFilaEnvio();
  const [pendentes, setPendentes] = useState<ChecklistPendente[]>([]);
  const [lista, setLista] = useState<Checklist[] | null>(null);
  const [erro, setErro] = useState(false);
  const uid = currentUser?.uid;

  const carregar = useCallback(async () => {
    if (!uid) return;
    setErro(false);
    setLista(null);
    try {
      setLista(await listarChecklistsDoAutor(uid));
    } catch (error) {
      console.error('Checklist: falha ao carregar o histórico', error);
      setErro(true);
    }
  }, [uid]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Os pendentes mudam com a fila: um enviado sai do topo e aparece na lista.
  const anterior = useRef(fila.pendentes);
  useEffect(() => {
    void enviador.pendentesDoUsuario().then(setPendentes);
    if (fila.pendentes < anterior.current) void carregar();
    anterior.current = fila.pendentes;
  }, [fila.pendentes, carregar]);

  const enviados = new Set(lista?.map((c) => c.id));
  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/checklist')}>Checklist</Button>
        <Typography variant="h5" fontWeight={800}>Histórico</Typography>
      </Stack>
      <Stack spacing={1.5}>
        {pendentes.filter((p) => !enviados.has(p.rascunho.id)).map((p) => (
          <Card key={p.rascunho.id} variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box>
                  <Typography fontWeight={700}>{p.rascunho.veiculo.identificador} · {p.rascunho.tipo === 'saida' ? 'Saída' : 'Chegada'}</Typography>
                  <Typography variant="body2" color="text.secondary">{dataHora.format(p.concluidoEm)} · {avarias(totais(p.rascunho).avaria)}</Typography>
                </Box>
                <Chip size="small" color="warning" label="Aguardando envio" />
              </Stack>
            </CardContent>
          </Card>
        ))}
        {erro && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void carregar()}>Tentar de novo</Button>}>
            Não foi possível carregar o histórico.
          </Alert>
        )}
        {!erro && lista == null && <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>}
        {lista?.length === 0 && pendentes.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nenhum checklist encontrado.</Typography>}
        {lista?.map((c) => (
          <Card key={c.id} variant="outlined">
            <CardActionArea onClick={() => navigate(`/checklist/historico/${encodeURIComponent(c.id)}`)}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight={700}>{c.placa || '—'} · {c.tipo === 'chegada' ? 'Chegada' : 'Saída'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {c.concluidoEm ? dataHora.format(c.concluidoEm) : '—'} · {avarias(c.totais.avaria)}
                    </Typography>
                    {c.motorista && <Typography variant="body2" color="text.secondary" noWrap>Motorista: {c.motorista}</Typography>}
                  </Box>
                  {c.totais.avaria > 0 && <Chip size="small" color="error" label={avarias(c.totais.avaria)} />}
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
