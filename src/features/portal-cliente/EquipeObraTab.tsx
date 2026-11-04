import { useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { salvarEquipe, type MomentoEquipe } from './contratosPortalData';
import { confirmacaoDe, dataHoraParaInput, formatarDataHora, inputParaDataHora } from './contratosPortalDominio';
import { usePessoaAtual } from './portalArquivos';
import type { ContratoPortal } from './portalDominio';

// Team departure and arrival shown to the client (portal-obras.equipe, The Manuscript portal.md, "Saída e chegada da
// equipe"): confirmed by hand by adm2, in Brasília time.

const TITULOS: Record<MomentoEquipe, string> = {
  saida: 'Saída da equipe para a obra',
  chegada: 'Chegada da equipe na obra',
};

function CartaoMomento({ contrato, momento }: { contrato: ContratoPortal; momento: MomentoEquipe }) {
  const pessoa = usePessoaAtual();
  const confirmacao = confirmacaoDe(contrato.equipe?.[momento]);
  const [valor, setValor] = useState(() => (confirmacao ? dataHoraParaInput(confirmacao.dataHora) : ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const dataHora = inputParaDataHora(valor);

  const gravar = async (nova: Date | null) => {
    if (!pessoa) return;
    if (!nova && !window.confirm(`Limpar a ${momento === 'saida' ? 'saída' : 'chegada'} da equipe? O cliente volta a ver "pendente".`)) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarEquipe(contrato.id, momento, nova, pessoa);
      if (!nova) setValor('');
      setAviso(nova ? 'Confirmado.' : 'Removido.');
    } catch (err) {
      console.error('Erro ao gravar a equipe do contrato', err);
      setErro('Não foi possível gravar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, flex: 1, minWidth: 0 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
          <Box minWidth={0}>
            <Typography variant="h6">{TITULOS[momento]}</Typography>
            <Typography variant="body2" color="text.secondary">
              {confirmacao ? formatarDataHora(confirmacao.dataHora) : 'Pendente de confirmação'}
            </Typography>
          </Box>
          <Chip size="small" color={confirmacao ? 'success' : 'default'} variant={confirmacao ? 'filled' : 'outlined'} label={confirmacao ? 'Confirmado' : 'Pendente'} />
        </Stack>
        {confirmacao && (
          <Typography variant="body2" color="text.secondary">
            Registrado por {confirmacao.confirmadoPor?.nome || 'Equipe'}
            {confirmacao.confirmadoEm ? ` em ${formatarDataHora(confirmacao.confirmadoEm)}` : ''}.
          </Typography>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            size="small"
            type="datetime-local"
            label="Data e hora (Brasília)"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            disabled={salvando}
            error={!!valor && !dataHora}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: 1 }}
          />
          <Button onClick={() => setValor(dataHoraParaInput(new Date()))} disabled={salvando}>Usar agora</Button>
        </Stack>
        {erro && <Alert severity="error">{erro}</Alert>}
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button color="error" onClick={() => void gravar(null)} disabled={salvando || !confirmacao || !pessoa}>Limpar</Button>
          <Button variant="contained" onClick={() => void gravar(dataHora)} disabled={salvando || !dataHora || !pessoa}>
            {salvando ? 'Gravando…' : 'Confirmar'}
          </Button>
        </Stack>
      </Stack>
      <Snackbar open={!!aviso} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} />
    </Paper>
  );
}

export default function EquipeObraTab({ contrato }: { contrato: ContratoPortal }) {
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        O cliente vê a data e a hora confirmadas e quem confirmou. Sem ligação, por enquanto, com as atividades do app dos motoristas.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <CartaoMomento contrato={contrato} momento="saida" />
        <CartaoMomento contrato={contrato} momento="chegada" />
      </Stack>
    </Stack>
  );
}
