import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { conectarAgenda, desconectarAgenda, RESULTADO_CONEXAO, sincronizarAgenda, statusAgenda, type StatusAgenda } from '../services/googleAgenda';

const ERROS = {
  reconectar: 'O Google não aceita mais a autorização (foi removida ou venceu). Conecte de novo.',
  agenda_apagada: 'A agenda “Friday” foi apagada no Google. Conecte de novo para criar outra.',
};

const mensagem = (e: unknown) => (e instanceof Error ? e.message : 'Erro ao falar com o servidor.');

// Meu perfil → Google Agenda (só para quem entra no Friday).
export default function GoogleAgendaCartao() {
  const [params, setParams] = useSearchParams();
  const [resultado] = useState(() => RESULTADO_CONEXAO[params.get('agenda') ?? ''] ?? null);
  const [status, setStatus] = useState<StatusAgenda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const carregar = useCallback(() => statusAgenda().then(setStatus).catch((e: unknown) => setAviso({ tipo: 'error', texto: mensagem(e) })), []);
  useEffect(() => { void carregar(); }, [carregar]);
  // O resultado da volta do Google aparece uma vez; o endereço fica limpo.
  useEffect(() => {
    if (!params.has('agenda')) return;
    const p = new URLSearchParams(params); p.delete('agenda'); setParams(p, { replace: true });
  }, [params, setParams]);

  const agir = async (acao: () => Promise<unknown>, ok?: string) => {
    setOcupado(true); setAviso(null);
    try { await acao(); if (ok) setAviso({ tipo: 'success', texto: ok }); await carregar(); } catch (e: unknown) { setAviso({ tipo: 'error', texto: mensagem(e) }); } finally { setOcupado(false); }
  };

  const conectar = () => agir(conectarAgenda);
  const erro = status?.conectado ? status.erro : null;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <EventOutlinedIcon color="action" />
        <Typography variant="h6">Google Agenda</Typography>
      </Stack>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Os itens do Friday com data em que você é a pessoa responsável aparecem na agenda “Friday” do seu Google Agenda.
          Cada quadro escolhe as colunas de pessoa e de data no menu “…” do quadro → Google Agenda.
        </Typography>
        {resultado && <Alert severity={resultado.tipo}>{resultado.texto}</Alert>}
        {aviso && <Alert severity={aviso.tipo}>{aviso.texto}</Alert>}
        {!status ? (
          !aviso && <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography variant="body2">Carregando...</Typography></Stack>
        ) : !status.conectado ? (
          <>
            <Alert severity="info">
              Ao conectar, o Google pode avisar que o app não foi verificado: clique em “Avançado” e depois em continuar.
              O sistema só mexe na agenda “Friday”, que ele mesmo cria.
            </Alert>
            <Stack direction="row" justifyContent="flex-end">
              <Button variant="contained" disabled={ocupado} onClick={conectar}>Conectar Google Agenda</Button>
            </Stack>
          </>
        ) : (
          <>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
              <Chip color={erro ? 'warning' : 'success'} label={erro ? 'Precisa reconectar' : 'Conectado'} size="small" />
              {status.email && <Typography variant="body2">{status.email}</Typography>}
              {status.sincronizando && !erro && <Typography variant="body2" color="text.secondary">Sincronizando…</Typography>}
            </Stack>
            {erro && <Alert severity="warning">{ERROS[erro]}</Alert>}
            <Stack direction="row" spacing={1} justifyContent="flex-end" useFlexGap flexWrap="wrap">
              <Button color="error" disabled={ocupado} onClick={() => agir(desconectarAgenda, 'Google Agenda desconectado. A agenda “Friday” foi apagada.')}>Desconectar</Button>
              {erro
                ? <Button variant="contained" disabled={ocupado} onClick={conectar}>Conectar de novo</Button>
                : <Button variant="outlined" disabled={ocupado || status.sincronizando} onClick={() => agir(sincronizarAgenda, 'Sincronização pedida. Os itens são regravados em alguns minutos.')}>Sincronizar de novo</Button>}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
